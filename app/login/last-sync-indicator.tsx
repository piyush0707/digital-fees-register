"use client";

import { useEffect, useState } from "react";
import { formatRelativeSince, getLastSync } from "@/lib/last-sync";

// Reads the last-sync timestamp from localStorage (written on every
// authenticated page mount by components/record-sync.tsx) and renders it
// as a short relative phrase. Refreshes every 30s so a parked tab stays
// honest. SSR-safe: the first render mirrors the hardcoded "—" the
// component previously displayed, and the real value swaps in on the
// client tick so the markup matches what the server emitted.

export function LastSyncIndicator() {
  const [phrase, setPhrase] = useState<string>("—");
  const [absolute, setAbsolute] = useState<string | undefined>(undefined);

  useEffect(() => {
    function tick() {
      const ts = getLastSync();
      if (ts === null) {
        setPhrase("never");
        setAbsolute(undefined);
        return;
      }
      setPhrase(formatRelativeSince(ts));
      setAbsolute(new Date(ts).toLocaleString());
    }
    tick();
    const id = window.setInterval(tick, 30_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return <span title={absolute}>Last sync: {phrase}</span>;
}
