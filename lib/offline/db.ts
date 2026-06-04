// Day 7a — Dexie schema for the offline write-queue (outbox) + temp→real id
// remap table. Browser-only: every export is guarded behind getOfflineDB().
// Importing this from a server component is fine as long as you don't call
// getOfflineDB() there.

import Dexie, { type Table } from "dexie";

// One outbox entry per high-level user action (NOT per low-level row op) so
// multi-step server-action sequences (createFamily→createStudent; void-then
// -insert for term heads) stay atomic per replay.
export type OpName =
  | "RECORD_MONTHLY"
  | "RECORD_EXAM"
  | "RECORD_PAYMENT_MODAL"
  | "TOGGLE_ANNUAL"
  | "SET_PDUES"
  | "TOGGLE_PDUES_PAID"
  | "SET_MONTHLY_OVERRIDE"
  | "SAVE_PROFILE"
  | "LINK_FAMILY"
  | "UNLINK"
  | "ADD_SIBLING"
  | "SET_STUDENT_STATUS"
  | "TYPO_DELETE"
  | "UNDO_DELETE"
  | "UPSERT_FEE_STRUCTURE";

export type EntryStatus = "pending" | "syncing" | "failed";

export interface OutboxEntry {
  id: string;
  op: OpName;
  payload: unknown;
  createdAt: number;
  status: EntryStatus;
  attempts: number;
  lastError?: string;
  // Temp ids this entry will produce on success (SAVE_PROFILE draft mode,
  // ADD_SIBLING). Used by the sync worker to write into idMap after replay.
  tempIds?: { studentId?: string; familyId?: string };
  // Day 7b — short human-readable description captured at enqueue time so
  // the unsynced-changes panel can show "Payment · AARAV · May" without
  // having to round-trip through the server to resolve studentId → name.
  label?: string;
}

// Tiny KV-shaped table mapping our pre-issued temp uuids to the real DB
// uuids assigned by Supabase. The sync worker rewrites every subsequent
// pending entry's payload through this map before replaying it.
export interface IdMapEntry {
  tempId: string;
  realId: string;
}

class OfflineDB extends Dexie {
  outbox!: Table<OutboxEntry, string>;
  idMap!: Table<IdMapEntry, string>;

  constructor() {
    super("dfr_offline_v1");
    this.version(1).stores({
      // Indexed: status (worker filters pending/failed), createdAt (FIFO order).
      outbox: "id, status, createdAt",
      idMap: "tempId",
    });
  }
}

let _db: OfflineDB | null = null;

export function getOfflineDB(): OfflineDB {
  if (typeof window === "undefined") {
    throw new Error("offlineDB is browser-only — guard with typeof window");
  }
  if (!_db) _db = new OfflineDB();
  return _db;
}

// Tiny uuid that's good enough for client-only temp ids (we don't need
// crypto-grade entropy here). Falls back to Math.random when crypto.randomUUID
// is unavailable (very old browsers).
export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
