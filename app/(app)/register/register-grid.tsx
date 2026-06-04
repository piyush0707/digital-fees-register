"use client";

// Day 7b — client wrapper around the register grid. Receives the
// server-rendered RegisterPayload as initial props, then subscribes to the
// Dexie outbox and re-derives the EFFECTIVE rendered payload by overlaying
// pending/failed mutations. Online this is a no-op (entries leave the
// outbox the instant they sync); offline, edits show up immediately.
//
// All the existing cell components are unchanged — they just consume the
// overlay-derived data instead of the raw server snapshot. The pending-
// sync hint is rendered as a subtle amber dot on synthetic rows + a
// `pending-sync` class on cells with a queued mutation (CSS-only — see
// `app/globals.css`).

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { liveQuery, type Subscription } from "dexie";
import type { Family, Payment, Student } from "@/lib/types";
import type { RegisterPayload } from "@/lib/queries";
import { getOfflineDB, type OutboxEntry } from "@/lib/offline/db";
import {
  applyOverlay,
  type EffectiveEntry,
  type OverlaySnapshot,
} from "@/lib/offline/overlay";
import {
  getRecentSynced,
  subscribeRecentSynced,
  type RecentSyncedEntry,
} from "@/lib/offline/recent-synced";
import { formatClassLabel } from "@/lib/classes";
import { getTodayContext } from "@/lib/today";
import { MonthCell } from "./month-cell";
import { ExamCell } from "./exam-cell";
import { TFeesCell } from "./tfees-cell";
import { PDuesCell } from "./pdues-cell";
import { MonthlyCell } from "./monthly-cell";
import { RowControls } from "./row-controls";

const SESSION = "2026-27";

const MONTHS: Array<{ label: string; period: string }> = [
  { label: "Apr", period: "2026-04" },
  { label: "May", period: "2026-05" },
  { label: "Jun", period: "2026-06" },
  { label: "Jul", period: "2026-07" },
  { label: "Aug", period: "2026-08" },
  { label: "Sep", period: "2026-09" },
  { label: "Oct", period: "2026-10" },
  { label: "Nov", period: "2026-11" },
  { label: "Dec", period: "2026-12" },
  { label: "Jan", period: "2027-01" },
  { label: "Feb", period: "2027-02" },
  { label: "Mar", period: "2027-03" },
];

const ROMAN: Record<string, string> = {
  "1": "I", "2": "II", "3": "III", "4": "IV", "5": "V", "6": "VI",
  "7": "VII", "8": "VIII", "9": "IX", "10": "X", "11": "XI", "12": "XII",
};

function classLabel(cls: string): string {
  return ROMAN[cls] ?? cls;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function isPastOrCurrent(period: string, todayMonthPeriod: string): boolean {
  return period <= todayMonthPeriod;
}

export interface RegisterGridProps {
  initialPayload: RegisterPayload;
  currentClass: string;
}

export function RegisterGrid({ initialPayload, currentClass }: RegisterGridProps) {
  const [outboxEntries, setOutboxEntries] = useState<OutboxEntry[]>([]);
  // Phase 6a — synced-buffer subscription. `syncedEntries` is reactive
  // module state from lib/offline/recent-synced.ts.
  const [syncedEntries, setSyncedEntries] = useState<RecentSyncedEntry[]>(
    () => (typeof window === "undefined" ? [] : getRecentSynced()),
  );
  // Dynamic today / month — recomputed each render so the totals + cell
  // "past or current" logic agree with the page header's MTD label.
  const { today, currentMonthPeriod, monthStart, monthEnd } = useMemo(
    () => getTodayContext(),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    let sub: Subscription | null = null;
    try {
      const db = getOfflineDB();
      // Both pending AND failed entries contribute to the overlay — a failed
      // entry is something the principal still expects to see on screen
      // until they explicitly Discard it via the unsynced-changes panel.
      sub = liveQuery(() =>
        db.outbox.where("status").anyOf("pending", "syncing", "failed").toArray(),
      ).subscribe({
        next: (rows) => setOutboxEntries(rows),
        error: () => setOutboxEntries([]),
      });
    } catch {
      // SSR / IndexedDB unavailable — render the server snapshot as-is.
    }
    return () => {
      sub?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSyncedEntries(getRecentSynced());
    return subscribeRecentSynced(() => setSyncedEntries(getRecentSynced()));
  }, []);

  // Phase 6a — track which initialPayload snapshot we last rendered. When a
  // NEW payload arrives (router.refresh delivered the post-sync RSC),
  // snapshot the synced ids that were live at that moment — those writes
  // are now in the payload, so the overlay should skip them. Subsequent
  // syncs that land AFTER this payload stay in the buffer and keep being
  // applied so the cell doesn't flash. Done synchronously during render via
  // useRef so the same-render overlay pass already sees the exclusion.
  const lastPayloadRef = useRef<RegisterPayload | null>(null);
  const seenSyncedIdsRef = useRef<Set<string>>(new Set());
  if (lastPayloadRef.current !== initialPayload) {
    lastPayloadRef.current = initialPayload;
    const next = new Set<string>();
    for (const e of getRecentSynced()) next.add(e.id);
    seenSyncedIdsRef.current = next;
  }

  const visibleSyncedEntries = syncedEntries.filter(
    (e) => !seenSyncedIdsRef.current.has(e.id),
  );

  const effectiveEntries: EffectiveEntry[] =
    outboxEntries.length === 0 && visibleSyncedEntries.length === 0
      ? []
      : [
          ...outboxEntries.map((e) => ({
            id: e.id,
            op: e.op,
            payload: e.payload,
            tempIds: e.tempIds,
            createdAt: e.createdAt,
            isSynced: false as const,
          })),
          ...visibleSyncedEntries.map((e) => ({
            id: e.id,
            op: e.op,
            payload: e.payload,
            tempIds: e.tempIds,
            createdAt: e.createdAt,
            isSynced: true as const,
            outcome: e.outcome,
            resolvedStudentId: e.resolvedStudentId,
          })),
        ];

  const effective: OverlaySnapshot =
    effectiveEntries.length === 0
      ? {
          ...initialPayload,
          pendingStudentIds: new Set<string>(),
          patchedStudentIds: new Set<string>(),
          pendingPaymentKeys: new Set<string>(),
          pendingFamilyKeys: new Set<string>(),
          pendingMonthlyOverrideStudentIds: new Set<string>(),
          pendingPDuesFamilyIds: new Set<string>(),
        }
      : applyOverlay(initialPayload, effectiveEntries, currentClass);

  // Sort & bucket exactly as page.tsx did.
  const classStudents = [...effective.students].sort(
    (a, b) => (a.roll_no ?? 9999) - (b.roll_no ?? 9999),
  );
  const fee = effective.fee_structure;
  const familyById = new Map<string, Family>(
    effective.families.map((f) => [f.id, f]),
  );
  const studentsByFamily = new Map<string | null, Student[]>();
  for (const s of [...classStudents, ...effective.siblings]) {
    const arr = studentsByFamily.get(s.family_id) ?? [];
    arr.push(s);
    studentsByFamily.set(s.family_id, arr);
  }

  const paymentsByStudentMonthly = new Map<string, Payment[]>();
  const paymentsByStudentHead = new Map<string, Payment[]>();
  const paymentsByFamilyHead = new Map<string, Payment[]>();
  const isStudentScopedHead = (h: string) =>
    h === "Annual" || h === "Sep Exam" || h === "Feb Exam";
  for (const p of effective.payments) {
    if (p.status !== "active") continue;
    if (p.fee_head === "Monthly" && p.student_id) {
      const k = `${p.student_id}|${p.period}`;
      const arr = paymentsByStudentMonthly.get(k) ?? [];
      arr.push(p);
      paymentsByStudentMonthly.set(k, arr);
    } else if (isStudentScopedHead(p.fee_head) && p.student_id) {
      const k = `${p.student_id}|${p.fee_head}|${p.period ?? ""}`;
      const arr = paymentsByStudentHead.get(k) ?? [];
      arr.push(p);
      paymentsByStudentHead.set(k, arr);
    } else if (p.family_id) {
      const k = `${p.family_id}|${p.fee_head}|${p.period ?? ""}`;
      const arr = paymentsByFamilyHead.get(k) ?? [];
      arr.push(p);
      paymentsByFamilyHead.set(k, arr);
    }
  }

  const monthlyDefault = fee?.monthly_fee ?? 0;
  const annualDefault = fee?.annual_fee ?? 0;
  const sepExamDefault = fee?.sep_exam_fee ?? 400;
  const febExamDefault = fee?.feb_exam_fee ?? 400;

  const todayTotal = effective.payments
    .filter((p) => p.status === "active" && p.paid_on === today)
    .reduce((s, p) => s + p.amount, 0);
  const mtdTotal = effective.payments
    .filter(
      (p) =>
        p.status === "active" &&
        p.paid_on >= monthStart &&
        p.paid_on <= monthEnd,
    )
    .reduce((s, p) => s + p.amount, 0);

  return (
    <>
      {/* Top summary row carries the small totals + the sticky New-Entry */}
      <div className="hidden" data-totals data-today={todayTotal} data-mtd={mtdTotal} />
      <div className="register-scroll">
        <table id="register-table" className="w-full">
          <thead>
            <tr>
              <th className="grid-head sticky-col sticky-col-roll">Roll</th>
              <th
                className="grid-head sticky-col sticky-col-name"
                style={{ textAlign: "left", paddingLeft: 16 }}
              >
                Name of Students
              </th>
              <th
                className="grid-head sticky-col sticky-col-anchor"
                data-anchor-pos="1"
                style={{ background: "#475569" }}
              >
                P.Dues
              </th>
              <th
                className="grid-head sticky-col sticky-col-anchor"
                data-anchor-pos="2"
                style={{ background: "#475569" }}
              >
                T.Fees
              </th>
              <th
                className="grid-head sticky-col sticky-col-anchor"
                data-anchor-pos="3"
                style={{ background: "#475569" }}
              >
                Monthly
              </th>
              <th className="grid-head">Apr</th>
              <th className="grid-head">May</th>
              <th className="grid-head">Jun</th>
              <th className="grid-head">Jul</th>
              <th className="grid-head">Aug</th>
              <th className="grid-head" style={{ background: "#15803d" }}>
                Sep Exam
              </th>
              <th className="grid-head">Sep</th>
              <th className="grid-head">Oct</th>
              <th className="grid-head">Nov</th>
              <th className="grid-head">Dec</th>
              <th className="grid-head">Jan</th>
              <th className="grid-head" style={{ background: "#15803d" }}>
                Feb Exam
              </th>
              <th className="grid-head">Feb</th>
              <th className="grid-head">Mar</th>
              <th
                className="grid-head sticky-col sticky-col-pending"
                style={{ background: "#991b1b" }}
              >
                Pending
              </th>
            </tr>
          </thead>
          <tbody className="text-center">
            {classStudents.map((student) =>
              renderRow({
                student,
                familyById,
                studentsByFamily,
                paymentsByStudentMonthly,
                paymentsByStudentHead,
                paymentsByFamilyHead,
                monthlyDefault,
                annualDefault,
                sepExamDefault,
                febExamDefault,
                pendingStudentIds: effective.pendingStudentIds,
                pendingPaymentKeys: effective.pendingPaymentKeys,
                pendingMonthlyOverrideStudentIds:
                  effective.pendingMonthlyOverrideStudentIds,
                pendingPDuesFamilyIds: effective.pendingPDuesFamilyIds,
                todayMonthPeriod: currentMonthPeriod,
              }),
            )}
          </tbody>
        </table>
      </div>
      <RegisterTotalsHydrator todayTotal={todayTotal} mtdTotal={mtdTotal} />
    </>
  );
}

// Patches the "Today / May MTD" totals in the header row (rendered by the
// server page) when the overlay changes them. The header is server HTML so
// we update its text nodes in place rather than hoisting all of it into
// this client component — minimal disruption, no extra round-trip needed.
function RegisterTotalsHydrator(props: { todayTotal: number; mtdTotal: number }) {
  const { todayTotal, mtdTotal } = props;
  useEffect(() => {
    const todayEl = document.querySelector("[data-totals-today]");
    if (todayEl) todayEl.textContent = "₹" + fmt(todayTotal);
    const mtdEl = document.querySelector("[data-totals-mtd]");
    if (mtdEl) mtdEl.textContent = "₹" + fmt(mtdTotal);
  }, [todayTotal, mtdTotal]);
  return null;
}

function renderRow(ctx: {
  student: Student;
  familyById: Map<string, Family>;
  studentsByFamily: Map<string | null, Student[]>;
  paymentsByStudentMonthly: Map<string, Payment[]>;
  paymentsByStudentHead: Map<string, Payment[]>;
  paymentsByFamilyHead: Map<string, Payment[]>;
  monthlyDefault: number;
  annualDefault: number;
  sepExamDefault: number;
  febExamDefault: number;
  pendingStudentIds: Set<string>;
  pendingPaymentKeys: Set<string>;
  pendingMonthlyOverrideStudentIds: Set<string>;
  pendingPDuesFamilyIds: Set<string>;
  todayMonthPeriod: string;
}) {
  const {
    student,
    familyById,
    studentsByFamily,
    paymentsByStudentMonthly,
    paymentsByStudentHead,
    paymentsByFamilyHead,
    monthlyDefault,
    annualDefault,
    sepExamDefault,
    febExamDefault,
    pendingStudentIds,
    pendingPaymentKeys,
    pendingMonthlyOverrideStudentIds,
    pendingPDuesFamilyIds,
    todayMonthPeriod,
  } = ctx;

  const familyId = student.family_id ?? "";
  const family = student.family_id ? familyById.get(student.family_id) : undefined;
  const siblings = student.family_id
    ? (studentsByFamily.get(student.family_id) ?? []).filter(
        (s) => s.id !== student.id,
      )
    : [];

  const monthlyExpected = student.monthly_fee_override ?? monthlyDefault;
  const annualExpected = student.term_fees_override ?? annualDefault;
  const sepExamExpected = student.exam_fees_override ?? sepExamDefault;
  const febExamExpected = student.exam_fees_override ?? febExamDefault;

  const pDuesPayments =
    paymentsByFamilyHead.get(`${familyId}|P.Dues|2025-26`) ?? [];
  const pDuesPaid = pDuesPayments.reduce((s, p) => s + p.amount, 0);
  const pDuesRemaining = Math.max(0, (family?.p_dues ?? 0) - pDuesPaid);

  const annualPaid = (
    paymentsByStudentHead.get(`${student.id}|Annual|${SESSION}`) ?? []
  ).reduce((s, p) => s + p.amount, 0);
  const annualOk = annualPaid >= annualExpected;

  const monthCells = MONTHS.map(({ period }) => {
    const paid = (
      paymentsByStudentMonthly.get(`${student.id}|${period}`) ?? []
    ).reduce((s, p) => s + p.amount, 0);
    return { period, paid };
  });
  const paidPeriods = monthCells
    .filter((c) => monthlyExpected > 0 && c.paid >= monthlyExpected)
    .map((c) => c.period);
  const paidByPeriod: Record<string, number> = Object.fromEntries(
    monthCells.map((c) => [c.period, c.paid]),
  );

  const monthArrears = monthCells
    .filter(
      (c) => isPastOrCurrent(c.period, todayMonthPeriod) && c.paid < monthlyExpected,
    )
    .reduce((s, c) => s + (monthlyExpected - c.paid), 0);

  const annualArrears = annualOk ? 0 : Math.max(0, annualExpected - annualPaid);
  const pending = pDuesRemaining + monthArrears + annualArrears;

  const sepExamPaid = (
    paymentsByStudentHead.get(`${student.id}|Sep Exam|${SESSION}`) ?? []
  ).reduce((s, p) => s + p.amount, 0);
  const febExamPaid = (
    paymentsByStudentHead.get(`${student.id}|Feb Exam|${SESSION}`) ?? []
  ).reduce((s, p) => s + p.amount, 0);

  const isPendingRow = pendingStudentIds.has(student.id);
  const rowClass =
    "family-row" +
    (student.status === "withdrawn" ? " withdrawn" : "") +
    (isPendingRow ? " family-row-pending-sync" : "");

  const modalSiblings = siblings.map((s) => ({
    id: s.id,
    name: s.name,
    class: s.class,
  }));
  const hasConcession =
    student.monthly_fee_override !== null ||
    student.term_fees_override !== null ||
    student.exam_fees_override !== null;

  // Per-cell pending-sync dot fires ONLY when that specific cell has a
  // queued mutation. Synthetic-create rows surface their unsynced state via
  // the row tint + name chip below — they shouldn't blanket-dot every cell.
  const monthlyAnchorPending = pendingMonthlyOverrideStudentIds.has(student.id);
  const pDuesAnchorPending =
    student.family_id !== null &&
    pendingPDuesFamilyIds.has(student.family_id);
  const annualPending = pendingPaymentKeys.has(
    `${student.id}|Annual|${SESSION}`,
  );
  const sepPending = pendingPaymentKeys.has(
    `${student.id}|Sep Exam|${SESSION}`,
  );
  const febPending = pendingPaymentKeys.has(
    `${student.id}|Feb Exam|${SESSION}`,
  );

  return (
    <tr key={student.id} data-student-id={student.id} className={rowClass}>
      <td className="grid-cell sticky-col sticky-col-roll">
        <strong>{student.roll_no ?? ""}</strong>
      </td>
      <td
        className="grid-cell sticky-col sticky-col-name"
        style={{ textAlign: "left" }}
      >
        <div className="family-name-primary">
          {student.name}
          {hasConcession && (
            <span
              className="concession-chip"
              title={student.concession_reason || "Concession applied"}
            >
              Concession
            </span>
          )}
          {isPendingRow && (
            <span
              className="pending-sync-chip"
              title="Queued offline · will sync when you reconnect"
            >
              Pending sync
            </span>
          )}
        </div>
        {siblings.length > 0 && (
          <div className="sibling-line">
            {siblings.map((sib) => {
              // §22 line 969 + §D3 lines 644–645 — sibling chip is a
              // deep-link to that sibling's class register, with the
              // existing RowHighlighter amber-flashing their row.
              const sibFirst = sib.name.split(" ")[0];
              const href = `/register?class=${encodeURIComponent(sib.class)}&highlight=${encodeURIComponent(sib.id)}`;
              // axe label-content-name-mismatch — the accessible name must
              // start with the chip's visible text ("KAVYA · VIII") so the
              // SR announcement and the visual label agree. We tack the
              // extra context on after a dash.
              const visible = `${sibFirst} · ${classLabel(sib.class)}`;
              return (
                <Link
                  key={sib.id}
                  href={href}
                  className="sibling-chip"
                  aria-label={`${visible} — open ${formatClassLabel(sib.class)} register`}
                  title={`Jump to ${sib.name} · ${formatClassLabel(sib.class)}`}
                >
                  {visible}
                </Link>
              );
            })}
          </div>
        )}
        <RowControls
          student={student}
          family={family ?? null}
          siblings={siblings}
        />
      </td>

      <PDuesCell
        familyId={familyId}
        familyLabel={student.name}
        pduesBase={family?.p_dues ?? 0}
        remaining={pDuesRemaining}
        pendingSync={pDuesAnchorPending}
      />

      <TFeesCell
        studentId={student.id}
        studentName={student.name}
        session={SESSION}
        annualExpected={annualExpected}
        annualPaid={annualOk}
        concessionReason={student.concession_reason}
        pendingSync={annualPending}
      />

      <MonthlyCell
        studentId={student.id}
        studentName={student.name}
        monthlyExpected={monthlyExpected}
        classDefault={monthlyDefault}
        concessionReason={student.concession_reason}
        pendingSync={monthlyAnchorPending}
      />

      {MONTHS.slice(0, 5).map(({ label, period }) => {
        const c = monthCells.find((m) => m.period === period)!;
        const cellPending = pendingPaymentKeys.has(
          `${student.id}|Monthly|${period}`,
        );
        return (
          <MonthCell
            key={period}
            familyId={familyId}
            studentId={student.id}
            studentName={student.name}
            studentClass={student.class}
            monthLabel={label}
            period={period}
            paid={c.paid}
            expected={monthlyExpected}
            past={isPastOrCurrent(period, todayMonthPeriod)}
            siblings={modalSiblings}
            annualExpected={annualExpected}
            sepExamExpected={sepExamExpected}
            febExamExpected={febExamExpected}
            paidPeriods={paidPeriods}
            paidByPeriod={paidByPeriod}
            concessionReason={student.concession_reason}
            pendingSync={cellPending}
          />
        );
      })}

      <ExamCell
        studentId={student.id}
        studentName={student.name}
        feeHead="Sep Exam"
        session={SESSION}
        defaultAmount={sepExamExpected}
        paid={sepExamPaid}
        concessionReason={student.concession_reason}
        pendingSync={sepPending}
      />

      {MONTHS.slice(5, 10).map(({ label, period }) => {
        const c = monthCells.find((m) => m.period === period)!;
        const cellPending = pendingPaymentKeys.has(
          `${student.id}|Monthly|${period}`,
        );
        return (
          <MonthCell
            key={period}
            familyId={familyId}
            studentId={student.id}
            studentName={student.name}
            studentClass={student.class}
            monthLabel={label}
            period={period}
            paid={c.paid}
            expected={monthlyExpected}
            past={isPastOrCurrent(period, todayMonthPeriod)}
            siblings={modalSiblings}
            annualExpected={annualExpected}
            sepExamExpected={sepExamExpected}
            febExamExpected={febExamExpected}
            paidPeriods={paidPeriods}
            paidByPeriod={paidByPeriod}
            concessionReason={student.concession_reason}
            pendingSync={cellPending}
          />
        );
      })}

      <ExamCell
        studentId={student.id}
        studentName={student.name}
        feeHead="Feb Exam"
        session={SESSION}
        defaultAmount={febExamExpected}
        paid={febExamPaid}
        concessionReason={student.concession_reason}
        pendingSync={febPending}
      />

      {MONTHS.slice(10).map(({ label, period }) => {
        const c = monthCells.find((m) => m.period === period)!;
        const cellPending = pendingPaymentKeys.has(
          `${student.id}|Monthly|${period}`,
        );
        return (
          <MonthCell
            key={period}
            familyId={familyId}
            studentId={student.id}
            studentName={student.name}
            studentClass={student.class}
            monthLabel={label}
            period={period}
            paid={c.paid}
            expected={monthlyExpected}
            past={isPastOrCurrent(period, todayMonthPeriod)}
            siblings={modalSiblings}
            annualExpected={annualExpected}
            sepExamExpected={sepExamExpected}
            febExamExpected={febExamExpected}
            paidPeriods={paidPeriods}
            paidByPeriod={paidByPeriod}
            concessionReason={student.concession_reason}
            pendingSync={cellPending}
          />
        );
      })}

      <td
        className={
          "grid-cell sticky-col sticky-col-pending pending-cell " +
          (pending > 0 ? "pending-due" : "pending-zero")
        }
      >
        {pending > 0 ? fmt(pending) : 0}
      </td>
    </tr>
  );
}
