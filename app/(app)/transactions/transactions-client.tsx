"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import {
  listActivePaymentsBetween,
  listAllStudents,
  listFamilies,
} from "@/lib/queries";
import type { Family, Payment, Student } from "@/lib/types";
import { CLASS_LIST, formatClassLabel } from "@/lib/classes";
import { getTodayContext, type TodayContext } from "@/lib/today";

// §6 of Mockup_User_Functionality.md — "Total Transactions". Records money
// already collected; the forward-looking Expected / Outstanding view lives
// on the Dashboard, never duplicated here.
//
// Filtering is layered: the window chip is applied at the DB query (date
// range, via listActivePaymentsBetween in lib/queries.ts) so we don't pull
// the whole ledger; class + fee-head + name-search compose client-side on
// top of the windowed result. Realtime: subscribes to public.payments
// (publication enabled by supabase/migrations/0003_realtime_payments.sql)
// so a new row from /register lands here without a manual refresh.

type WindowKey = "all" | "year" | "month" | "custom";

// "Today" / current month are derived from lib/today.ts so this screen
// agrees with Register + Dashboard on what "this month" means in IST. The
// session window (April → March) is intentionally fixed for v1.
const SESSION_START = "2026-04-01"; // April → March session year (§6 spec)
const SESSION_END = "2027-03-31";

const FEE_HEADS = [
  "Monthly",
  "Annual",
  "Sep Exam",
  "Feb Exam",
  "P.Dues",
  "Misc",
] as const;
type FeeHead = (typeof FEE_HEADS)[number];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const PAGE_SIZE = 50;

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDmy(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${pad(d)} ${MONTH_NAMES[m - 1]} ${y}`;
}

function windowLabel(
  w: WindowKey,
  range: { from: string; to: string },
  today: TodayContext,
): string {
  if (w === "all") return "All time";
  if (w === "year") return "Session 2026–27";
  if (w === "month") return today.monthYearLabel;
  return `${formatDmy(range.from)} → ${formatDmy(range.to)}`;
}

function deriveWindowRange(
  w: WindowKey,
  custom: { from: string; to: string },
  today: TodayContext,
): { from: string | null; to: string | null } {
  if (w === "all") return { from: null, to: null };
  if (w === "year") return { from: SESSION_START, to: SESSION_END };
  if (w === "month") return { from: today.monthStart, to: today.monthEnd };
  return { from: custom.from, to: custom.to };
}

function forLabel(p: Payment): string {
  if (p.fee_head === "Monthly" && p.period) {
    const [y, m] = p.period.split("-");
    return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
  }
  if (p.fee_head === "Annual") return `${p.period ?? "2026-27"} session`;
  if (p.fee_head === "Sep Exam") return "Sep Exam";
  if (p.fee_head === "Feb Exam") return "Feb Exam";
  if (p.fee_head === "P.Dues") return "Previous-session dues";
  if (p.fee_head === "Misc" && p.period) {
    const [y, m] = p.period.split("-");
    return `${MONTH_NAMES[Number(m) - 1]} ${y} · misc`;
  }
  return p.fee_head;
}

export function TransactionsClient() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [families, setFamilies] = useState<Family[]>([]);
  const [loading, setLoading] = useState(true);

  // Asia/Kolkata "today" computed once per mount — same source as the
  // Register header + Dashboard tiles so the three screens always agree.
  const today = useMemo(() => getTodayContext(), []);

  // Filter state. Default window = This month (§6). Default class = Class 10.
  const [windowKey, setWindowKey] = useState<WindowKey>("month");
  const [customRange, setCustomRange] = useState({
    from: today.monthStart,
    to: today.monthEnd,
  });
  // Default to "All classes" — the Transactions screen is a school-wide
  // collections view, not per-class. The dropdown still offers Class 10
  // (and every other canonical class) for narrowing.
  const [classFilter, setClassFilter] = useState<string>("all");
  const [feeHeadFilter, setFeeHeadFilter] = useState<FeeHead | "all">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const dateRange = useMemo(
    () => deriveWindowRange(windowKey, customRange, today),
    [windowKey, customRange, today],
  );

  const refetch = useCallback(async () => {
    if (windowKey === "custom" && customRange.from > customRange.to) {
      toast.warning("Invalid date range — From must be on or before To");
      return;
    }
    setLoading(true);
    try {
      const [p, s, f] = await Promise.all([
        listActivePaymentsBetween(supabase, dateRange.from, dateRange.to),
        listAllStudents(supabase),
        listFamilies(supabase),
      ]);
      setPayments(p);
      setStudents(s);
      setFamilies(f);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load transactions: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, [dateRange.from, dateRange.to, windowKey, customRange.from, customRange.to]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  // Realtime — refetch whenever any payments row changes. §6 "Realtime:
  // subscribe to payments so new rows appear without a manual refresh".
  useEffect(() => {
    const channel = supabase
      .channel("transactions-payments")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "payments" },
        () => {
          void refetch();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  const studentById = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students],
  );
  const familyById = useMemo(
    () => new Map(families.map((f) => [f.id, f])),
    [families],
  );
  const studentsByFamily = useMemo(() => {
    const m = new Map<string, Student[]>();
    for (const s of students) {
      if (!s.family_id) continue;
      const arr = m.get(s.family_id) ?? [];
      arr.push(s);
      m.set(s.family_id, arr);
    }
    return m;
  }, [students]);

  // Build a denormalised view-model — one row per payment with joined
  // student / family / class / for / family-display fields, ready for the
  // table.
  const rows = useMemo(() => {
    return payments.map((p) => {
      const s = p.student_id ? studentById.get(p.student_id) ?? null : null;
      const fam = p.family_id ? familyById.get(p.family_id) ?? null : null;
      const famSiblings = p.family_id ? studentsByFamily.get(p.family_id) ?? [] : [];
      // Class: explicit student class, else family's primary student class.
      const primaryStudent =
        s ??
        [...famSiblings]
          .filter((st) => st.status === "active")
          .sort((a, b) => (a.roll_no ?? 999) - (b.roll_no ?? 999))[0] ??
        famSiblings[0] ??
        null;
      const cls = primaryStudent?.class ?? "—";
      const studentName = s?.name ?? primaryStudent?.name ?? fam?.father_name ?? "—";
      // Family display: primary name + first names of other active siblings
      // (sibling/family grouping via family_id only — §22).
      const otherSiblings = famSiblings
        .filter((x) => x.id !== (primaryStudent?.id ?? ""))
        .filter((x) => x.status === "active");
      const familyDisplay =
        otherSiblings.length === 0
          ? primaryStudent?.name ?? studentName
          : `${primaryStudent?.name ?? studentName} + ${otherSiblings
              .map((x) => x.name.split(" ")[0])
              .join(" + ")}`;
      return {
        payment: p,
        studentName,
        cls,
        familyDisplay,
        forLabel: forLabel(p),
      };
    });
  }, [payments, studentById, familyById, studentsByFamily]);

  // Apply secondary filters (class / fee head / name search).
  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return rows.filter((r) => {
      if (classFilter !== "all" && r.cls !== classFilter) return false;
      if (feeHeadFilter !== "all" && r.payment.fee_head !== feeHeadFilter)
        return false;
      if (q && !r.studentName.toUpperCase().includes(q) && !r.familyDisplay.toUpperCase().includes(q))
        return false;
      return true;
    });
  }, [rows, classFilter, feeHeadFilter, search]);

  // KPI tiles — reflect the WINDOW chip only (not the secondary filters).
  // Cash + UPI/Online (non-Cash) ALWAYS sum to Total Collected (§6 invariant).
  const kpi = useMemo(() => {
    let collected = 0,
      cash = 0,
      online = 0;
    let nCollected = 0,
      nCash = 0,
      nOnline = 0;
    for (const p of payments) {
      collected += p.amount;
      nCollected += 1;
      if (p.payment_mode === "Cash") {
        cash += p.amount;
        nCash += 1;
      } else {
        online += p.amount;
        nOnline += 1;
      }
    }
    return { collected, cash, online, nCollected, nCash, nOnline };
  }, [payments]);

  // Pagination.
  useEffect(() => {
    setPage(1);
  }, [classFilter, feeHeadFilter, search, windowKey, customRange.from, customRange.to]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const wLabel = windowLabel(windowKey, customRange, today);
  const filteredWindowTotal = filtered.reduce((s, r) => s + r.payment.amount, 0);

  return (
    <section className="min-h-screen py-8 px-6 bg-slate-50">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* KPI tiles */}
          <div className="tx-kpi-grid">
            <div className="tx-kpi-tile collected">
              <div className="kpi-label">Total Collected</div>
              <div className="kpi-value">₹{fmt(kpi.collected)}</div>
              <div className="kpi-sub">
                {wLabel} · {kpi.nCollected} payment{kpi.nCollected === 1 ? "" : "s"}
              </div>
            </div>
            <div className="tx-kpi-tile cash">
              <div className="kpi-label">Cash payments</div>
              <div className="kpi-value">₹{fmt(kpi.cash)}</div>
              <div className="kpi-sub">
                {kpi.nCash} payment{kpi.nCash === 1 ? "" : "s"} · in hand
              </div>
            </div>
            <div className="tx-kpi-tile upi">
              <div className="kpi-label">UPI / Online</div>
              <div className="kpi-value">₹{fmt(kpi.online)}</div>
              <div className="kpi-sub">
                {kpi.nOnline} payment{kpi.nOnline === 1 ? "" : "s"} · to bank
              </div>
            </div>
          </div>

          {/* Filter bar */}
          <div className="tx-filter-bar">
            <span className="filter-label">Window</span>
            {(
              [
                { k: "all", label: "All time" },
                { k: "year", label: "This year" },
                { k: "month", label: "This month" },
                { k: "custom", label: "Custom" },
              ] as Array<{ k: WindowKey; label: string }>
            ).map(({ k, label }) => (
              <button
                key={k}
                type="button"
                className={"tx-filter-chip" + (windowKey === k ? " active" : "")}
                onClick={() => setWindowKey(k)}
              >
                {label}
              </button>
            ))}
            <span className={"tx-custom-range" + (windowKey === "custom" ? " open" : "")}>
              <input
                type="date"
                value={customRange.from}
                onChange={(e) =>
                  setCustomRange((r) => ({ ...r, from: e.target.value }))
                }
                aria-label="From date"
              />
              <span className="tx-range-sep">–</span>
              <input
                type="date"
                value={customRange.to}
                onChange={(e) =>
                  setCustomRange((r) => ({ ...r, to: e.target.value }))
                }
                aria-label="To date"
              />
            </span>

            <div className="tx-filter-secondary">
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                title="Filter by class"
              >
                <option value="all">All classes</option>
                {CLASS_LIST.map((c) => (
                  <option key={c} value={c}>
                    {formatClassLabel(c)}
                  </option>
                ))}
              </select>
              <select
                value={feeHeadFilter}
                onChange={(e) =>
                  setFeeHeadFilter(e.target.value as FeeHead | "all")
                }
                title="Filter by fee head"
              >
                <option value="all">All fee heads</option>
                {FEE_HEADS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student name…"
              />
            </div>
          </div>

          {/* Table */}
          <div className="total-tx-table-wrap">
            <table className="total-tx-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Family</th>
                  <th>Fee head</th>
                  <th>For</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th>Method</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-500">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading && pageRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-slate-500 italic">
                      No payments in this window with the current filters.
                    </td>
                  </tr>
                )}
                {!loading &&
                  pageRows.map((r) => (
                    <tr key={r.payment.id}>
                      <td>{formatDmy(r.payment.paid_on)}</td>
                      <td className="tx-student">{r.studentName}</td>
                      <td>{r.cls === "—" ? "—" : `Class ${r.cls}`}</td>
                      <td className="tx-family">{r.familyDisplay}</td>
                      <td>{r.payment.fee_head}</td>
                      <td>{r.forLabel}</td>
                      <td className="tx-amount">₹{fmt(r.payment.amount)}</td>
                      <td className="tx-method">{r.payment.payment_mode}</td>
                      <td>{r.payment.notes ? r.payment.notes : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          {/* Summary footer */}
          <div className="tx-summary-line">
            <span>
              <strong>{filtered.length}</strong> record
              {filtered.length === 1 ? "" : "s"} · sorted by date desc
              {totalPages > 1 && (
                <>
                  {" "}· page {page} of {totalPages}
                </>
              )}
            </span>
            <span>
              Window total: <strong>₹{fmt(filteredWindowTotal)}</strong>
              {totalPages > 1 && (
                <span className="ml-3 inline-flex items-center gap-1">
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs disabled:opacity-50"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-xs disabled:opacity-50"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next →
                  </button>
                </span>
              )}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
