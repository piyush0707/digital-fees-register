"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useSyncStatus } from "@/lib/offline/use-sync-status";
import { installSyncTriggers } from "@/lib/offline/sync";
import { SyncPanel } from "@/components/sync-panel";

// Day 7a — sync badge. Lives in the shared TopNav (mounted from the (app)
// route-group layout) so the principal sees it on every screen. Palette:
// green / slate / amber / black, plus indigo only for soft backgrounds per
// CLAUDE.md — no indigo for the badge text/border.
//
// Day 7b — clicking the badge now opens an unsynced-changes panel (R3)
// with per-entry Retry + Discard. The badge state (green/amber/red) is
// unchanged.

function relativeAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr`;
  const day = Math.floor(hr / 24);
  return `${day}d`;
}

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export function SyncBadge() {
  const status = useSyncStatus();
  // Track whether we've already warned about an over-2h-stale entry this
  // session, so the warning toast doesn't repeat on every tick.
  const warnedRef = useRef(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  // SSR-safe mounted gate. The server has no navigator.onLine or Dexie, so
  // it renders the deterministic "Online · Synced" default. The first
  // CLIENT render must emit identical markup, then flip to the live status
  // after mount — otherwise React 19 throws a hydration mismatch (the
  // useSyncStatus hook reads navigator.onLine + a liveQuery subscription
  // that resolve to different values than the server picked).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Install the sync triggers (load-time drain, 'online' listener,
  // interval-while-pending) exactly once for the lifetime of this mount.
  useEffect(() => {
    const uninstall = installSyncTriggers();
    return uninstall;
  }, []);

  // >2h-unsynced escalation — toast a warning once when the oldest unsynced
  // entry crosses 2h. Resets when the queue is empty so a fresh problem
  // re-warns later.
  useEffect(() => {
    if (
      status.oldestPendingAgeMs !== null &&
      status.oldestPendingAgeMs > TWO_HOURS_MS &&
      !warnedRef.current
    ) {
      toast.warning(
        `Sync stuck · ${status.failed + status.pending} unsynced for over 2 hours — click the sync badge to retry.`,
      );
      warnedRef.current = true;
    }
    if (status.pending === 0 && status.failed === 0) {
      warnedRef.current = false;
    }
  }, [status.oldestPendingAgeMs, status.failed, status.pending]);

  // Route refresh on successful sync is owned by <AutoRefresh /> mounted in
  // app/(app)/layout.tsx — it listens for the worker's OUTBOX_SYNCED_EVENT
  // and debounces, so we don't fire two refreshes per drain.

  const total = status.pending + status.failed + status.syncing;

  let dotClass: string;
  let label: string;
  let tooltip: string;
  if (!mounted) {
    // First render after SSR — match the server's deterministic markup.
    // The post-mount effect above flips `mounted` to true on the next pass
    // and we render the live status from useSyncStatus normally.
    dotClass = "bg-emerald-500";
    label = "Synced";
    tooltip = "Online · everything synced.";
  } else if (!status.online && total === 0) {
    // Treat plain offline-with-empty-queue as amber-leaning — surfaces
    // that we wouldn't sync right now if a write happened.
    dotClass = "bg-amber-500";
    label = "Offline";
    tooltip = "Offline — writes will queue until you reconnect.";
  } else if (status.state === "red") {
    dotClass = "bg-rose-600";
    label = status.failed > 0 ? `${status.failed} failed` : "Stuck";
    const ageStr =
      status.oldestPendingAgeMs !== null
        ? ` · oldest ${relativeAge(status.oldestPendingAgeMs)}`
        : "";
    tooltip = `${status.failed} failed · ${status.pending} pending${ageStr}. Click for details.`;
  } else if (status.state === "amber") {
    dotClass = "bg-amber-500";
    label =
      status.syncing > 0
        ? `Syncing ${status.syncing}`
        : `${status.pending} pending`;
    const ageStr =
      status.oldestPendingAgeMs !== null
        ? ` · oldest ${relativeAge(status.oldestPendingAgeMs)}`
        : "";
    tooltip = `${status.pending} pending · ${status.failed} failed${ageStr}. Click for details.`;
  } else {
    dotClass = "bg-emerald-500";
    label = "Synced";
    tooltip = "Online · everything synced.";
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setPanelOpen((o) => !o)}
        title={tooltip}
        aria-label={tooltip}
        aria-expanded={panelOpen}
        className={
          "flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium " +
          "border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 " +
          "disabled:opacity-60"
        }
      >
        <span
          className={"inline-block w-2 h-2 rounded-full " + dotClass}
          aria-hidden="true"
        />
        <span className="hidden sm:inline">{label}</span>
      </button>
      <SyncPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        anchorRef={btnRef}
        entries={status.entries}
        pending={status.pending}
        failed={status.failed}
        online={status.online}
      />
    </>
  );
}
