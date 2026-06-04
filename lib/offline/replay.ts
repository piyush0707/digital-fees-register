// Day 7a — the SINGLE shared write path. One async fn per high-level user
// action (matches OpName in db.ts). Server actions in
// app/(app)/register/actions.ts delegate to these; the sync worker in
// lib/offline/sync.ts replays queued entries through the SAME fns with the
// browser Supabase client.
//
// Must NOT import next/cache (revalidatePath) or lib/supabase-server — these
// run in the browser too. All multi-step sequences (createFamily→createStudent,
// void-before-insert for term heads) live in here as one atomic unit per op.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  applyConcession,
  createFamily,
  createPayment,
  createStudent,
  linkStudentToFamily,
  nextRollFor,
  unlinkStudent,
  updateFamily,
  updateStudent,
  upsertFeeStructure,
  voidActivePayments,
  type ConcessionInput,
  type FamilyInput,
  type FeeStructureInput,
  type StudentInput,
} from "@/lib/queries";
import type { FeeHead, PaymentMode } from "@/lib/types";

// Discriminated-union return so call-sites can fork on ok cleanly.
//   idMap   — temp→real id swaps the worker must persist before replaying
//             subsequent pending entries.
//   data    — op-specific success payload (e.g. saveProfile returns new ids).
//   outcome — for toggle ops only (TOGGLE_ANNUAL, TOGGLE_PDUES_PAID), tells
//             the sync hand-off buffer which direction the toggle resolved
//             so the overlay can apply the outcome idempotently against a
//             refreshed snapshot. Phase 6a (UX race fix).
export type ReplayResult<T = unknown> =
  | {
      ok: true;
      idMap?: Record<string, string>;
      data?: T;
      outcome?: "set" | "cleared";
    }
  | { ok: false; error: string };

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// RECORD_MONTHLY — inline month cell. Void-then-insert keeps the partial
// UNIQUE happy (per-student / Monthly / period); amount=0 means "clear cell".
// ---------------------------------------------------------------------------
export interface RecordMonthlyPayload {
  studentId: string;
  period: string;
  amount: number;
}

export async function replayRecordMonthly(
  supabase: SupabaseClient,
  payload: RecordMonthlyPayload,
): Promise<ReplayResult> {
  if (!payload.studentId) return { ok: false, error: "Missing studentId" };
  if (!Number.isFinite(payload.amount) || payload.amount < 0) {
    return { ok: false, error: "Amount must be zero or positive" };
  }

  try {
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("family_id")
      .eq("id", payload.studentId)
      .maybeSingle();
    if (studentErr) return { ok: false, error: studentErr.message };
    const familyId = student?.family_id ?? null;

    const { error: voidErr } = await supabase
      .from("payments")
      .update({ status: "void" })
      .eq("student_id", payload.studentId)
      .eq("period", payload.period)
      .eq("fee_head", "Monthly")
      .eq("status", "active");
    if (voidErr) return { ok: false, error: voidErr.message };

    if (payload.amount > 0) {
      const { error: insertErr } = await supabase.from("payments").insert({
        family_id: familyId,
        student_id: payload.studentId,
        fee_head: "Monthly",
        period: payload.period,
        amount: payload.amount,
        payment_mode: "Cash",
      });
      if (insertErr) return { ok: false, error: insertErr.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// RECORD_EXAM — Sep Exam / Feb Exam cell, per-student post-migration 0004.
// ---------------------------------------------------------------------------
export interface RecordExamPayload {
  studentId: string;
  session: string;
  feeHead: "Sep Exam" | "Feb Exam";
  amount: number;
}

export async function replayRecordExam(
  supabase: SupabaseClient,
  payload: RecordExamPayload,
): Promise<ReplayResult> {
  if (!payload.studentId) return { ok: false, error: "Missing studentId" };
  if (!Number.isFinite(payload.amount) || payload.amount < 0) {
    return { ok: false, error: "Amount must be zero or positive" };
  }

  try {
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("family_id")
      .eq("id", payload.studentId)
      .maybeSingle();
    if (studentErr) return { ok: false, error: studentErr.message };
    const familyId = student?.family_id ?? null;

    const { error: voidErr } = await supabase
      .from("payments")
      .update({ status: "void" })
      .eq("student_id", payload.studentId)
      .eq("fee_head", payload.feeHead)
      .eq("period", payload.session)
      .eq("status", "active");
    if (voidErr) return { ok: false, error: voidErr.message };

    if (payload.amount > 0) {
      const { error: insertErr } = await supabase.from("payments").insert({
        family_id: familyId,
        student_id: payload.studentId,
        fee_head: payload.feeHead,
        period: payload.session,
        amount: payload.amount,
        payment_mode: "Cash",
      });
      if (insertErr) return { ok: false, error: insertErr.message };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// TOGGLE_ANNUAL — T.Fees ✓ toggle. Insert if no active row, void if there is.
// ---------------------------------------------------------------------------
export interface ToggleAnnualPayload {
  studentId: string;
  session: string;
  amount: number;
}

export async function replayToggleAnnual(
  supabase: SupabaseClient,
  payload: ToggleAnnualPayload,
): Promise<ReplayResult> {
  if (!payload.studentId) return { ok: false, error: "Missing studentId" };
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { ok: false, error: "Annual amount must be positive" };
  }

  try {
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .select("family_id")
      .eq("id", payload.studentId)
      .maybeSingle();
    if (studentErr) return { ok: false, error: studentErr.message };
    const familyId = student?.family_id ?? null;

    const { data: existing, error: queryErr } = await supabase
      .from("payments")
      .select("id")
      .eq("student_id", payload.studentId)
      .eq("fee_head", "Annual")
      .eq("period", payload.session)
      .eq("status", "active")
      .limit(1);
    if (queryErr) return { ok: false, error: queryErr.message };

    if (existing && existing.length > 0) {
      const { error: voidErr } = await supabase
        .from("payments")
        .update({ status: "void" })
        .eq("student_id", payload.studentId)
        .eq("fee_head", "Annual")
        .eq("period", payload.session)
        .eq("status", "active");
      if (voidErr) return { ok: false, error: voidErr.message };
      return { ok: true, outcome: "cleared" };
    } else {
      const { error: insertErr } = await supabase.from("payments").insert({
        family_id: familyId,
        student_id: payload.studentId,
        fee_head: "Annual",
        period: payload.session,
        amount: payload.amount,
        payment_mode: "Cash",
      });
      if (insertErr) return { ok: false, error: insertErr.message };
      return { ok: true, outcome: "set" };
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// SET_PDUES — family p_dues anchor edit. Void existing active P.Dues rows,
// then update the family record so rendered "remaining" equals the value.
// ---------------------------------------------------------------------------
export interface SetPDuesPayload {
  familyId: string;
  value: number;
}

export async function replaySetPDues(
  supabase: SupabaseClient,
  payload: SetPDuesPayload,
): Promise<ReplayResult> {
  if (!Number.isFinite(payload.value) || payload.value < 0) {
    return { ok: false, error: "P.Dues must be zero or positive" };
  }

  try {
    const { error: voidErr } = await supabase
      .from("payments")
      .update({ status: "void" })
      .eq("family_id", payload.familyId)
      .eq("fee_head", "P.Dues")
      .eq("status", "active");
    if (voidErr) return { ok: false, error: voidErr.message };

    const { error: updateErr } = await supabase
      .from("families")
      .update({ p_dues: payload.value })
      .eq("id", payload.familyId);
    if (updateErr) return { ok: false, error: updateErr.message };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// TOGGLE_PDUES_PAID — Phase 6a quick mark-as-paid toggle on the P.Dues
// anchor cell (NEW, non-mockup addition). Symmetric: if any active P.Dues
// row exists for this family + period, void them all (back to red). Else
// insert one for the supplied `remaining` amount (cell flips green).
// SET_PDUES still handles inline edits to the base p_dues value; this op
// only touches the active-payments side of the equation.
// ---------------------------------------------------------------------------
export interface TogglePDuesPaidPayload {
  familyId: string;
  // What the cell currently shows as remaining (used as the insert amount
  // when the toggle is firing the "paid" direction). The replay never trusts
  // it as the source of truth — it only uses it when there's no existing
  // active P.Dues row to void, and clamps to >= 0.
  remaining: number;
  // P.Dues period — pinned to the prior-session conventional string
  // ('2025-26') by callers; passed through so future sessions can override.
  period: string;
}

export async function replayTogglePDuesPaid(
  supabase: SupabaseClient,
  payload: TogglePDuesPaidPayload,
): Promise<ReplayResult> {
  if (!payload.familyId) return { ok: false, error: "Missing familyId" };
  try {
    const { data: existing, error: queryErr } = await supabase
      .from("payments")
      .select("id")
      .eq("family_id", payload.familyId)
      .eq("fee_head", "P.Dues")
      .eq("period", payload.period)
      .eq("status", "active")
      .limit(1);
    if (queryErr) return { ok: false, error: queryErr.message };

    if (existing && existing.length > 0) {
      const { error: voidErr } = await supabase
        .from("payments")
        .update({ status: "void" })
        .eq("family_id", payload.familyId)
        .eq("fee_head", "P.Dues")
        .eq("period", payload.period)
        .eq("status", "active");
      if (voidErr) return { ok: false, error: voidErr.message };
      return { ok: true, outcome: "cleared" };
    } else {
      const amount = Math.max(0, Math.floor(payload.remaining));
      if (amount <= 0) {
        return { ok: false, error: "Nothing remaining to record" };
      }
      const { error: insertErr } = await supabase.from("payments").insert({
        family_id: payload.familyId,
        student_id: null,
        fee_head: "P.Dues",
        period: payload.period,
        amount,
        payment_mode: "Cash",
      });
      if (insertErr) return { ok: false, error: insertErr.message };
      return { ok: true, outcome: "set" };
    }
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// SET_MONTHLY_OVERRIDE — Monthly anchor cell. Null clears (revert to class default).
// ---------------------------------------------------------------------------
export interface SetMonthlyOverridePayload {
  studentId: string;
  value: number | null;
}

export async function replaySetMonthlyOverride(
  supabase: SupabaseClient,
  payload: SetMonthlyOverridePayload,
): Promise<ReplayResult> {
  if (
    payload.value !== null &&
    (!Number.isFinite(payload.value) || payload.value < 0)
  ) {
    return { ok: false, error: "Monthly override must be zero or positive" };
  }
  try {
    const { error } = await supabase
      .from("students")
      .update({ monthly_fee_override: payload.value })
      .eq("id", payload.studentId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// RECORD_PAYMENT_MODAL — PaymentModal save (§6). Multi-period Monthly +
// term-head void-before-insert + Misc/P.Dues attribution.
// ---------------------------------------------------------------------------
export type PaymentModalHead =
  | "Monthly"
  | "Annual"
  | "Sep Exam"
  | "Feb Exam"
  | "P.Dues"
  | "Misc";

export interface RecordPaymentModalPayload {
  familyId: string | null;
  studentId: string | null;
  feeHead: PaymentModalHead;
  periods: string[];
  amount: number;
  paidOn: string;
  paymentMode: PaymentMode;
  notes?: string | null;
  monthlyAllocations?: Array<{ period: string; amount: number }>;
}

// Same even-split fallback the old action used so back-compat behaviour
// for Monthly modal saves without monthlyAllocations is preserved.
function evenSplitFallback(
  periods: string[],
  amount: number,
): Array<{ period: string; amount: number }> {
  if (periods.length === 0) return [];
  const baseShare = Math.floor(amount / periods.length);
  const remainder = amount - baseShare * periods.length;
  return periods.map((period, i) => ({
    period,
    amount: baseShare + (i === periods.length - 1 ? remainder : 0),
  }));
}

export async function replayRecordPaymentModal(
  supabase: SupabaseClient,
  payload: RecordPaymentModalPayload,
): Promise<ReplayResult> {
  if (!Number.isFinite(payload.amount) || payload.amount <= 0) {
    return { ok: false, error: "Amount must be greater than zero" };
  }
  if (payload.periods.length === 0) {
    return { ok: false, error: "Pick at least one period" };
  }

  const fee_head = payload.feeHead as FeeHead;

  try {
    // Resolve family_id from the student when present (orphan-safe).
    let resolvedFamilyId: string | null = payload.familyId ?? null;
    if (payload.studentId) {
      const { data: stu, error: stuErr } = await supabase
        .from("students")
        .select("family_id")
        .eq("id", payload.studentId)
        .maybeSingle();
      if (stuErr) return { ok: false, error: stuErr.message };
      resolvedFamilyId = stu?.family_id ?? null;
    }

    if (
      fee_head === "Annual" ||
      fee_head === "Sep Exam" ||
      fee_head === "Feb Exam"
    ) {
      if (!payload.studentId) {
        return { ok: false, error: "Term-head payments need a student" };
      }
      const period = payload.periods[0];
      await voidActivePayments(supabase, {
        student_id: payload.studentId,
        fee_head,
        period,
      });
      await createPayment(supabase, {
        family_id: resolvedFamilyId,
        student_id: payload.studentId,
        fee_head,
        period,
        amount: payload.amount,
        paid_on: payload.paidOn,
        payment_mode: payload.paymentMode,
        notes: payload.notes ?? null,
      });
    } else if (fee_head === "Monthly") {
      if (!payload.studentId) {
        return { ok: false, error: "Monthly payments need a student" };
      }
      const allocations =
        payload.monthlyAllocations && payload.monthlyAllocations.length > 0
          ? payload.monthlyAllocations
          : evenSplitFallback(payload.periods, payload.amount);
      for (const { period, amount } of allocations) {
        if (amount <= 0) continue;
        await createPayment(supabase, {
          family_id: resolvedFamilyId,
          student_id: payload.studentId,
          fee_head: "Monthly",
          period,
          amount,
          paid_on: payload.paidOn,
          payment_mode: payload.paymentMode,
          notes: payload.notes ?? null,
        });
      }
    } else {
      // P.Dues / Misc are family-scoped.
      if (!resolvedFamilyId) {
        return {
          ok: false,
          error: `${fee_head} needs a family — link the student first`,
        };
      }
      await createPayment(supabase, {
        family_id: resolvedFamilyId,
        student_id: payload.studentId,
        fee_head,
        period: payload.periods[0],
        amount: payload.amount,
        paid_on: payload.paidOn,
        payment_mode: payload.paymentMode,
        notes: payload.notes ?? null,
      });
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// SAVE_PROFILE — StudentProfileDialog save (§7 + §22). Four shapes; the
// draft branch creates a family then a student — that sequencing is atomic
// here so the worker doesn't have to thread two outbox entries together.
// ---------------------------------------------------------------------------
export interface SaveProfilePayload {
  studentId: string | null; // null = draft / "+ New entry" mode
  linkedFamilyId: string | null;
  familyFields: FamilyInput;
  studentFields: Omit<StudentInput, "family_id" | "roll_no">;
  concession: ConcessionInput;
  // When the caller wants to pre-issue ids for offline use, they pass these
  // in. The replay fn ignores them on the wire (the DB assigns real uuids)
  // and returns the real ids in `data` so the worker can remap.
  tempStudentId?: string;
  tempFamilyId?: string;
}

export interface SaveProfileData {
  studentId: string;
  familyId: string | null;
  tempStudentId?: string;
  tempFamilyId?: string;
}

export async function replaySaveProfile(
  supabase: SupabaseClient,
  payload: SaveProfilePayload,
): Promise<ReplayResult<SaveProfileData>> {
  if (!payload.studentFields.name.trim()) {
    return { ok: false, error: "Student name is required" };
  }
  if (!payload.studentFields.class.trim()) {
    return { ok: false, error: "Class is required" };
  }
  if (
    payload.familyFields.phone &&
    !/^[0-9]{10}$/.test(payload.familyFields.phone)
  ) {
    return { ok: false, error: "Phone must be exactly 10 digits" };
  }
  if (
    payload.studentFields.aadhaar_no &&
    !/^[0-9]{12}$/.test(payload.studentFields.aadhaar_no)
  ) {
    return { ok: false, error: "Aadhaar must be exactly 12 digits" };
  }

  const hasFamilyData = !!(
    payload.familyFields.father_name?.trim() ||
    payload.familyFields.mother_name?.trim() ||
    payload.familyFields.phone?.trim() ||
    payload.familyFields.address?.trim()
  );

  try {
    let familyId: string | null;

    if (payload.linkedFamilyId) {
      familyId = payload.linkedFamilyId;
    } else if (payload.studentId) {
      const { data: existing, error } = await supabase
        .from("students")
        .select("family_id")
        .eq("id", payload.studentId)
        .maybeSingle();
      if (error) throw error;
      if (existing?.family_id) {
        if (hasFamilyData) {
          await updateFamily(supabase, existing.family_id, payload.familyFields);
        }
        familyId = existing.family_id;
      } else if (hasFamilyData) {
        const created = await createFamily(supabase, payload.familyFields);
        familyId = created.id;
      } else {
        familyId = null;
      }
    } else {
      if (hasFamilyData) {
        const created = await createFamily(supabase, payload.familyFields);
        familyId = created.id;
      } else {
        familyId = null;
      }
    }

    let studentId: string;
    if (payload.studentId) {
      const updated = await updateStudent(supabase, payload.studentId, {
        ...payload.studentFields,
        family_id: familyId,
      });
      studentId = updated.id;
      await applyConcession(supabase, studentId, payload.concession);
    } else {
      const roll = await nextRollFor(supabase, payload.studentFields.class);
      const created = await createStudent(supabase, {
        ...payload.studentFields,
        family_id: familyId,
        roll_no: roll,
        monthly_fee_override: payload.concession.monthly_fee_override,
        term_fees_override: payload.concession.term_fees_override,
        exam_fees_override: payload.concession.exam_fees_override,
        concession_reason: payload.concession.concession_reason,
      });
      studentId = created.id;
    }

    // Build idMap so the worker can remap subsequent pending entries.
    const idMap: Record<string, string> = {};
    if (payload.tempStudentId && payload.tempStudentId !== studentId) {
      idMap[payload.tempStudentId] = studentId;
    }
    if (
      payload.tempFamilyId &&
      familyId &&
      payload.tempFamilyId !== familyId
    ) {
      idMap[payload.tempFamilyId] = familyId;
    }

    return {
      ok: true,
      idMap: Object.keys(idMap).length > 0 ? idMap : undefined,
      data: {
        studentId,
        familyId,
        tempStudentId: payload.tempStudentId,
        tempFamilyId: payload.tempFamilyId,
      },
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// LINK_FAMILY — cyan-bar suggestion click (§22).
// ---------------------------------------------------------------------------
export interface LinkFamilyPayload {
  studentId: string;
  familyId: string;
}

export async function replayLinkFamily(
  supabase: SupabaseClient,
  payload: LinkFamilyPayload,
): Promise<ReplayResult> {
  try {
    await linkStudentToFamily(supabase, payload.studentId, payload.familyId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// UNLINK — detach a student from its family (§22).
// ---------------------------------------------------------------------------
export interface UnlinkPayload {
  studentId: string;
}

export async function replayUnlink(
  supabase: SupabaseClient,
  payload: UnlinkPayload,
): Promise<ReplayResult> {
  try {
    await unlinkStudent(supabase, payload.studentId);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// ADD_SIBLING — "+ Add new sibling" (§22). Returns the new student's id
// so the worker can write a temp→real remap.
// ---------------------------------------------------------------------------
export interface AddSiblingPayload {
  parentStudentId: string;
  name: string;
  class: string;
  dob?: string | null;
  date_of_admission?: string | null;
  aadhaar_no?: string | null;
  pen?: string | null;
  tempStudentId?: string;
}

export interface AddSiblingData {
  studentId: string;
  tempStudentId?: string;
}

export async function replayAddSibling(
  supabase: SupabaseClient,
  payload: AddSiblingPayload,
): Promise<ReplayResult<AddSiblingData>> {
  try {
    const { data: parent, error } = await supabase
      .from("students")
      .select("family_id")
      .eq("id", payload.parentStudentId)
      .maybeSingle();
    if (error) throw error;
    if (!parent?.family_id) {
      return {
        ok: false,
        error: "Link this student to a family before adding a sibling",
      };
    }
    if (!payload.name.trim()) {
      return { ok: false, error: "Sibling name is required" };
    }
    if (payload.aadhaar_no && !/^[0-9]{12}$/.test(payload.aadhaar_no)) {
      return { ok: false, error: "Aadhaar must be exactly 12 digits" };
    }
    const created = await createStudent(supabase, {
      family_id: parent.family_id,
      name: payload.name,
      class: payload.class,
      dob: payload.dob ?? null,
      date_of_admission: payload.date_of_admission ?? null,
      aadhaar_no: payload.aadhaar_no ?? null,
      pen: payload.pen ?? null,
    });

    const idMap: Record<string, string> = {};
    if (payload.tempStudentId && payload.tempStudentId !== created.id) {
      idMap[payload.tempStudentId] = created.id;
    }
    return {
      ok: true,
      idMap: Object.keys(idMap).length > 0 ? idMap : undefined,
      data: { studentId: created.id, tempStudentId: payload.tempStudentId },
    };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// SET_STUDENT_STATUS — Withdraw / Restore (§7).
// ---------------------------------------------------------------------------
export interface SetStudentStatusPayload {
  studentId: string;
  status: "active" | "withdrawn";
}

export async function replaySetStudentStatus(
  supabase: SupabaseClient,
  payload: SetStudentStatusPayload,
): Promise<ReplayResult> {
  try {
    const { error } = await supabase
      .from("students")
      .update({ status: payload.status })
      .eq("id", payload.studentId);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// TYPO_DELETE — hard delete a draft / mis-entered student row (§7).
// 23503 FK violation is translated into a principal-friendly message.
// ---------------------------------------------------------------------------
export interface TypoDeletePayload {
  studentId: string;
}

export async function replayTypoDelete(
  supabase: SupabaseClient,
  payload: TypoDeletePayload,
): Promise<ReplayResult> {
  try {
    const { data, error } = await supabase
      .from("students")
      .delete()
      .eq("id", payload.studentId)
      .select("id");
    if (error) {
      const friendly =
        error.code === "23503"
          ? "This student has payments on file — use Withdrawn instead so the ledger stays intact."
          : error.message;
      return { ok: false, error: friendly };
    }
    if (!data || data.length === 0) {
      return {
        ok: false,
        error:
          "No row removed — likely blocked by RLS. Check that the students_delete policy exists.",
      };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// UNDO_DELETE — Recreate a previously-deleted student from snapshot (§7).
// ---------------------------------------------------------------------------
export interface DeletedStudentSnapshot {
  family_id: string | null;
  name: string;
  class: string;
  roll_no: number | null;
  dob: string | null;
  date_of_admission: string | null;
  aadhaar_no: string | null;
  pen: string | null;
  monthly_fee_override: number | null;
  term_fees_override: number | null;
  exam_fees_override: number | null;
  concession_reason: string | null;
}

export interface UndoDeletePayload {
  snapshot: DeletedStudentSnapshot;
}

export async function replayUndoDelete(
  supabase: SupabaseClient,
  payload: UndoDeletePayload,
): Promise<ReplayResult> {
  try {
    const s = payload.snapshot;
    const { error } = await supabase.from("students").insert({
      family_id: s.family_id,
      name: s.name,
      class: s.class,
      roll_no: s.roll_no,
      dob: s.dob,
      date_of_admission: s.date_of_admission,
      aadhaar_no: s.aadhaar_no,
      pen: s.pen,
      monthly_fee_override: s.monthly_fee_override,
      term_fees_override: s.term_fees_override,
      exam_fees_override: s.exam_fees_override,
      concession_reason: s.concession_reason,
      status: "active",
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// UPSERT_FEE_STRUCTURE — Day 6 Fee Structure modal (already client-side).
// ---------------------------------------------------------------------------
export type UpsertFeeStructurePayload = FeeStructureInput;

export async function replayUpsertFeeStructure(
  supabase: SupabaseClient,
  payload: UpsertFeeStructurePayload,
): Promise<ReplayResult> {
  try {
    await upsertFeeStructure(supabase, payload);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMessage(err) };
  }
}

// ---------------------------------------------------------------------------
// Dispatch table — op name → replay fn. The worker uses this; call sites
// pick the typed fn directly (so payloads stay type-safe at the boundary).
// ---------------------------------------------------------------------------
export const REPLAY_FNS = {
  RECORD_MONTHLY: replayRecordMonthly,
  RECORD_EXAM: replayRecordExam,
  RECORD_PAYMENT_MODAL: replayRecordPaymentModal,
  TOGGLE_ANNUAL: replayToggleAnnual,
  SET_PDUES: replaySetPDues,
  TOGGLE_PDUES_PAID: replayTogglePDuesPaid,
  SET_MONTHLY_OVERRIDE: replaySetMonthlyOverride,
  SAVE_PROFILE: replaySaveProfile,
  LINK_FAMILY: replayLinkFamily,
  UNLINK: replayUnlink,
  ADD_SIBLING: replayAddSibling,
  SET_STUDENT_STATUS: replaySetStudentStatus,
  TYPO_DELETE: replayTypoDelete,
  UNDO_DELETE: replayUndoDelete,
  UPSERT_FEE_STRUCTURE: replayUpsertFeeStructure,
} as const;
