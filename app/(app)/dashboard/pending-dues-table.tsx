"use client";

import { useMemo, useState } from "react";
import { CLASS_LIST, formatClassLabel } from "@/lib/classes";
import { DueRow } from "./due-row";
import { NotifyControls } from "./notify-controls";
import type { DueRow as DueRowType } from "@/lib/dashboard-metrics";

// Phase 6a — display-layer filter bar for the "Students with pending dues"
// table. Filters the already-computed rows from dashboard-metrics; never
// triggers a new query and never touches the pending math. Visual tokens
// mirror the Transactions filter bar (.tx-filter-bar / .tx-filter-chip /
// .tx-filter-secondary) so the two screens read the same.

type DuesThreshold = "all" | "1000" | "5000";

interface Props {
  rows: DueRowType[];
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function PendingDuesTable({ rows }: Props) {
  const [threshold, setThreshold] = useState<DuesThreshold>("all");
  const [classFilter, setClassFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    // ₹1,000+ / ₹5,000+ — non-strict greater-or-equal against the row's
    // displayed outstanding amount (numeric Number from dashboard-metrics,
    // never coerced to string). "All" → 0 threshold → keeps every row.
    const minAmount =
      threshold === "1000" ? 1000 : threshold === "5000" ? 5000 : 0;
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => r.amount >= minAmount)
      .filter((r) => classFilter === "all" || r.cls === classFilter)
      .filter((r) => q === "" || r.name.toLowerCase().includes(q))
      // Display-layer sort: highest dues first (spec). Underlying
      // dashboard-metrics output is left untouched.
      .sort((a, b) => b.amount - a.amount);
  }, [rows, threshold, classFilter, search]);

  const filteredTotal = useMemo(
    () => filtered.reduce((s, r) => s + r.amount, 0),
    [filtered],
  );
  const filteredFamilyCount = useMemo(() => {
    const fams = new Set<string>();
    for (const r of filtered) {
      fams.add(r.familyId ?? r.studentId ?? r.key);
    }
    return fams.size;
  }, [filtered]);

  return (
    <div>
      {/* Filter bar — Transactions tokens verbatim */}
      <div className="tx-filter-bar">
        <span className="filter-label">Dues</span>
        {(
          [
            { k: "all" as const, label: "All" },
            { k: "1000" as const, label: "₹1,000+" },
            { k: "5000" as const, label: "₹5,000+" },
          ]
        ).map(({ k, label }) => (
          <button
            key={k}
            type="button"
            className={"tx-filter-chip" + (threshold === k ? " active" : "")}
            onClick={() => setThreshold(k)}
          >
            {label}
          </button>
        ))}
        <div className="tx-filter-secondary">
          <select
            value={classFilter}
            onChange={(e) => setClassFilter(e.target.value)}
            title="Filter by class"
            aria-label="Filter by class"
          >
            <option value="all">All classes</option>
            {CLASS_LIST.map((c) => (
              <option key={c} value={c}>
                {formatClassLabel(c)}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student name…"
            aria-label="Search student name"
          />
        </div>
      </div>

      <table className="w-full text-xs">
        <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide">
          <tr>
            <th className="px-3 py-2 text-left">Student / Family</th>
            <th className="px-3 py-2 text-left">Class</th>
            <th className="px-3 py-2 text-left">Period</th>
            <th className="px-3 py-2 text-center">Action</th>
            <th className="px-3 py-2 text-right">Amount due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {filtered.length === 0 && (
            <tr>
              <td
                className="px-3 py-3 text-slate-500 italic"
                colSpan={5}
              >
                {rows.length === 0
                  ? "No pending dues. Every family is current."
                  : "No students match these filters."}
              </td>
            </tr>
          )}
          {filtered.map((r) => (
            <DueRow
              key={r.key}
              studentId={r.studentId}
              familyName={r.name}
              cls={r.cls}
              classLabel={r.classLabel}
              period={r.period}
              amount={r.amount}
              familyCount={filteredFamilyCount}
            />
          ))}
          {filtered.length > 0 && (
            <tr className="bg-slate-50">
              <td className="px-3 py-2 font-semibold" colSpan={3}>
                Total pending
              </td>
              <td className="px-3 py-1 text-center">
                <NotifyControls
                  variant="all"
                  familyName=""
                  count={filteredFamilyCount}
                />
              </td>
              <td className="px-3 py-2 text-right text-rose-700 font-bold">
                ₹{fmt(filteredTotal)}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
