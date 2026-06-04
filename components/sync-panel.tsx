"use client";

// Day 7b R3 — "Unsynced changes" panel. Opens when the principal clicks the
// sync badge in the top nav (rebuilt in components/sync-badge.tsx). Lists
// every pending + failed outbox entry with:
//   • a human-readable label (captured at enqueue time; falls back to a
//     generic op-derived label so even legacy/no-label entries render),
//   • status pill + lastError for failed,
//   • Retry + Discard (with confirm) buttons per entry,
//   • a "Retry all" button at the top.
//
// This UI isn't in the mockup — Day 7b is an offline-UX addition layered
// on the 7a outbox. Palette: slate/amber/green/red only (no indigo) so it
// reads as a clearly bracketed system surface, not part of the register.
//
// All entry mutations go through lib/offline (discardEntry / retryEntry /
// retryNow) — no Supabase calls live in here.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { OutboxEntry } from "@/lib/offline/db";
import { discardEntry, retryEntry } from "@/lib/offline/outbox";
import { retryNow } from "@/lib/offline/sync";

export interface SyncPanelProps {
  open: boolean;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  entries: OutboxEntry[];
  pending: number;
  failed: number;
  online: boolean;
}

function relativeAge(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

// Fallback label when an entry was enqueued without one (older entries from
// before Day 7b, or any op we haven't instrumented). Reads enough of the
// payload that the principal can still identify what they're discarding.
function deriveLabel(entry: OutboxEntry): string {
  if (entry.label) return entry.label;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = (entry.payload as any) ?? {};
  switch (entry.op) {
    case "RECORD_MONTHLY":
      return `Payment · Monthly · ${p.period ?? "—"}`;
    case "RECORD_EXAM":
      return `${p.feeHead ?? "Exam"} · ${p.session ?? "—"}`;
    case "RECORD_PAYMENT_MODAL":
      return `Payment · ${p.feeHead ?? "—"}`;
    case "TOGGLE_ANNUAL":
      return `T.Fees toggle · ${p.session ?? "—"}`;
    case "SET_PDUES":
      return `P.Dues · ₹${p.value ?? "—"}`;
    case "TOGGLE_PDUES_PAID":
      return `P.Dues toggle · ${p.period ?? "—"}`;
    case "SET_MONTHLY_OVERRIDE":
      return p.value === null
        ? `Monthly reset`
        : `Monthly override · ₹${p.value ?? "—"}`;
    case "SAVE_PROFILE":
      return p.studentId
        ? `Profile · ${p.studentFields?.name ?? "—"}`
        : `New student · ${p.studentFields?.name ?? "—"}`;
    case "ADD_SIBLING":
      return `New sibling · ${p.name ?? "—"}`;
    case "SET_STUDENT_STATUS":
      return `${p.status === "withdrawn" ? "Withdraw" : "Restore"} student`;
    case "TYPO_DELETE":
      return `Delete student`;
    case "UNDO_DELETE":
      return `Undo delete · ${p.snapshot?.name ?? "—"}`;
    case "LINK_FAMILY":
      return `Link family`;
    case "UNLINK":
      return `Unlink family`;
    case "UPSERT_FEE_STRUCTURE":
      return `Fee structure · Class ${p.class ?? "—"}`;
  }
}

export function SyncPanel(props: SyncPanelProps) {
  const { open, onClose, anchorRef, entries, pending, failed, online } = props;
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDiscardId, setConfirmDiscardId] = useState<string | null>(null);

  // Position relative to the badge anchor — placed directly below it,
  // right-aligned, with a small gap so it doesn't visually attach to the nav.
  useEffect(() => {
    if (!open) return;
    function place() {
      const btn = anchorRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      setPos({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
      });
    }
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  // Outside-click + Esc to dismiss. Skip the badge button itself so clicking
  // the badge again doesn't immediately reopen after closing.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !pos) return null;

  async function onRetry(id: string) {
    setBusyId(id);
    try {
      await retryEntry(id);
    } finally {
      setBusyId(null);
    }
  }

  async function onDiscardConfirmed(id: string) {
    setBusyId(id);
    try {
      await discardEntry(id);
      setConfirmDiscardId(null);
    } finally {
      setBusyId(null);
    }
  }

  async function onRetryAll() {
    setBusyId("__all__");
    try {
      await retryNow();
    } finally {
      setBusyId(null);
    }
  }

  return createPortal(
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Unsynced changes"
      className="sync-panel"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="sync-panel-header">
        <div>
          <div className="sync-panel-title">Unsynced changes</div>
          <div className="sync-panel-subtitle">
            {entries.length === 0
              ? online
                ? "Everything is synced."
                : "Offline · queue is empty."
              : `${pending} pending · ${failed} failed`}
          </div>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            className="sync-panel-retry-all"
            onClick={onRetryAll}
            disabled={busyId !== null}
          >
            Retry all
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <div className="sync-panel-empty">
          No queued writes.{" "}
          <span style={{ color: "#94a3b8" }}>
            Anything you save while offline will show up here.
          </span>
        </div>
      ) : (
        <ul className="sync-panel-list">
          {entries.map((e) => {
            const isConfirming = confirmDiscardId === e.id;
            const isBusy = busyId === e.id || busyId === "__all__";
            const label = deriveLabel(e);
            return (
              <li key={e.id} className={"sync-panel-row sync-status-" + e.status}>
                <div className="sync-row-main">
                  <div className="sync-row-label">{label}</div>
                  <div className="sync-row-meta">
                    <span className={"sync-status-pill sync-pill-" + e.status}>
                      {e.status === "failed"
                        ? "Failed"
                        : e.status === "syncing"
                          ? "Syncing"
                          : "Pending"}
                    </span>
                    <span className="sync-row-age">
                      {relativeAge(Date.now() - e.createdAt)}
                    </span>
                  </div>
                  {e.status === "failed" && e.lastError && (
                    <div className="sync-row-error">{e.lastError}</div>
                  )}
                </div>
                {isConfirming ? (
                  <div className="sync-row-confirm">
                    <span className="sync-row-confirm-text">Discard?</span>
                    <button
                      type="button"
                      className="sync-row-btn sync-row-btn-danger"
                      onClick={() => onDiscardConfirmed(e.id)}
                      disabled={isBusy}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      className="sync-row-btn"
                      onClick={() => setConfirmDiscardId(null)}
                      disabled={isBusy}
                    >
                      No
                    </button>
                  </div>
                ) : (
                  <div className="sync-row-actions">
                    <button
                      type="button"
                      className="sync-row-btn sync-row-btn-primary"
                      onClick={() => onRetry(e.id)}
                      disabled={isBusy || e.status === "syncing"}
                      title="Retry this entry now"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      className="sync-row-btn"
                      onClick={() => setConfirmDiscardId(e.id)}
                      disabled={isBusy}
                      title="Drop this entry without saving"
                    >
                      Discard
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>,
    document.body,
  );
}
