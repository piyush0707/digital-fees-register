"use server";

// Day 7a — server actions are now thin wrappers that delegate to the SHARED
// replay fns in lib/offline/replay.ts. The browser sync worker replays
// queued mutations through the same fns, so there is ONE write path
// (server-rendered fallback + offline replay both use it).
//
// Behaviour is identical to the pre-Day-7a actions — same args, same return
// shape, same revalidatePath. Multi-step sequences (createFamily→createStudent,
// void-before-insert for term heads) live inside replay.ts now.

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { searchFamilies, siblingsOf } from "@/lib/queries";
import {
  replayAddSibling,
  replayLinkFamily,
  replayRecordExam,
  replayRecordMonthly,
  replayRecordPaymentModal,
  replaySaveProfile,
  replaySetMonthlyOverride,
  replaySetPDues,
  replaySetStudentStatus,
  replayToggleAnnual,
  replayTogglePDuesPaid,
  replayTypoDelete,
  replayUndoDelete,
  replayUnlink,
  replayUpsertFeeStructure,
  type AddSiblingPayload,
  type DeletedStudentSnapshot,
  type LinkFamilyPayload,
  type PaymentModalHead,
  type RecordExamPayload,
  type RecordMonthlyPayload,
  type RecordPaymentModalPayload,
  type SaveProfilePayload,
  type SetMonthlyOverridePayload,
  type SetPDuesPayload,
  type SetStudentStatusPayload,
  type ToggleAnnualPayload,
  type TogglePDuesPaidPayload,
  type TypoDeletePayload,
  type UnlinkPayload,
  type UpsertFeeStructurePayload,
} from "@/lib/offline/replay";
import type {
  Family,
  PaymentMode,
  Student,
} from "@/lib/types";

export type { DeletedStudentSnapshot, PaymentModalHead };

export type SaveResult =
  | { ok: true }
  | { ok: false; error: string };

// Toggle the student's Annual (T.Fees) payment for the given session.
export async function toggleAnnualFee(args: ToggleAnnualPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayToggleAnnual(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Inline monthly cell save. See replayRecordMonthly for the void-then-insert sequence.
export async function saveMonthlyPayment(args: RecordMonthlyPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayRecordMonthly(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Sep / Feb exam cell save.
export async function saveExamFee(args: RecordExamPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayRecordExam(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// P.Dues anchor cell save.
export async function setPDues(args: SetPDuesPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replaySetPDues(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Phase 6a — P.Dues quick mark-paid / void toggle (non-mockup addition).
export async function togglePDuesPaid(
  args: TogglePDuesPaidPayload,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayTogglePDuesPaid(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// PaymentModal save (§6).
export interface SavePaymentArgs {
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

export async function savePayment(args: SavePaymentArgs): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayRecordPaymentModal(
    supabase,
    args as RecordPaymentModalPayload,
  );
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Family-search bar (§22) — still server-only because it returns rows the
// caller renders directly; it's not a write so it doesn't go through replay.
export interface FamilySuggestion {
  family: Family;
  children: Array<Pick<Student, "id" | "name" | "class" | "roll_no">>;
}

export async function searchFamiliesWithChildren(
  query: string,
): Promise<FamilySuggestion[]> {
  const supabase = await createServerSupabaseClient();
  const families = await searchFamilies(supabase, query);
  if (families.length === 0) return [];
  const ids = families.map((f) => f.id);
  const { data: students, error } = await supabase
    .from("students")
    .select("id, name, class, roll_no, family_id")
    .in("family_id", ids);
  if (error) throw error;
  const byFamily = new Map<string, FamilySuggestion["children"]>();
  for (const s of students ?? []) {
    const arr = byFamily.get(s.family_id) ?? [];
    arr.push({ id: s.id, name: s.name, class: s.class, roll_no: s.roll_no });
    byFamily.set(s.family_id, arr);
  }
  return families.map((family) => ({
    family,
    children: byFamily.get(family.id) ?? [],
  }));
}

// StudentProfileDialog save (§7 + §22).
export type SaveProfileArgs = SaveProfilePayload;

export interface SaveProfileResult {
  ok: boolean;
  error?: string;
  studentId?: string;
  familyId?: string;
}

export async function saveProfile(
  args: SaveProfileArgs,
): Promise<SaveProfileResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replaySaveProfile(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return {
    ok: true,
    studentId: res.data?.studentId,
    familyId: res.data?.familyId ?? undefined,
  };
}

// §22 — detaches a student from its family.
export async function unlinkStudentFromFamily(
  studentId: string,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const payload: UnlinkPayload = { studentId };
  const res = await replayUnlink(supabase, payload);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// §22 — links an existing student to an existing family.
export async function linkStudent(args: LinkFamilyPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayLinkFamily(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// §22 — "+ Add new sibling".
export async function addSibling(args: AddSiblingPayload): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayAddSibling(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Loads siblings for the profile dialog.
export async function loadSiblings(studentId: string): Promise<Student[]> {
  const supabase = await createServerSupabaseClient();
  return siblingsOf(supabase, studentId);
}

// §7 — row × button → "Withdrawn" / "Restore".
export async function setStudentStatus(
  args: SetStudentStatusPayload,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replaySetStudentStatus(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// §7 — row × button → "Typo / mistake" hard delete.
export async function hardDeleteStudent(
  studentId: string,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const payload: TypoDeletePayload = { studentId };
  const res = await replayTypoDelete(supabase, payload);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Undo path for the Typo / mistake delete.
export async function recreateDeletedStudent(
  snapshot: DeletedStudentSnapshot,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayUndoDelete(supabase, { snapshot });
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Monthly anchor concession edit.
export async function setMonthlyOverride(
  args: SetMonthlyOverridePayload,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replaySetMonthlyOverride(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}

// Day 6 fee structure upsert — exposed as a server action too for
// consistency, though the dialog still calls upsertFeeStructure on the
// browser client. The browser client path now goes through the outbox.
export async function saveFeeStructure(
  args: UpsertFeeStructurePayload,
): Promise<SaveResult> {
  const supabase = await createServerSupabaseClient();
  const res = await replayUpsertFeeStructure(supabase, args);
  if (!res.ok) return { ok: false, error: res.error };
  revalidatePath("/register");
  return { ok: true };
}
