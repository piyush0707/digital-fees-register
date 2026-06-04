// Day 7a — FIFO replay worker. Processes status='pending' entries ONLY,
// FIFO by createdAt. Failed entries are PARKED — they only retry when the
// user clicks the sync badge (retryNow), never on the drain loop or the
// 8s interval (otherwise a permanently-doomed entry would flood the
// network and block independent later writes).
//
// On success: delete the entry, persist any new temp→real id mappings,
// record a last-sync timestamp.
// On server rejection (PostgREST/Postgres error while online): mark the
// entry 'failed' with lastError, add its tempIds (if any) to a per-drain
// "blocked" set so any LATER pending entry whose remapped payload
// references those temp ids is skipped (left 'pending') instead of being
// replayed against a missing parent. Independent later entries continue
// to replay normally.
// On network failure (replay error AND navigator.onLine === false): leave
// the entry 'pending' (do NOT mark failed) and bail — the queue will be
// picked up again on the 'online' event.

import { supabase } from "@/lib/supabase";
import { recordSync } from "@/lib/last-sync";
import { getOfflineDB } from "./db";
import { REPLAY_FNS, type ReplayResult } from "./replay";
import { addRecentSynced } from "./recent-synced";

// ---------------------------------------------------------------------------
// Temp→real id remap. Reads the full idMap table once per drain, then
// recursively rewrites string fields in each entry's payload.
// ---------------------------------------------------------------------------
type IdMap = Record<string, string>;

async function loadIdMap(): Promise<IdMap> {
  const rows = await getOfflineDB().idMap.toArray();
  const map: IdMap = {};
  for (const r of rows) map[r.tempId] = r.realId;
  return map;
}

// Walks the payload object and swaps any string value matching a key in the
// map for its real-id value. Cheap, sufficient for our shapes (ids only
// appear as string values; we don't store ids as object keys).
function remapPayload<T>(payload: T, map: IdMap): T {
  if (Object.keys(map).length === 0) return payload;
  function walk(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    if (typeof v === "string") return map[v] ?? v;
    if (Array.isArray(v)) return v.map(walk);
    if (typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, vv] of Object.entries(v as Record<string, unknown>)) {
        out[k] = walk(vv);
      }
      return out;
    }
    return v;
  }
  return walk(payload) as T;
}

async function recordIdMapEntries(map: IdMap): Promise<void> {
  if (Object.keys(map).length === 0) return;
  const db = getOfflineDB();
  await db.idMap.bulkPut(
    Object.entries(map).map(([tempId, realId]) => ({ tempId, realId })),
  );
}

// Does this payload reference any string id in the `blocked` set? Used to
// skip entries whose (remapped) payload still points at a temp id whose
// parent create failed — replaying them would just hit the same FK miss.
// Walks objects + arrays; ids only ever appear as string VALUES in our
// payloads, never as keys.
function payloadReferencesAny(
  payload: unknown,
  blocked: Set<string>,
): boolean {
  if (blocked.size === 0) return false;
  let found = false;
  function walk(v: unknown): void {
    if (found) return;
    if (v === null || v === undefined) return;
    if (typeof v === "string") {
      if (blocked.has(v)) found = true;
      return;
    }
    if (typeof v !== "object") return;
    if (Array.isArray(v)) {
      for (const it of v) walk(it);
      return;
    }
    for (const vv of Object.values(v as Record<string, unknown>)) walk(vv);
  }
  walk(payload);
  return found;
}

// ---------------------------------------------------------------------------
// Drain loop. Single in-flight drain at a time (a second concurrent call
// returns the same in-flight promise). Returns a map of entry-id → outcome
// so the caller of enqueueAndSync can find ITS entry's result.
// ---------------------------------------------------------------------------
export type DrainOutcome =
  | { ok: true; idMap?: Record<string, string>; data?: unknown }
  | { ok: false; error: string };

let inflight: Promise<Map<string, DrainOutcome>> | null = null;

// Day 7b — fired on window after a drain that successfully syncs one or
// more entries. Lets a client component (components/auto-refresh.tsx)
// call router.refresh() exactly once per real sync batch so offline writes
// reconcile with the server snapshot without a manual browser refresh.
export const OUTBOX_SYNCED_EVENT = "dfr-outbox-synced";

export function drainOutbox(): Promise<Map<string, DrainOutcome>> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const outcomes = await runDrain();
      if (typeof window !== "undefined") {
        let successes = 0;
        for (const o of outcomes.values()) if (o.ok) successes++;
        if (successes > 0) {
          window.dispatchEvent(
            new CustomEvent(OUTBOX_SYNCED_EVENT, { detail: { successes } }),
          );
        }
      }
      return outcomes;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

async function runDrain(): Promise<Map<string, DrainOutcome>> {
  const outcomes = new Map<string, DrainOutcome>();
  const db = getOfflineDB();

  // Pre-seed the blocked set with the tempIds of every PRIOR 'failed'
  // entry. Any pending child that references one of those temp ids
  // would still be replaying against a parent that never landed.
  const blockedTempIds = new Set<string>();
  const priorFailed = await db.outbox
    .where("status")
    .equals("failed")
    .toArray();
  for (const f of priorFailed) {
    if (f.tempIds?.studentId) blockedTempIds.add(f.tempIds.studentId);
    if (f.tempIds?.familyId) blockedTempIds.add(f.tempIds.familyId);
  }

  // Outer loop re-queries between passes so entries enqueued mid-drain
  // (a second user action firing while the first is in flight) still get
  // processed in this same drain. Terminates when:
  //   - no more pending entries, OR
  //   - we made no progress in a pass (everything remaining is blocked), OR
  //   - the network dropped mid-drain.
  while (true) {
    if (typeof navigator !== "undefined" && !navigator.onLine) break;

    const pending = await db.outbox
      .where("status")
      .equals("pending")
      .sortBy("createdAt");
    if (pending.length === 0) break;

    let processedAny = false;
    let networkDropped = false;

    for (const entry of pending) {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        networkDropped = true;
        break;
      }

      const idMap = await loadIdMap();
      const remappedPayload = remapPayload(entry.payload, idMap);

      // Dependency check: skip (leave 'pending') any entry whose remapped
      // payload still contains a blocked temp id. After the parent is
      // fixed + retried via the badge, the next drain will pick this up.
      if (payloadReferencesAny(remappedPayload, blockedTempIds)) {
        continue;
      }

      // Mark syncing + bump attempts atomically so the badge shows the
      // momentary state and the counter is honest.
      await db.outbox.update(entry.id, {
        status: "syncing",
        attempts: entry.attempts + 1,
      });

      const fn = REPLAY_FNS[entry.op];
      let result: ReplayResult;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result = await (fn as any)(supabase, remappedPayload);
      } catch (err) {
        result = {
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        };
      }

      if (result.ok) {
        if (result.idMap) await recordIdMapEntries(result.idMap);
        await db.outbox.delete(entry.id);
        // Phase 6a — keep this entry visible to applyOverlay until the
        // next server snapshot arrives, so the cell doesn't flash from
        // green → pink → green between the Dexie deletion and the
        // router.refresh() round-trip.
        const data = result.data as { studentId?: unknown } | undefined;
        const resolvedStudentId =
          (entry.op === "SAVE_PROFILE" || entry.op === "ADD_SIBLING") &&
          data &&
          typeof data.studentId === "string"
            ? data.studentId
            : undefined;
        addRecentSynced({
          id: entry.id,
          op: entry.op,
          payload: remappedPayload,
          tempIds: entry.tempIds,
          createdAt: entry.createdAt,
          syncedAt: Date.now(),
          outcome: result.outcome,
          resolvedStudentId,
        });
        outcomes.set(entry.id, {
          ok: true,
          idMap: result.idMap,
          data: result.data,
        });
        recordSync();
        processedAny = true;
        continue;
      }

      // Distinguish network failure (browser went offline / fetch died)
      // from server rejection. Network: revert to 'pending', bail. Server:
      // park 'failed', block downstream that depends on its tempIds, and
      // CONTINUE so independent later entries can still proceed.
      const networkFailed =
        typeof navigator !== "undefined" && !navigator.onLine;
      if (networkFailed) {
        await db.outbox.update(entry.id, { status: "pending" });
        networkDropped = true;
        break;
      }

      await db.outbox.update(entry.id, {
        status: "failed",
        lastError: result.error,
      });
      outcomes.set(entry.id, { ok: false, error: result.error });
      if (entry.tempIds?.studentId) blockedTempIds.add(entry.tempIds.studentId);
      if (entry.tempIds?.familyId) blockedTempIds.add(entry.tempIds.familyId);
      processedAny = true;
    }

    if (networkDropped) break;
    if (!processedAny) break;
  }

  return outcomes;
}

// ---------------------------------------------------------------------------
// Triggers. Called by the app shell once; subsequent drains are kicked
// automatically by the 'online' event and an interval-while-pending.
// ---------------------------------------------------------------------------
let installed = false;
let intervalId: number | null = null;

function ensureIntervalRunning() {
  if (intervalId !== null) return;
  if (typeof window === "undefined") return;
  intervalId = window.setInterval(async () => {
    const db = getOfflineDB();
    // Count PENDING only — a queue that has only 'failed' entries left
    // must let the interval self-clear (no traffic, no console errors).
    // Failed entries retry exclusively via the badge's retryNow.
    const remaining = await db.outbox
      .where("status")
      .equals("pending")
      .count();
    if (remaining === 0) {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
      return;
    }
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    void drainOutbox();
  }, 8000);
}

export function installSyncTriggers(): () => void {
  if (installed || typeof window === "undefined") return () => undefined;
  installed = true;

  // On app load: drain once. Catches any stragglers from a previous session.
  void drainOutbox().finally(ensureIntervalRunning);

  // When the browser flips online, drain immediately.
  function onOnline() {
    void drainOutbox().finally(ensureIntervalRunning);
  }
  window.addEventListener("online", onOnline);

  // Re-arm the interval whenever the outbox is touched. Cheap — the
  // interval self-clears once the outbox is empty.
  function onStorage() {
    ensureIntervalRunning();
  }
  window.addEventListener("storage", onStorage);

  return () => {
    window.removeEventListener("online", onOnline);
    window.removeEventListener("storage", onStorage);
    if (intervalId !== null) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    installed = false;
  };
}

// Public on-demand retry — badge click + manual "retry now". Resets all
// failed entries back to pending so the drain picks them up.
export async function retryNow(): Promise<void> {
  const db = getOfflineDB();
  const failed = await db.outbox.where("status").equals("failed").toArray();
  if (failed.length > 0) {
    await db.outbox.bulkUpdate(
      failed.map((f) => ({ key: f.id, changes: { status: "pending" as const } })),
    );
  }
  await drainOutbox();
}
