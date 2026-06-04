// Day 7a — outbox enqueue API + typed mutation builders. One builder per op
// in lib/offline/replay.ts. Builders are thin wrappers so call sites pass the
// SAME shape they pass today to the server action — no per-component
// reshaping. enqueueAndSync() persists the entry locally then either drains
// the queue (online) or returns immediately (offline).
//
// Browser-only: every fn touches IndexedDB through getOfflineDB().

import { getOfflineDB, newId, type OpName, type OutboxEntry } from "./db";
import type {
  AddSiblingPayload,
  RecordExamPayload,
  RecordMonthlyPayload,
  RecordPaymentModalPayload,
  SaveProfilePayload,
  SetMonthlyOverridePayload,
  SetPDuesPayload,
  SetStudentStatusPayload,
  ToggleAnnualPayload,
  TogglePDuesPaidPayload,
  TypoDeletePayload,
  UndoDeletePayload,
  UnlinkPayload,
  UpsertFeeStructurePayload,
} from "./replay";
import { drainOutbox } from "./sync";

// Outcome surfaced to the call site so it can mirror the existing
// "ok / not-ok" branch + know whether we were actually online.
//   - ok=true,  online=true  → wire round-trip succeeded (call router.refresh)
//   - ok=true,  online=false → queued for later; show optimistic + skip refresh
//   - ok=false, online=true  → wire round-trip failed; clear optimistic + toast
//   - ok=false, online=false → enqueue itself failed (shouldn't happen)
export type Outcome =
  | { ok: true; online: boolean; idMap?: Record<string, string>; data?: unknown }
  | { ok: false; online: boolean; error: string };

function isOnline(): boolean {
  if (typeof navigator === "undefined") return true;
  return navigator.onLine;
}

async function enqueueEntry(entry: OutboxEntry): Promise<void> {
  const db = getOfflineDB();
  await db.outbox.add(entry);
}

// Core helper — every typed builder funnels through this. The optional
// tempIds field lets SAVE_PROFILE / ADD_SIBLING pre-issue ids the worker
// will later remap to real DB uuids. The optional label is captured at
// enqueue time so the Day 7b unsynced-changes panel can render a friendly
// description without round-tripping to the server.
async function enqueueAndSync<P>(
  op: OpName,
  payload: P,
  opts?: { tempIds?: OutboxEntry["tempIds"]; label?: string },
): Promise<Outcome> {
  const entry: OutboxEntry = {
    id: newId(),
    op,
    payload,
    createdAt: Date.now(),
    status: "pending",
    attempts: 0,
    tempIds: opts?.tempIds,
    label: opts?.label,
  };
  try {
    await enqueueEntry(entry);
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { ok: false, online: false, error };
  }

  // Offline: leave it in the queue; sync worker will pick it up on the next
  // 'online' event or interval tick. UX-wise the call site keeps its
  // optimistic state and skips router.refresh.
  if (!isOnline()) {
    return { ok: true, online: false };
  }

  // Online: drain FIFO. We care about this specific entry's outcome.
  const results = await drainOutbox();
  const outcome = results.get(entry.id);
  if (!outcome) {
    // The drain didn't touch our entry (e.g. an earlier failed entry
    // blocked us). Treat as queued + online so call site doesn't toast
    // an error — the badge will surface the stuck entry instead.
    return { ok: true, online: true };
  }
  if (outcome.ok) {
    return {
      ok: true,
      online: true,
      idMap: outcome.idMap,
      data: outcome.data,
    };
  }
  return { ok: false, online: true, error: outcome.error };
}

// ---------------------------------------------------------------------------
// Typed mutation builders — one per op. Each preserves the same callsite
// payload as the matching server action so migration is mechanical.
// ---------------------------------------------------------------------------

export function enqueueRecordMonthly(
  payload: RecordMonthlyPayload,
  label?: string,
) {
  return enqueueAndSync("RECORD_MONTHLY", payload, { label });
}

export function enqueueRecordExam(payload: RecordExamPayload, label?: string) {
  return enqueueAndSync("RECORD_EXAM", payload, { label });
}

export function enqueueRecordPaymentModal(
  payload: RecordPaymentModalPayload,
  label?: string,
) {
  return enqueueAndSync("RECORD_PAYMENT_MODAL", payload, { label });
}

export function enqueueToggleAnnual(
  payload: ToggleAnnualPayload,
  label?: string,
) {
  return enqueueAndSync("TOGGLE_ANNUAL", payload, { label });
}

export function enqueueSetPDues(payload: SetPDuesPayload, label?: string) {
  return enqueueAndSync("SET_PDUES", payload, { label });
}

// Phase 6a — new P.Dues mark-paid / void toggle (non-mockup addition).
export function enqueueTogglePDuesPaid(
  payload: TogglePDuesPaidPayload,
  label?: string,
) {
  return enqueueAndSync("TOGGLE_PDUES_PAID", payload, { label });
}

export function enqueueSetMonthlyOverride(
  payload: SetMonthlyOverridePayload,
  label?: string,
) {
  return enqueueAndSync("SET_MONTHLY_OVERRIDE", payload, { label });
}

export function enqueueSaveProfile(
  payload: SaveProfilePayload,
  tempIds?: OutboxEntry["tempIds"],
  label?: string,
) {
  // Draft mode (no studentId) needs a temp studentId — and a temp familyId
  // when the user isn't linking to an existing family — so the overlay can
  // inject a synthetic, selectable row and so the worker can build a
  // temp→real idMap on sync (replaySaveProfile reads tempStudentId /
  // tempFamilyId from the payload). Edit mode never mints, so the existing
  // row is patched in place.
  if (payload.studentId === null) {
    const mintedStudentId = tempIds?.studentId ?? newId();
    const mintedFamilyId = payload.linkedFamilyId
      ? tempIds?.familyId
      : (tempIds?.familyId ?? newId());
    const mergedTempIds: OutboxEntry["tempIds"] = {
      studentId: mintedStudentId,
      ...(mintedFamilyId ? { familyId: mintedFamilyId } : {}),
    };
    const mergedPayload: SaveProfilePayload = {
      ...payload,
      tempStudentId: mintedStudentId,
      ...(mintedFamilyId ? { tempFamilyId: mintedFamilyId } : {}),
    };
    return enqueueAndSync("SAVE_PROFILE", mergedPayload, {
      tempIds: mergedTempIds,
      label,
    });
  }
  return enqueueAndSync("SAVE_PROFILE", payload, { tempIds, label });
}

export function enqueueUnlink(payload: UnlinkPayload, label?: string) {
  return enqueueAndSync("UNLINK", payload, { label });
}

export function enqueueAddSibling(
  payload: AddSiblingPayload,
  tempIds?: OutboxEntry["tempIds"],
  label?: string,
) {
  // ADD_SIBLING always creates a new student — mint a temp studentId so the
  // overlay can inject the synthetic row and replayAddSibling can write a
  // temp→real idMap on sync (via payload.tempStudentId).
  const mintedStudentId = tempIds?.studentId ?? newId();
  const mergedTempIds: OutboxEntry["tempIds"] = {
    ...(tempIds ?? {}),
    studentId: mintedStudentId,
  };
  const mergedPayload: AddSiblingPayload = {
    ...payload,
    tempStudentId: mintedStudentId,
  };
  return enqueueAndSync("ADD_SIBLING", mergedPayload, {
    tempIds: mergedTempIds,
    label,
  });
}

export function enqueueSetStudentStatus(
  payload: SetStudentStatusPayload,
  label?: string,
) {
  return enqueueAndSync("SET_STUDENT_STATUS", payload, { label });
}

export function enqueueTypoDelete(payload: TypoDeletePayload, label?: string) {
  return enqueueAndSync("TYPO_DELETE", payload, { label });
}

export function enqueueUndoDelete(payload: UndoDeletePayload, label?: string) {
  return enqueueAndSync("UNDO_DELETE", payload, { label });
}

export function enqueueUpsertFeeStructure(
  payload: UpsertFeeStructurePayload,
  label?: string,
) {
  return enqueueAndSync("UPSERT_FEE_STRUCTURE", payload, { label });
}

// ---------------------------------------------------------------------------
// Day 7b — per-entry maintenance ops used by the unsynced-changes panel.
// retryEntry resets a single failed entry back to 'pending' and triggers a
// drain (vs retryNow() which retries every failed entry in one batch).
// discardEntry removes a single entry from the outbox after the principal
// confirms the discard — we never auto-discard, so no silent data loss.
// ---------------------------------------------------------------------------

export async function discardEntry(id: string): Promise<void> {
  const db = getOfflineDB();
  await db.outbox.delete(id);
}

export async function retryEntry(id: string): Promise<void> {
  const db = getOfflineDB();
  const row = await db.outbox.get(id);
  if (!row) return;
  if (row.status === "failed") {
    await db.outbox.update(id, { status: "pending" });
  }
  await drainOutbox();
}
