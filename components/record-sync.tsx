"use client";

import { useEffect } from "react";
import { recordSync } from "@/lib/last-sync";

// Mounted by the (app) route-group layout. Every successful authenticated
// page render fires this component, which writes the current timestamp to
// localStorage. The login screen reads that value to show "Last sync: …".
//
// Why this placement: a page only reaches the (app) layout after middleware
// has validated the session, the server component has fetched data, and
// React has hydrated — i.e. an end-to-end "we just talked to the DB" handshake.

export function RecordSync() {
  useEffect(() => {
    recordSync();
  }, []);
  return null;
}
