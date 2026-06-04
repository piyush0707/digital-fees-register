"use client";

import { useEffect } from "react";

// Deep-link target. /dashboard's pending-dues row navigates here with
// ?highlight=<studentId>; we scroll the matching <tr data-student-id="..."/>
// into view (centred) and apply the ~2.5s amber `.row-highlight` flash.
// §D3 of Docs/Mockup/Mockup_User_Functionality.md.

interface RowHighlighterProps {
  highlight?: string;
}

export function RowHighlighter({ highlight }: RowHighlighterProps) {
  useEffect(() => {
    if (!highlight) return;
    // The register tbody is server-rendered, so by the time this effect
    // fires the row is in the DOM.
    const row = document.querySelector<HTMLTableRowElement>(
      `tr[data-student-id="${highlight}"]`,
    );
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    row.classList.add("row-highlight");
    const t = window.setTimeout(() => row.classList.remove("row-highlight"), 2600);
    return () => window.clearTimeout(t);
  }, [highlight]);

  return null;
}
