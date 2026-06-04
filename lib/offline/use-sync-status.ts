// Day 7a — React hook backing the sync badge in the top nav. Subscribes to
// the outbox table via Dexie's liveQuery so the badge re-renders whenever an
// entry is added / status flips / drain succeeds. Also re-renders on a 30s
// tick so the oldest-pending-age computation stays accurate even when the
// outbox itself hasn't changed (the >2h escalation depends on this).

"use client";

import { useEffect, useMemo, useState } from "react";
import { liveQuery, type Subscription } from "dexie";
import { getOfflineDB, type OutboxEntry } from "./db";
import { drainOutbox, retryNow as runRetry } from "./sync";

export type SyncBadgeState = "green" | "amber" | "red";

export interface SyncStatus {
  state: SyncBadgeState;
  pending: number;
  failed: number;
  syncing: number;
  oldestPendingAgeMs: number | null;
  online: boolean;
  retryNow: () => Promise<void>;
  // Day 7b — entries surfaced to the unsynced-changes panel (R3). Sorted
  // oldest-first so the panel matches the FIFO order the worker uses.
  entries: OutboxEntry[];
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function useSyncStatus(): SyncStatus {
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  // Forces a re-render on a 30s tick so age-based state transitions
  // (e.g. amber → red when an entry crosses 2h) reflect without an
  // outbox change. The value itself is ignored.
  const [, setTick] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sub: Subscription | null = null;
    try {
      const db = getOfflineDB();
      sub = liveQuery(() => db.outbox.toArray()).subscribe({
        next: (rows) => setEntries(rows),
        error: () => setEntries([]),
      });
    } catch {
      // SSR / IndexedDB unavailable — stay green/empty.
    }
    function onOnline() {
      setOnline(true);
      void drainOutbox();
    }
    function onOffline() {
      setOnline(false);
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    const tick = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => {
      sub?.unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.clearInterval(tick);
    };
  }, []);

  return useMemo<SyncStatus>(() => {
    let pending = 0;
    let failed = 0;
    let syncing = 0;
    let oldest: number | null = null;
    for (const e of entries) {
      if (e.status === "pending") pending++;
      else if (e.status === "failed") failed++;
      else if (e.status === "syncing") syncing++;
      // Track age across everything that hasn't synced yet.
      if (e.status !== "syncing") {
        if (oldest === null || e.createdAt < oldest) oldest = e.createdAt;
      }
    }
    const oldestPendingAgeMs = oldest === null ? null : Date.now() - oldest;

    // Red wins: any failed entry OR any unsynced entry older than 2h.
    // Amber: anything pending/syncing. Green: empty.
    let state: SyncBadgeState = "green";
    if (
      failed > 0 ||
      (oldestPendingAgeMs !== null && oldestPendingAgeMs > TWO_HOURS_MS)
    ) {
      state = "red";
    } else if (pending > 0 || syncing > 0) {
      state = "amber";
    }

    // Surface the entries sorted oldest-first — the panel reads this and
    // the worker drains in the same order, so visual + replay order match.
    const sortedEntries = [...entries].sort(
      (a, b) => a.createdAt - b.createdAt,
    );

    return {
      state,
      pending,
      failed,
      syncing,
      oldestPendingAgeMs,
      online,
      retryNow: runRetry,
      entries: sortedEntries,
    };
  }, [entries, online]);
}
