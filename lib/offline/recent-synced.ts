// Phase 6a — sync hand-off buffer (UX race fix).
//
// PROBLEM: when an online write replays successfully the worker deletes
// the outbox entry. Dexie's liveQuery fires immediately and the overlay
// re-renders the grid from the stale snapshot — `paid` drops back to 0,
// the cell flashes from green → pink → green when router.refresh() finally
// delivers the new payload (~150-300 ms later).
//
// FIX: hold synced entries in an in-memory buffer here. applyOverlay()
// keeps applying them (without the amber "pending sync" dot — sync is
// done) so the grid stays green continuously. RegisterGrid clears the
// buffer the moment a new server snapshot arrives (initialPayload
// identity change), at which point the payload already contains the
// synced write and the overlay no longer needs to mask anything.
//
// Safety net: each entry auto-expires after 15 s in case a refresh never
// arrives (e.g. server error mid-flight) so the buffer can never leak
// indefinitely.
//
// Browser-only — module state lives on the client only.

import type { OpName } from "./db";

export interface RecentSyncedEntry {
  id: string;
  op: OpName;
  // Payload AFTER any temp→real id remap the worker performed (matches
  // what the replay fn actually saw). Overlay branches that read ids
  // from the payload can trust it.
  payload: unknown;
  tempIds?: { studentId?: string; familyId?: string };
  createdAt: number;
  syncedAt: number;
  // For toggle ops (TOGGLE_ANNUAL, TOGGLE_PDUES_PAID) — captures which
  // way the toggle resolved on the server so the overlay can apply the
  // outcome idempotently instead of re-running the toggle (which would
  // flip it the wrong way against the new snapshot).
  outcome?: "set" | "cleared";
  // For SAVE_PROFILE-draft + ADD_SIBLING — the real student id the server
  // assigned. Overlay uses it to skip injecting the synthetic row once
  // the real row has arrived in the snapshot (de-dupe by temp id).
  resolvedStudentId?: string;
}

const TTL_MS = 15_000;

const buffer = new Map<string, RecentSyncedEntry>();
const timers = new Map<string, number>();
const subscribers = new Set<() => void>();

function notify(): void {
  for (const cb of subscribers) cb();
}

export function addRecentSynced(entry: RecentSyncedEntry): void {
  // Replace any prior buffer entry with the same id — should only happen
  // if the same entry id was re-added (shouldn't, but be defensive).
  const prev = timers.get(entry.id);
  if (prev !== undefined && typeof window !== "undefined") {
    window.clearTimeout(prev);
  }
  buffer.set(entry.id, entry);
  if (typeof window !== "undefined") {
    const t = window.setTimeout(() => {
      if (buffer.delete(entry.id)) notify();
      timers.delete(entry.id);
    }, TTL_MS);
    timers.set(entry.id, t);
  }
  notify();
}

export function getRecentSynced(): RecentSyncedEntry[] {
  return Array.from(buffer.values());
}

export function clearRecentSynced(): void {
  if (buffer.size === 0) return;
  if (typeof window !== "undefined") {
    for (const t of timers.values()) window.clearTimeout(t);
  }
  timers.clear();
  buffer.clear();
  notify();
}

export function subscribeRecentSynced(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}
