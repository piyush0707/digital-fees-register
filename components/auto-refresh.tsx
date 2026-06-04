"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { OUTBOX_SYNCED_EVENT } from "@/lib/offline/sync";

// Day 7b R2 — listens for the worker's "drain synced one or more entries"
// signal and calls router.refresh() once per batch (debounced 300ms). The
// overlay (Phase 1) keeps the synthetic row/cell visible while the real
// row is fetched, so this is glitch-free: the synthetic disappears as the
// authoritative server row arrives in the new snapshot.
//
// Why a debounce, not a fire-per-success: the drain can resolve several
// entries in quick succession (multi-step SAVE_PROFILE + ADD_SIBLING +
// chained payments), each posting a synced event microseconds apart — one
// router.refresh per batch is plenty.

const REFRESH_DEBOUNCE_MS = 300;

export function AutoRefresh() {
  const router = useRouter();
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onSynced() {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        router.refresh();
        timerRef.current = null;
      }, REFRESH_DEBOUNCE_MS);
    }
    window.addEventListener(OUTBOX_SYNCED_EVENT, onSynced as EventListener);
    return () => {
      window.removeEventListener(OUTBOX_SYNCED_EVENT, onSynced as EventListener);
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [router]);

  return null;
}
