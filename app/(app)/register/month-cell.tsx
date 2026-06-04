"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueRecordMonthly } from "@/lib/offline/outbox";
import { PaymentModal, type PaymentModalSibling } from "./payment-modal";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

export function MonthCell(props: {
  familyId: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  monthLabel: string;
  period: string;
  paid: number;
  expected: number;
  past: boolean;
  // PaymentModal context — used when the ⋯ escape-hatch is clicked.
  siblings: PaymentModalSibling[];
  annualExpected: number;
  sepExamExpected: number;
  febExamExpected: number;
  // Periods already fully paid (>= monthlyExpected) for this student.
  // The PaymentModal greys + disables those chips per §6.
  paidPeriods: string[];
  // Map of period → amount paid so far for this student. Lets the
  // PaymentModal compute Expected as the sum of remaining balances
  // across whatever periods the principal selects.
  paidByPeriod: Record<string, number>;
  // Free-text reason for the waiver / concession (FB#7 tooltip).
  concessionReason: string | null;
  // Day 7b — true when an outbox entry mutating this cell is pending/failed.
  // Renders the subtle amber "pending sync" dot via CSS (no palette change).
  pendingSync?: boolean;
}) {
  const {
    familyId,
    studentId,
    studentName,
    studentClass,
    monthLabel,
    period,
    paid,
    expected,
    past,
    siblings,
    annualExpected,
    sepExamExpected,
    febExamExpected,
    paidPeriods,
    paidByPeriod,
    concessionReason,
    pendingSync,
  } = props;
  // FB#7 — when monthly is waived (expected === 0), the cell becomes
  // a non-editable soft-green "Waived" affordance instead of the usual
  // red "due" or grey "future".
  const isWaived = expected === 0;

  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  // ⋯ escape-hatch — opens the full Payment modal pre-filled with this
  // student + month (§5 / §6). Mounted per cell so its state is local.
  const [paymentOpen, setPaymentOpen] = useState(false);
  // Carry the amount typed before the user clicked ⋯, so the modal's
  // Amount field pre-fills with what they had already entered.
  const [moreInitialAmount, setMoreInitialAmount] = useState<number | null>(
    null,
  );

  // Optimistic display: as soon as the user commits, show the new amount
  // immediately instead of waiting for router.refresh() to round-trip the
  // server data back. Cleared in the effect below when fresh `paid` arrives.
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);

  // Remember what the input was pre-filled with, so we can tell "user
  // didn't touch this" (silent cancel) apart from "user changed and bailed"
  // (warn toast).
  const initialPreFillRef = useRef("");

  // Set true when an Esc / Enter / blur-delete has already given its own
  // feedback (silent or toasted), so the input's blur event on unmount
  // doesn't fire a second toast.
  const skipBlurToastRef = useRef(false);

  useEffect(() => {
    setPendingAmount(null);
  }, [paid]);

  const effectivePaid = pendingAmount !== null ? pendingAmount : paid;

  function startEdit() {
    if (editing || pending) return;
    if (isWaived) return; // waived cells aren't editable (FB#7)
    // Pre-fill with the current paid amount if there is one, otherwise the
    // class monthly expected — lets the Principal nudge an existing partial
    // upward without first having to clear it. Uses `effectivePaid` (not
    // raw `paid`) so a freshly-saved optimistic value is honoured even if
    // the router refresh hasn't landed the new prop yet.
    const preFill =
      effectivePaid > 0 ? String(effectivePaid) : String(expected);
    initialPreFillRef.current = preFill;
    setValue(preFill);
    setEditing(true);
  }

  function clearEditing() {
    setEditing(false);
    setValue("");
  }

  function doSave(amount: number) {
    skipBlurToastRef.current = true;
    setPendingAmount(amount);
    clearEditing();
    startTransition(async () => {
      const out = await enqueueRecordMonthly(
        { studentId, period, amount },
        amount === 0
          ? `Clear · ${studentName} · ${monthLabel}`
          : `Payment · ${studentName} · ${monthLabel} · ₹${fmt(amount)}`,
      );
      // Online failure → clear optimistic + surface error. Online success →
      // toast + router.refresh (parity with pre-Day-7a behaviour).
      // Offline → keep the optimistic state visible, skip router.refresh
      // (there's no server to re-fetch from), and let the sync badge tell
      // the principal it's queued.
      if (!out.ok && out.online) {
        setPendingAmount(null);
        toast.error(`Save failed: ${out.error}`);
        return;
      }
      const baseMsg =
        amount === 0
          ? `Cleared · ${studentName} · ${monthLabel}`
          : `Saved · ${studentName} · ${monthLabel} · ₹${fmt(amount)}`;
      if (out.online) {
        toast.success(baseMsg);
        router.refresh();
      } else {
        toast.success(`${baseMsg} · queued offline`);
      }
    });
  }

  // Enter pressed. Empty and 0 are equivalent — both mean "clear this cell".
  function commit() {
    const trimmed = value.trim();
    const amount = trimmed === "" ? 0 : parseAmount(trimmed);

    if (amount === null) {
      // Non-numeric junk — silent cancel.
      skipBlurToastRef.current = true;
      clearEditing();
      return;
    }

    if (amount === 0) {
      if (effectivePaid > 0) {
        doSave(0); // void the existing payment
      } else {
        skipBlurToastRef.current = true;
        clearEditing(); // nothing to clear, nothing to save
      }
      return;
    }

    doSave(amount);
  }

  // Esc pressed.
  function cancelSilently() {
    skipBlurToastRef.current = true;
    clearEditing();
  }

  // Click-away. Same empty/0 equivalence as commit() — both mean clear.
  function handleBlur() {
    if (pending) return;
    if (skipBlurToastRef.current) {
      skipBlurToastRef.current = false;
      clearEditing();
      return;
    }

    const trimmed = value.trim();

    // Untouched pre-fill → silent cancel, no toast.
    if (trimmed === initialPreFillRef.current) {
      clearEditing();
      return;
    }

    const amount = trimmed === "" ? 0 : parseAmount(trimmed);

    // Cleared (empty) or typed 0 → delete on blur if there was a payment,
    // silent cancel if the cell was already empty. effectivePaid honours
    // an in-flight optimistic save so we don't race with router.refresh.
    if (amount === 0) {
      if (effectivePaid > 0) doSave(0);
      else clearEditing();
      return;
    }

    // Non-numeric junk → silent cancel.
    if (amount === null) {
      clearEditing();
      return;
    }

    toast.warning(`Discarded · ${monthLabel} — click again to retry`);
    clearEditing();
  }

  // Render: pick class + body from the (optimistic) effective amount.
  // The waiver branch (expected === 0) has to short-circuit before the
  // past/unpaid branch — otherwise a past month with no payment would
  // render as red "₹0", which is nonsense (nothing is owed if it's waived).
  let cellClass: string;
  let body: React.ReactNode;
  if (isWaived) {
    // FB#7 — soft green, not-allowed cursor, no inline edit. The chip on
    // the family name carries the global "Concession" affordance.
    cellClass = "grid-cell waived";
    body = "Waived";
  } else if (effectivePaid > 0 && effectivePaid >= expected) {
    cellClass = "grid-cell paid editable";
    body = fmt(effectivePaid);
  } else if (effectivePaid > 0) {
    cellClass = "grid-cell partial editable";
    body = fmt(effectivePaid);
  } else if (past) {
    cellClass = "grid-cell unpaid editable";
    body = <>₹{fmt(expected)}</>;
  } else {
    cellClass = "grid-cell future editable";
    body = "—";
  }
  if (pendingSync) cellClass += " pending-sync";

  function openMoreFromEdit() {
    // Capture what the principal already typed so the modal can pre-fill
    // its Amount field. Falls back to the expected amount if the input
    // hasn't been touched. Then cancel the inline edit silently so the
    // blur warn-toast doesn't fire (skipBlurToastRef = true).
    const typed = parseAmount(value);
    const carry = typed !== null && typed > 0 ? typed : expected;
    setMoreInitialAmount(carry);
    skipBlurToastRef.current = true;
    clearEditing();
    setPaymentOpen(true);
  }

  if (editing) {
    return (
      <td
        className={cellClass + " editing"}
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative" }}
      >
        <input
          className="cell-input"
          autoFocus
          inputMode="numeric"
          value={value}
          disabled={pending}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => {
            const next = e.currentTarget.value.replace(/[^0-9,]/g, "");
            setValue(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelSilently();
            }
          }}
          onBlur={handleBlur}
        />
        <button
          type="button"
          className="cell-more"
          // mousedown + preventDefault fires BEFORE the input's blur, so
          // the inline editor doesn't cancel itself before we get here
          // (this matches the prototype's behaviour exactly).
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            openMoreFromEdit();
          }}
          aria-label={`More payment options for ${studentName} · ${monthLabel}`}
          title="More options · partial / exam / back-fill / void"
        >
          ⋯
        </button>
        <PaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          familyId={familyId}
          contextStudentId={studentId}
          contextStudentName={studentName}
          contextClass={studentClass}
          siblings={siblings}
          monthlyExpected={expected}
          annualExpected={annualExpected}
          sepExamExpected={sepExamExpected}
          febExamExpected={febExamExpected}
          initialFeeHead="Tuition (auto-detected)"
          initialPeriod={period}
          initialAmount={moreInitialAmount ?? undefined}
          paidPeriods={paidPeriods}
          paidByPeriod={paidByPeriod}
        />
      </td>
    );
  }

  return (
    <>
      <td
        className={cellClass}
        onClick={isWaived ? undefined : startEdit}
        title={
          isWaived
            ? concessionReason
              ? `Waived (${concessionReason})`
              : "Waived"
            : undefined
        }
      >
        {body}
      </td>
      {/* When the modal is open while the cell is no longer in editing
          state (e.g. after openMoreFromEdit cancelled the inline edit),
          keep the modal mounted so onClose still works. */}
      {paymentOpen && (
        <PaymentModal
          open={paymentOpen}
          onClose={() => setPaymentOpen(false)}
          familyId={familyId}
          contextStudentId={studentId}
          contextStudentName={studentName}
          contextClass={studentClass}
          siblings={siblings}
          monthlyExpected={expected}
          annualExpected={annualExpected}
          sepExamExpected={sepExamExpected}
          febExamExpected={febExamExpected}
          initialFeeHead="Tuition (auto-detected)"
          initialPeriod={period}
          initialAmount={moreInitialAmount ?? undefined}
          paidPeriods={paidPeriods}
          paidByPeriod={paidByPeriod}
        />
      )}
    </>
  );
}
