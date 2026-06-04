// Day 7b — read-overlay. Derives the effective Register snapshot from the
// server payload + the in-flight outbox so offline creates/edits are visible
// without a round-trip. Online this is usually empty (entries sync the
// moment they're enqueued); offline it accumulates.
//
// Pure + browser-safe. Called from the client RegisterGrid; takes the
// untouched server snapshot in and returns a new snapshot the existing
// row-rendering code can consume verbatim.
//
// Synthetic rows (offline creates) and patched real rows are tagged via two
// sidecars (pendingStudentIds, pendingPaymentKeys) so the grid can show a
// subtle amber "pending sync" hint without leaking offline-only styling
// into anything else.
//
// Pending math for synthetic rows is intentionally approximate — they show
// up + accept further edits, but authoritative numbers arrive on sync +
// router.refresh (Phase 2). Real-row math is NOT regressed; we only mutate
// the four lists the server payload carries.

import type { OpName } from "./db";
import type { RegisterPayload } from "@/lib/queries";
import type { FeeHead, Family, Payment, PaymentMode, Student } from "@/lib/types";

export interface OverlaySnapshot extends RegisterPayload {
  pendingStudentIds: Set<string>; // synthetic rows (offline CREATE)
  patchedStudentIds: Set<string>; // real rows touched by an in-flight edit
  pendingPaymentKeys: Set<string>; // `${studentId}|${feeHead}|${period}`
  pendingFamilyKeys: Set<string>; // `${familyId}|${feeHead}|${period}` (P.Dues / Misc)
  pendingMonthlyOverrideStudentIds: Set<string>;
  pendingPDuesFamilyIds: Set<string>;
}

// applyOverlay accepts either a still-pending outbox entry (the original
// shape) OR a Phase 6a "recently synced" entry held in the sync hand-off
// buffer (lib/offline/recent-synced.ts). Synced entries carry the same
// data mutations but suppress the pending-sync amber dot (sync is done)
// and, for toggle ops, are applied idempotently using `outcome` so the
// overlay doesn't flip the state back when the refreshed snapshot already
// reflects the write.
export interface EffectiveEntry {
  id: string;
  op: OpName;
  payload: unknown;
  tempIds?: { studentId?: string; familyId?: string };
  createdAt: number;
  isSynced?: boolean;
  outcome?: "set" | "cleared";
  resolvedStudentId?: string;
}

const SYNTH_PAY_PREFIX = "__synth_pay_";

export function applyOverlay(
  snapshot: RegisterPayload,
  entries: ReadonlyArray<EffectiveEntry>,
  currentClass: string,
): OverlaySnapshot {
  let students: Student[] = snapshot.students.map((s) => ({ ...s }));
  let siblings: Student[] = snapshot.siblings.map((s) => ({ ...s }));
  const families: Family[] = snapshot.families.map((f) => ({ ...f }));
  let payments: Payment[] = snapshot.payments.slice();
  let feeStructure = snapshot.fee_structure;

  const pendingStudentIds = new Set<string>();
  const patchedStudentIds = new Set<string>();
  const pendingPaymentKeys = new Set<string>();
  const pendingFamilyKeys = new Set<string>();
  const pendingMonthlyOverrideStudentIds = new Set<string>();
  const pendingPDuesFamilyIds = new Set<string>();
  const hiddenStudentIds = new Set<string>();

  // FIFO — same ordering the sync worker uses, so cause-and-effect stays
  // consistent between the overlay and the eventual replay.
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);

  const findStudent = (id: string): Student | null =>
    students.find((s) => s.id === id) ??
    siblings.find((s) => s.id === id) ??
    null;
  const findFamilyId = (studentId: string): string | null =>
    findStudent(studentId)?.family_id ?? null;

  for (const entry of sorted) {
    // Cast is fine — each branch matches the payload shape declared in
    // lib/offline/replay.ts for its op.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = entry.payload as any;
    // Phase 6a — synced entries skip the pending-sync sets (sync done →
    // no amber dot, no "PENDING SYNC" chip) but still apply their data
    // mutations so the cell stays green until the refreshed snapshot
    // arrives.
    const markDot = !entry.isSynced;
    switch (entry.op) {
      case "SAVE_PROFILE": {
        const studentId: string | null = p.studentId ?? null;
        if (studentId === null) {
          // CREATE path. Inject a synthetic row only when this draft lands
          // in the class we're rendering — a sibling created for a different
          // class belongs in the siblings bucket so chips still render but
          // the row doesn't crash into the wrong grid.
          const tempStudentId = entry.tempIds?.studentId;
          if (!tempStudentId) break;
          // De-dup for synced creates: if the real row from this synced
          // entry has already arrived in the snapshot, the synthetic
          // injection would duplicate it.
          if (entry.isSynced && entry.resolvedStudentId) {
            const realInSnapshot =
              snapshot.students.some(
                (s) => s.id === entry.resolvedStudentId,
              ) ||
              snapshot.siblings.some(
                (s) => s.id === entry.resolvedStudentId,
              );
            if (realInSnapshot) break;
          }
          const tempFamilyId = entry.tempIds?.familyId ?? null;
          const linkedFamilyId = p.linkedFamilyId ?? null;
          const cls = String(p.studentFields?.class ?? "");
          const familyIdForRow = linkedFamilyId ?? tempFamilyId ?? null;

          const synth: Student = {
            id: tempStudentId,
            family_id: familyIdForRow,
            name: String(p.studentFields?.name ?? "").toUpperCase(),
            class: cls,
            roll_no: null,
            dob: p.studentFields?.dob ?? null,
            date_of_admission: p.studentFields?.date_of_admission ?? null,
            aadhaar_no: p.studentFields?.aadhaar_no ?? null,
            pen: p.studentFields?.pen ?? null,
            monthly_fee_override: p.concession?.monthly_fee_override ?? null,
            term_fees_override: p.concession?.term_fees_override ?? null,
            exam_fees_override: p.concession?.exam_fees_override ?? null,
            concession_reason: p.concession?.concession_reason ?? null,
            status: "active",
            created_at: new Date(entry.createdAt).toISOString(),
            updated_at: new Date(entry.createdAt).toISOString(),
          };
          if (cls === currentClass) students.push(synth);
          else siblings.push(synth);
          if (markDot) pendingStudentIds.add(tempStudentId);

          // Also synthesise the family row if the user is creating one from
          // scratch (no link to existing). Lets cross-row sibling lookups
          // find the family bucket immediately.
          if (!linkedFamilyId && tempFamilyId && p.familyFields) {
            families.push({
              id: tempFamilyId,
              father_name: p.familyFields.father_name ?? null,
              mother_name: p.familyFields.mother_name ?? null,
              phone: p.familyFields.phone ?? null,
              address: p.familyFields.address ?? null,
              p_dues: 0,
              status: "active",
              created_at: new Date(entry.createdAt).toISOString(),
              updated_at: new Date(entry.createdAt).toISOString(),
            });
          }
        } else {
          // EDIT path. Patch the existing row's name / class / family link /
          // concession overrides so the grid reflects the dialog change
          // immediately offline.
          const idx = students.findIndex((s) => s.id === studentId);
          if (idx >= 0) {
            const s = students[idx];
            const concession = p.concession ?? {};
            students[idx] = {
              ...s,
              family_id:
                p.linkedFamilyId !== undefined ? p.linkedFamilyId : s.family_id,
              name: String(p.studentFields?.name ?? s.name).toUpperCase(),
              class: p.studentFields?.class ?? s.class,
              dob: p.studentFields?.dob ?? s.dob,
              date_of_admission:
                p.studentFields?.date_of_admission ?? s.date_of_admission,
              aadhaar_no: p.studentFields?.aadhaar_no ?? s.aadhaar_no,
              pen: p.studentFields?.pen ?? s.pen,
              monthly_fee_override:
                "monthly_fee_override" in concession
                  ? concession.monthly_fee_override
                  : s.monthly_fee_override,
              term_fees_override:
                "term_fees_override" in concession
                  ? concession.term_fees_override
                  : s.term_fees_override,
              exam_fees_override:
                "exam_fees_override" in concession
                  ? concession.exam_fees_override
                  : s.exam_fees_override,
              concession_reason:
                "concession_reason" in concession
                  ? concession.concession_reason
                  : s.concession_reason,
            };
            if (markDot) patchedStudentIds.add(studentId);
          }
          // Patch the family fields too, so a parent-name edit (when not
          // linked to another family) shows up the next time the dialog
          // opens. Doesn't affect the grid visually beyond the dialog.
          if (!p.linkedFamilyId) {
            const stu = findStudent(studentId);
            const fid = stu?.family_id;
            if (fid && p.familyFields) {
              const fidx = families.findIndex((f) => f.id === fid);
              if (fidx >= 0) {
                families[fidx] = {
                  ...families[fidx],
                  father_name:
                    p.familyFields.father_name ?? families[fidx].father_name,
                  mother_name:
                    p.familyFields.mother_name ?? families[fidx].mother_name,
                  phone: p.familyFields.phone ?? families[fidx].phone,
                  address: p.familyFields.address ?? families[fidx].address,
                };
              }
            }
          }
        }
        break;
      }

      case "ADD_SIBLING": {
        const tempId = entry.tempIds?.studentId;
        if (!tempId) break;
        // De-dup for synced creates — see SAVE_PROFILE create branch.
        if (entry.isSynced && entry.resolvedStudentId) {
          const realInSnapshot =
            snapshot.students.some((s) => s.id === entry.resolvedStudentId) ||
            snapshot.siblings.some((s) => s.id === entry.resolvedStudentId);
          if (realInSnapshot) break;
        }
        const parentId: string = p.parentStudentId;
        const parentFamilyId = findFamilyId(parentId);
        if (!parentFamilyId) break;
        const cls = String(p.class ?? "");
        const synth: Student = {
          id: tempId,
          family_id: parentFamilyId,
          name: String(p.name ?? "").toUpperCase(),
          class: cls,
          roll_no: null,
          dob: p.dob ?? null,
          date_of_admission: p.date_of_admission ?? null,
          aadhaar_no: p.aadhaar_no ?? null,
          pen: p.pen ?? null,
          monthly_fee_override: null,
          term_fees_override: null,
          exam_fees_override: null,
          concession_reason: null,
          status: "active",
          created_at: new Date(entry.createdAt).toISOString(),
          updated_at: new Date(entry.createdAt).toISOString(),
        };
        if (cls === currentClass) students.push(synth);
        else siblings.push(synth);
        if (markDot) pendingStudentIds.add(tempId);
        break;
      }

      case "RECORD_MONTHLY": {
        const studentId: string = p.studentId;
        const period: string = p.period;
        const amount: number = p.amount;
        payments = payments.filter(
          (pp) =>
            !(
              pp.student_id === studentId &&
              pp.fee_head === "Monthly" &&
              pp.period === period &&
              pp.status === "active"
            ),
        );
        if (amount > 0) {
          payments.push(
            synthPayment({
              entry,
              student_id: studentId,
              family_id: findFamilyId(studentId),
              fee_head: "Monthly",
              period,
              amount,
            }),
          );
        }
        if (markDot) pendingPaymentKeys.add(`${studentId}|Monthly|${period}`);
        break;
      }

      case "RECORD_EXAM": {
        const studentId: string = p.studentId;
        const session: string = p.session;
        const feeHead = p.feeHead as "Sep Exam" | "Feb Exam";
        const amount: number = p.amount;
        payments = payments.filter(
          (pp) =>
            !(
              pp.student_id === studentId &&
              pp.fee_head === feeHead &&
              pp.period === session &&
              pp.status === "active"
            ),
        );
        if (amount > 0) {
          payments.push(
            synthPayment({
              entry,
              student_id: studentId,
              family_id: findFamilyId(studentId),
              fee_head: feeHead,
              period: session,
              amount,
            }),
          );
        }
        if (markDot) pendingPaymentKeys.add(`${studentId}|${feeHead}|${session}`);
        break;
      }

      case "TOGGLE_ANNUAL": {
        const studentId: string = p.studentId;
        const session: string = p.session;
        const amount: number = p.amount;
        const hasActive = payments.some(
          (pp) =>
            pp.student_id === studentId &&
            pp.fee_head === "Annual" &&
            pp.period === session &&
            pp.status === "active",
        );
        // Phase 6a — synced toggles use the captured outcome so they apply
        // idempotently against a refreshed snapshot (re-running the toggle
        // logic would flip the result the wrong way).
        const wantSet = entry.isSynced
          ? entry.outcome === "set"
          : !hasActive;
        if (wantSet) {
          if (!hasActive) {
            payments.push(
              synthPayment({
                entry,
                student_id: studentId,
                family_id: findFamilyId(studentId),
                fee_head: "Annual",
                period: session,
                amount,
              }),
            );
          }
        } else {
          if (hasActive) {
            payments = payments.filter(
              (pp) =>
                !(
                  pp.student_id === studentId &&
                  pp.fee_head === "Annual" &&
                  pp.period === session &&
                  pp.status === "active"
                ),
            );
          }
        }
        if (markDot) pendingPaymentKeys.add(`${studentId}|Annual|${session}`);
        break;
      }

      case "RECORD_PAYMENT_MODAL": {
        const studentId: string | null = p.studentId ?? null;
        const familyId: string | null = p.familyId ?? null;
        const feeHead = p.feeHead as FeeHead;
        const periods: string[] = Array.isArray(p.periods) ? p.periods : [];
        const amount: number = p.amount;
        const paidOn: string = p.paidOn;
        const paymentMode: PaymentMode = p.paymentMode;

        if (
          feeHead === "Annual" ||
          feeHead === "Sep Exam" ||
          feeHead === "Feb Exam"
        ) {
          if (!studentId || periods.length === 0) break;
          const period = periods[0];
          payments = payments.filter(
            (pp) =>
              !(
                pp.student_id === studentId &&
                pp.fee_head === feeHead &&
                pp.period === period &&
                pp.status === "active"
              ),
          );
          payments.push(
            synthPayment({
              entry,
              student_id: studentId,
              family_id: findFamilyId(studentId),
              fee_head: feeHead,
              period,
              amount,
              paid_on: paidOn,
              payment_mode: paymentMode,
            }),
          );
          if (markDot) pendingPaymentKeys.add(`${studentId}|${feeHead}|${period}`);
        } else if (feeHead === "Monthly") {
          if (!studentId || periods.length === 0) break;
          const allocations =
            Array.isArray(p.monthlyAllocations) &&
            p.monthlyAllocations.length > 0
              ? (p.monthlyAllocations as Array<{
                  period: string;
                  amount: number;
                }>)
              : evenSplit(periods, amount);
          for (const { period, amount: amt } of allocations) {
            if (amt <= 0) continue;
            payments.push(
              synthPayment({
                entry,
                student_id: studentId,
                family_id: findFamilyId(studentId),
                fee_head: "Monthly",
                period,
                amount: amt,
                paid_on: paidOn,
                payment_mode: paymentMode,
              }),
            );
            if (markDot) pendingPaymentKeys.add(`${studentId}|Monthly|${period}`);
          }
        } else {
          // P.Dues / Misc — family-scoped.
          const fid = familyId ?? (studentId ? findFamilyId(studentId) : null);
          if (!fid || periods.length === 0) break;
          payments.push(
            synthPayment({
              entry,
              student_id: studentId,
              family_id: fid,
              fee_head: feeHead,
              period: periods[0],
              amount,
              paid_on: paidOn,
              payment_mode: paymentMode,
            }),
          );
          if (markDot) pendingFamilyKeys.add(`${fid}|${feeHead}|${periods[0]}`);
        }
        break;
      }

      case "SET_PDUES": {
        const familyId: string = p.familyId;
        const value: number = p.value;
        const fidx = families.findIndex((f) => f.id === familyId);
        if (fidx >= 0) {
          families[fidx] = { ...families[fidx], p_dues: value };
        }
        // Void existing active P.Dues rows so the rendered "remaining"
        // exactly equals the new anchor value (matches replaySetPDues).
        payments = payments.filter(
          (pp) =>
            !(
              pp.family_id === familyId &&
              pp.fee_head === "P.Dues" &&
              pp.status === "active"
            ),
        );
        if (markDot) pendingPDuesFamilyIds.add(familyId);
        break;
      }

      case "TOGGLE_PDUES_PAID": {
        // Phase 6a non-mockup addition — mirrors TOGGLE_ANNUAL semantics.
        const familyId: string = p.familyId;
        const period: string = p.period;
        const remaining: number = p.remaining;
        const hasActive = payments.some(
          (pp) =>
            pp.family_id === familyId &&
            pp.fee_head === "P.Dues" &&
            pp.period === period &&
            pp.status === "active",
        );
        // Synced toggles use the captured outcome (idempotent).
        const wantSet = entry.isSynced
          ? entry.outcome === "set"
          : !hasActive;
        if (wantSet) {
          if (!hasActive && remaining > 0) {
            payments.push(
              synthPayment({
                entry,
                student_id: null,
                family_id: familyId,
                fee_head: "P.Dues",
                period,
                amount: Math.floor(remaining),
              }),
            );
          }
        } else {
          if (hasActive) {
            payments = payments.filter(
              (pp) =>
                !(
                  pp.family_id === familyId &&
                  pp.fee_head === "P.Dues" &&
                  pp.period === period &&
                  pp.status === "active"
                ),
            );
          }
        }
        if (markDot) pendingPDuesFamilyIds.add(familyId);
        break;
      }

      case "SET_MONTHLY_OVERRIDE": {
        const studentId: string = p.studentId;
        const value: number | null = p.value;
        const idx = students.findIndex((s) => s.id === studentId);
        if (idx >= 0) {
          students[idx] = {
            ...students[idx],
            monthly_fee_override: value,
          };
          if (markDot) patchedStudentIds.add(studentId);
        }
        if (markDot) pendingMonthlyOverrideStudentIds.add(studentId);
        break;
      }

      case "SET_STUDENT_STATUS": {
        const studentId: string = p.studentId;
        const status = p.status as Student["status"];
        const idx = students.findIndex((s) => s.id === studentId);
        if (idx >= 0) {
          students[idx] = { ...students[idx], status };
          if (markDot) patchedStudentIds.add(studentId);
        }
        break;
      }

      case "LINK_FAMILY": {
        const studentId: string = p.studentId;
        const familyId: string = p.familyId;
        const idx = students.findIndex((s) => s.id === studentId);
        if (idx >= 0) {
          students[idx] = { ...students[idx], family_id: familyId };
          if (markDot) patchedStudentIds.add(studentId);
        }
        break;
      }

      case "UNLINK": {
        const studentId: string = p.studentId;
        const idx = students.findIndex((s) => s.id === studentId);
        if (idx >= 0) {
          students[idx] = { ...students[idx], family_id: null };
          if (markDot) patchedStudentIds.add(studentId);
        }
        break;
      }

      case "TYPO_DELETE": {
        hiddenStudentIds.add(p.studentId);
        break;
      }

      case "UNDO_DELETE": {
        const snap = p.snapshot;
        if (!snap) break;
        if (snap.class !== currentClass) break;
        // No temp id is issued for UNDO_DELETE on the wire (the worker just
        // inserts and lets the DB pick a uuid). The overlay row needs a
        // stable id distinct from any server row, so we synthesise one.
        const tempId = `__tmp_undo_${entry.id}`;
        students.push({
          id: tempId,
          family_id: snap.family_id,
          name: snap.name,
          class: snap.class,
          roll_no: snap.roll_no,
          dob: snap.dob,
          date_of_admission: snap.date_of_admission,
          aadhaar_no: snap.aadhaar_no,
          pen: snap.pen,
          monthly_fee_override: snap.monthly_fee_override,
          term_fees_override: snap.term_fees_override,
          exam_fees_override: snap.exam_fees_override,
          concession_reason: snap.concession_reason,
          status: "active",
          created_at: new Date(entry.createdAt).toISOString(),
          updated_at: new Date(entry.createdAt).toISOString(),
        });
        if (markDot) pendingStudentIds.add(tempId);
        break;
      }

      case "UPSERT_FEE_STRUCTURE": {
        if (String(p.class) !== currentClass) break;
        const base = feeStructure ?? {
          id: "__synth_fs",
          class: currentClass,
          effective_from: "1970-01-01",
          monthly_fee: 0,
          annual_fee: 0,
          sep_exam_fee: 0,
          feb_exam_fee: 0,
          misc_fee: 0,
          created_at: "",
          updated_at: "",
        };
        feeStructure = {
          ...base,
          monthly_fee: p.monthly_fee ?? base.monthly_fee,
          annual_fee: p.annual_fee ?? base.annual_fee,
          sep_exam_fee: p.sep_exam_fee ?? base.sep_exam_fee,
          feb_exam_fee: p.feb_exam_fee ?? base.feb_exam_fee,
          misc_fee: p.misc_fee ?? base.misc_fee,
        };
        break;
      }
    }
  }

  students = students.filter((s) => !hiddenStudentIds.has(s.id));
  siblings = siblings.filter((s) => !hiddenStudentIds.has(s.id));

  return {
    students,
    families,
    siblings,
    payments,
    fee_structure: feeStructure,
    pendingStudentIds,
    patchedStudentIds,
    pendingPaymentKeys,
    pendingFamilyKeys,
    pendingMonthlyOverrideStudentIds,
    pendingPDuesFamilyIds,
  };
}

interface SynthPaymentArgs {
  entry: EffectiveEntry;
  student_id: string | null;
  family_id: string | null;
  fee_head: FeeHead;
  period: string;
  amount: number;
  paid_on?: string;
  payment_mode?: PaymentMode;
}

function synthPayment(args: SynthPaymentArgs): Payment {
  const created = new Date(args.entry.createdAt).toISOString();
  return {
    id: SYNTH_PAY_PREFIX + args.entry.id + "_" + args.period + "_" + args.fee_head,
    family_id: args.family_id,
    student_id: args.student_id,
    fee_head: args.fee_head,
    period: args.period,
    amount: args.amount,
    paid_on: args.paid_on ?? created.slice(0, 10),
    payment_mode: args.payment_mode ?? "Cash",
    reference_no: null,
    notes: null,
    status: "active",
    created_at: created,
    updated_at: created,
  };
}

function evenSplit(
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
