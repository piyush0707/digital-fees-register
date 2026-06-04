"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueRecordPaymentModal } from "@/lib/offline/outbox";
import type { PaymentModalHead } from "./actions";
import type { PaymentMode } from "@/lib/types";

type ModalFeeHead =
  | "Tuition (auto-detected)"
  | "Annual"
  | "Exam (Sep)"
  | "Exam (Feb Pre-board)"
  | "Admission"
  | "Late Fine"
  | "P.Dues";

const FEE_HEAD_OPTIONS: ModalFeeHead[] = [
  "Tuition (auto-detected)",
  "Annual",
  "Exam (Sep)",
  "Exam (Feb Pre-board)",
  "Admission",
  "Late Fine",
  "P.Dues",
];

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

const SESSION = "2026-27";
const PRIOR_SESSION = "2025-26";

const PAYMENT_MODES: Array<{ label: string; emoji: string; value: PaymentMode }> = [
  { label: "Paid in cash", emoji: "💵", value: "Cash" },
  { label: "Cheque", emoji: "📃", value: "Cheque" },
  { label: "UPI", emoji: "📱", value: "UPI" },
  { label: "Bank transfer", emoji: "🏦", value: "Bank Transfer" },
];

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function parseAmt(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, "");
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

function headIsMultiMonth(head: ModalFeeHead): boolean {
  return head === "Tuition (auto-detected)";
}

// "2026-06" → "Jun 2026". Used in the modal subtitle so the cell-clicked
// month + year are immediately obvious (matches the mockup screenshot).
function formatPeriodLabel(period: string): string {
  const entry = MONTHS.find((m) => m.period === period);
  const year = period.slice(0, 4);
  return entry ? `${entry.label} ${year}` : period;
}

// Fill-in-order allocator: walk selected periods chronologically and
// pour the typed amount into each cell's remaining balance until it's
// covered, then move to the next. Any overpayment lands on the LAST
// selected period. This matches the principal's mental model ("the
// hundred rupees clears May before going to Jul").
function allocateMonthlyInOrder(
  amount: number,
  selectedPeriods: string[],
  base: number,
  paidByPeriod: Record<string, number>,
): Array<{ period: string; amount: number }> {
  if (selectedPeriods.length === 0) return [];
  const sorted = [...selectedPeriods].sort();
  const allocations: Array<{ period: string; amount: number }> = [];
  let remaining = amount;
  for (const p of sorted) {
    const paid = paidByPeriod[p] ?? 0;
    const cellRemaining = Math.max(0, base - paid);
    const give = Math.min(cellRemaining, remaining);
    if (give > 0) {
      allocations.push({ period: p, amount: give });
      remaining -= give;
    }
  }
  // Overpayment after every cell is at base — spill into the last
  // selected period.
  if (remaining > 0) {
    const last = sorted[sorted.length - 1];
    const idx = allocations.findIndex((a) => a.period === last);
    if (idx >= 0) {
      allocations[idx].amount += remaining;
    } else {
      allocations.push({ period: last, amount: remaining });
    }
  }
  return allocations;
}

// Formats a list of selected periods for the dialog subtitle. Groups
// consecutive same-year periods together so multi-month selections read
// naturally — e.g. ["2026-05","2026-07"] → "May, Jul 2026", and
// ["2026-12","2027-01"] → "Dec 2026, Jan 2027".
function formatSelectedPeriods(periods: string[]): string {
  if (periods.length === 0) return "";
  const sorted = [...periods].sort();
  const groups: Array<{ year: string; months: string[] }> = [];
  for (const p of sorted) {
    const year = p.slice(0, 4);
    const month = MONTHS.find((m) => m.period === p)?.label;
    if (!month) continue;
    const last = groups[groups.length - 1];
    if (last && last.year === year) {
      last.months.push(month);
    } else {
      groups.push({ year, months: [month] });
    }
  }
  return groups.map((g) => `${g.months.join(", ")} ${g.year}`).join(", ");
}

function mapHeadToSchema(head: ModalFeeHead): PaymentModalHead {
  switch (head) {
    case "Tuition (auto-detected)":
      return "Monthly";
    case "Annual":
      return "Annual";
    case "Exam (Sep)":
      return "Sep Exam";
    case "Exam (Feb Pre-board)":
      return "Feb Exam";
    case "P.Dues":
      return "P.Dues";
    case "Admission":
    case "Late Fine":
      return "Misc";
  }
}

export interface PaymentModalSibling {
  id: string;
  name: string;
  class: string;
}

export interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  familyId: string;
  // Context — used in the modal title + as the default "For" selection.
  contextStudentId: string;
  contextStudentName: string;
  contextClass: string;
  siblings: PaymentModalSibling[];
  // Per-student class-effective amounts so the Expected field can default
  // to a sensible value when the modal opens.
  monthlyExpected: number;
  annualExpected: number;
  sepExamExpected: number;
  febExamExpected: number;
  // Pre-fill — e.g. opening from a specific month cell sets that month as
  // the active chip and the default fee head to Tuition.
  initialFeeHead?: ModalFeeHead;
  initialPeriod?: string; // e.g. '2026-05'
  initialAmount?: number; // pre-fills the Amount field when opened from ⋯
  // Months already fully paid for this student — those chips are
  // rendered disabled (strikethrough, faded slate, not clickable) per
  // §6 "Already-paid months are disabled". The cell-clicked month stays
  // editable even when present here.
  paidPeriods?: string[];
  // Map of period → amount already collected. Used to compute Expected
  // as the SUM of remaining balances across whichever chips are active,
  // so multi-month picks correctly show e.g. (partial-May 100) +
  // (empty-Jul 1500) = 1600 instead of the raw base × count (3000).
  paidByPeriod?: Record<string, number>;
}

export function PaymentModal(props: PaymentModalProps) {
  const {
    open,
    onClose,
    familyId,
    contextStudentId,
    contextStudentName,
    contextClass,
    siblings,
    monthlyExpected,
    annualExpected,
    sepExamExpected,
    febExamExpected,
    initialFeeHead,
    initialPeriod,
    initialAmount,
    paidPeriods,
    paidByPeriod,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [feeHead, setFeeHead] = useState<ModalFeeHead>(
    initialFeeHead ?? "Tuition (auto-detected)",
  );
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>(() => {
    if (initialPeriod) return [initialPeriod];
    // Default to "today's month" — May 2026 in the v1 dev seed.
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, "0");
    const guess = `${yyyy}-${mm}`;
    return MONTHS.some((m) => m.period === guess) ? [guess] : ["2026-05"];
  });
  const [expectedStr, setExpectedStr] = useState("");
  const [amountStr, setAmountStr] = useState("");
  const [expectedTouched, setExpectedTouched] = useState(false);
  const [amountTouched, setAmountTouched] = useState(false);
  const [paidOn, setPaidOn] = useState<string>(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  });
  const [mode, setMode] = useState<PaymentMode>("Cash");
  const [notes, setNotes] = useState<string>("Paid in cash");
  // Default attribution = the student whose ⋯ was clicked. The Monthly
  // cell render keys `paymentsByStudentMonthly` on student_id, so a null
  // here ("Whole family") would record a payment that never appears in
  // any cell. The "For" chips still let the principal pick "Whole family"
  // or a sibling explicitly for multi-child families; single-child rows
  // (where the chip block is hidden) keep this default and the cell
  // updates as expected.
  const [paidForStudentId, setPaidForStudentId] = useState<string | null>(
    contextStudentId,
  );

  // Reset internal state when (re)opened so re-opening the dialog
  // doesn't keep stale state from a prior cell click.
  useEffect(() => {
    if (!open) return;
    setFeeHead(initialFeeHead ?? "Tuition (auto-detected)");
    setSelectedPeriods(initialPeriod ? [initialPeriod] : ["2026-05"]);
    setExpectedTouched(false);
    // If the cell carried an explicit amount (the principal had already
    // typed one before clicking ⋯), treat that as a user-touch so the
    // auto-recompute effect doesn't overwrite it.
    if (initialAmount !== undefined) {
      setAmountStr(String(initialAmount));
      setAmountTouched(true);
    } else {
      setAmountTouched(false);
    }
    setMode("Cash");
    setNotes("Paid in cash");
    // Same reasoning as the useState initializer above — default the
    // attribution to the cell-clicked student so the saved Monthly row
    // shows up in that row's cell.
    setPaidForStudentId(contextStudentId);
    const t = new Date();
    setPaidOn(
      `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`,
    );
  }, [open, initialFeeHead, initialPeriod, initialAmount, contextStudentId]);

  // Per-month base for the current head — drives the Expected default
  // (× selected month count for Tuition).
  function perPeriodBase(head: ModalFeeHead): number {
    switch (head) {
      case "Tuition (auto-detected)":
        return monthlyExpected;
      case "Annual":
        return annualExpected;
      case "Exam (Sep)":
        return sepExamExpected;
      case "Exam (Feb Pre-board)":
        return febExamExpected;
      default:
        return 0;
    }
  }

  // Auto-fill Expected + Amount unless the user has explicitly edited
  // them. For Monthly, Expected = Σ remaining(period) across every
  // selected chip, so toggling chips dynamically rebalances the figure.
  // Non-Monthly heads stay at base (single period each).
  useEffect(() => {
    const base = perPeriodBase(feeHead);
    let computed: number;
    if (headIsMultiMonth(feeHead)) {
      computed = selectedPeriods.reduce((sum, p) => {
        const paid = paidByPeriod?.[p] ?? 0;
        return sum + Math.max(0, base - paid);
      }, 0);
    } else {
      computed = base;
    }
    if (!expectedTouched) setExpectedStr(computed > 0 ? String(computed) : "");
    if (!amountTouched) setAmountStr(computed > 0 ? String(computed) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    feeHead,
    selectedPeriods,
    monthlyExpected,
    annualExpected,
    sepExamExpected,
    febExamExpected,
    paidByPeriod,
  ]);

  if (!open) return null;

  function togglePeriod(period: string) {
    if (!headIsMultiMonth(feeHead)) return;
    setSelectedPeriods((prev) => {
      if (prev.includes(period)) {
        if (prev.length === 1) return prev; // can't deselect all
        return prev.filter((p) => p !== period);
      }
      return [...prev, period].sort();
    });
  }

  function pickMode(value: PaymentMode, label: string) {
    if (mode === value) {
      // toggling an active chip clears it back to default Cash + empty
      setMode("Cash");
      setNotes("");
      return;
    }
    setMode(value);
    setNotes(label);
  }

  function handleSave() {
    const amount = parseAmt(amountStr);
    if (amount === null || amount <= 0) {
      toast.error("Amount must be a positive number");
      return;
    }
    let periods: string[];
    if (headIsMultiMonth(feeHead)) {
      if (selectedPeriods.length === 0) {
        toast.error("Pick at least one month");
        return;
      }
      periods = selectedPeriods;
    } else if (feeHead === "P.Dues") {
      periods = [PRIOR_SESSION];
    } else if (feeHead === "Admission" || feeHead === "Late Fine") {
      // Misc — use the paid_on month as period
      periods = [paidOn.slice(0, 7)];
    } else {
      // Annual / Sep Exam / Feb Exam — single, session string
      periods = [SESSION];
    }

    // For Monthly, allocate the typed amount across selected periods
    // in chronological order — filling each cell's remaining balance
    // before spilling into the next. Overpayment lands on the last
    // selected period. This means partial-May (100 owed) + empty-Jul
    // (1500 owed) with Amount=1500 lands as 100→May (paid) + 1400→Jul
    // (partial), not 750/750 even-split.
    const monthlyAllocations =
      headIsMultiMonth(feeHead) && paidByPeriod
        ? allocateMonthlyInOrder(
            amount,
            selectedPeriods,
            monthlyExpected,
            paidByPeriod,
          )
        : undefined;

    startTransition(async () => {
      const out = await enqueueRecordPaymentModal(
        {
          familyId,
          studentId: paidForStudentId,
          feeHead: mapHeadToSchema(feeHead),
          periods,
          amount,
          paidOn,
          paymentMode: mode,
          notes: notes.trim() === "" ? null : notes,
          monthlyAllocations,
        },
        `Payment · ${contextStudentName} · ${feeHead} · ₹${fmt(amount)}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Save failed: ${out.error}`);
        return;
      }
      const base = `Saved · ${contextStudentName} · ${feeHead} · ₹${fmt(amount)}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
    // Close the modal right away so the principal gets instant feedback;
    // the row updates when the server round-trip lands (or immediately
    // from the optimistic state if we're offline).
    onClose();
  }

  const showPaidFor = siblings.length > 0;
  const showPeriodChips = headIsMultiMonth(feeHead);

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onClose();
      }}
    >
      <div className="modal-card profile-form">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3 className="font-semibold text-slate-900">Record payment</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {contextStudentName}
              {headIsMultiMonth(feeHead) && selectedPeriods.length > 0
                ? ` · ${formatSelectedPeriods(selectedPeriods)}`
                : initialPeriod
                  ? ` · ${formatPeriodLabel(initialPeriod)}`
                  : ` · Class ${contextClass}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
            disabled={pending}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="modal-body">
          {/* Fee head */}
          <div>
            <label>Fee head</label>
            <select
              value={feeHead}
              onChange={(e) => setFeeHead(e.target.value as ModalFeeHead)}
              disabled={pending}
            >
              {FEE_HEAD_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>

          {/* For — only when siblings exist */}
          {showPaidFor && (
            <div>
              <label>
                For{" "}
                <span className="text-slate-400 font-normal">
                  (default: whole family — switch if parent pays for one child
                  only)
                </span>
              </label>
              <div className="period-chips">
                <button
                  type="button"
                  className={
                    "period-chip" + (paidForStudentId === null ? " active" : "")
                  }
                  onClick={() => setPaidForStudentId(null)}
                  disabled={pending}
                >
                  Whole family
                </button>
                <button
                  type="button"
                  className={
                    "period-chip" +
                    (paidForStudentId === contextStudentId ? " active" : "")
                  }
                  onClick={() => setPaidForStudentId(contextStudentId)}
                  disabled={pending}
                >
                  {contextStudentName.split(" ")[0]}
                </button>
                {siblings.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={
                      "period-chip" +
                      (paidForStudentId === s.id ? " active" : "")
                    }
                    onClick={() => setPaidForStudentId(s.id)}
                    disabled={pending}
                  >
                    {s.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Period chips — Monthly only */}
          {showPeriodChips && (
            <div>
              <label>
                Period{" "}
                <span className="text-slate-400 font-normal">
                  (click chips to include multiple months — for bulk payments)
                </span>
              </label>
              <div className="period-chips">
                {MONTHS.map(({ label, period }) => {
                  // §6 — already-paid months render disabled (strikethrough
                  // + faded slate via .period-chip:disabled). The
                  // cell-clicked month is exempt: it stays editable even
                  // if it has a balance, so the principal can adjust it.
                  const isAlreadyPaid =
                    (paidPeriods ?? []).includes(period) &&
                    period !== initialPeriod;
                  return (
                    <button
                      key={period}
                      type="button"
                      className={
                        "period-chip" +
                        (selectedPeriods.includes(period) ? " active" : "")
                      }
                      onClick={() => togglePeriod(period)}
                      disabled={pending || isAlreadyPaid}
                      title={
                        isAlreadyPaid ? `${label} is already paid` : undefined
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Expected + Amount.
              Expected is muted (slate background, lighter text) so the
              principal's eye lands on Amount — the action input. Expected
              stays editable for concession overrides but won't be typed
              into by accident. */}
          <div className="field-grid-2">
            <div>
              <label>
                Expected{" "}
                <span className="text-slate-400 font-normal">
                  {feeHead === "Tuition (auto-detected)"
                    ? "(remaining · edit for concession)"
                    : "(editable — apply concession here)"}
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={expectedStr}
                disabled={pending}
                onChange={(e) => {
                  setExpectedStr(e.target.value.replace(/[^0-9,]/g, ""));
                  setExpectedTouched(true);
                }}
                style={{
                  background: "#f8fafc",
                  color: "#475569",
                  borderColor: "#e2e8f0",
                  fontWeight: 400,
                }}
              />
            </div>
            <div>
              <label>
                Amount paid <span className="req">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                value={amountStr}
                disabled={pending}
                onChange={(e) => {
                  setAmountStr(e.target.value.replace(/[^0-9,]/g, ""));
                  setAmountTouched(true);
                }}
                className="font-semibold"
              />
            </div>
          </div>

          {/* Date paid */}
          <div>
            <label>Date paid</label>
            <input
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
              disabled={pending}
            />
          </div>

          {/* Payment method / notes */}
          <div>
            <label>Payment method / notes</label>
            <div className="notes-chips">
              {PAYMENT_MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={"notes-chip" + (mode === m.value ? " active" : "")}
                  onClick={() => pickMode(m.value, m.label)}
                  disabled={pending}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="Or type a custom note…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={pending}
            className="px-6 py-2 bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white rounded-md text-sm font-semibold shadow-sm disabled:opacity-60"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
