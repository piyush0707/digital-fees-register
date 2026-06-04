"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  enqueueSetPDues,
  enqueueTogglePDuesPaid,
} from "@/lib/offline/outbox";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

const PDUES_PERIOD = "2025-26";

// P.Dues anchor cell (anchor-pos="1"). Display: red `₹X,XXX` when remaining
// > 0; blank slate anchor when 0. Click → input pre-filled with the current
// remaining balance. Enter saves, Esc cancels, blur warns on a real change.
//
// Phase 6a addition (non-mockup): when the family has a carry-forward
// (`pduesBase > 0`), a ✓ chip mirrors the T.Fees toggle. Click pays the
// REMAINING amount (cell flips green); click again voids the active P.Dues
// row (cell flips back to red). Mirrors `term-paid-toggle` styling verbatim.
export function PDuesCell(props: {
  familyId: string;
  familyLabel: string;
  // Family's raw `families.p_dues` — drives whether the ✓ chip is shown
  // at all. The chip's outline/solid state is driven by `remaining`.
  pduesBase: number;
  remaining: number;
  pendingSync?: boolean;
}) {
  const { familyId, familyLabel, pduesBase, remaining, pendingSync } = props;

  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<number | null>(null);
  const initialPreFillRef = useRef("");
  const skipBlurToastRef = useRef(false);

  useEffect(() => {
    setOptimistic(null);
  }, [remaining]);

  const effective = optimistic !== null ? optimistic : remaining;

  function startEdit() {
    if (editing || pending) return;
    if (!familyId) {
      toast.warning(
        `P.Dues is the family's prior-session carry-forward — ${familyLabel} has no family link yet, so there's nothing to record here.`,
      );
      return;
    }
    const preFill = String(remaining);
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
    setOptimistic(amount);
    clearEditing();
    startTransition(async () => {
      const out = await enqueueSetPDues(
        { familyId, value: amount },
        amount > 0
          ? `P.Dues · ${familyLabel} · ₹${fmt(amount)}`
          : `P.Dues cleared · ${familyLabel}`,
      );
      if (!out.ok && out.online) {
        setOptimistic(null);
        toast.error(`P.Dues save failed: ${out.error}`);
        return;
      }
      const base =
        amount > 0
          ? `P.Dues set · ${familyLabel} · ₹${fmt(amount)}`
          : `P.Dues cleared · ${familyLabel}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
  }

  function commit() {
    const trimmed = value.trim();
    if (trimmed === "") {
      doSave(0);
      return;
    }
    const cleaned = trimmed.replace(/,/g, "");
    if (!/^\d+$/.test(cleaned)) {
      skipBlurToastRef.current = true;
      clearEditing();
      return;
    }
    doSave(parseInt(cleaned, 10));
  }

  function cancelSilently() {
    skipBlurToastRef.current = true;
    clearEditing();
  }

  function handleBlur() {
    if (pending) return;
    if (skipBlurToastRef.current) {
      skipBlurToastRef.current = false;
      clearEditing();
      return;
    }
    const trimmed = value.trim();
    if (trimmed === initialPreFillRef.current) {
      clearEditing();
      return;
    }
    if (trimmed === "") {
      doSave(0);
      return;
    }
    toast.warning(
      `Discarded · P.Dues for ${familyLabel} — click again to retry`,
    );
    clearEditing();
  }

  // Phase 6a — chip is visible only when the family has a non-zero
  // carry-forward. State follows `effective`: > 0 outline (paying remaining),
  // = 0 solid green (toggle-off voids). Click stopPropagations so the inline
  // edit doesn't fire on the same event.
  const showChip = familyId !== "" && pduesBase > 0;
  const chipSettled = effective === 0;
  function onChipClick(e: React.MouseEvent<HTMLButtonElement>) {
    e.stopPropagation();
    if (pending) return;
    const toRecord = chipSettled ? 0 : effective; // void-vs-insert
    // Optimistic flip: outline → solid (remaining = 0), or solid → outline
    // (remaining bounces back to pduesBase, since voiding removes the
    // settlement payment).
    const nextRemaining = chipSettled ? pduesBase : 0;
    setOptimistic(nextRemaining);
    startTransition(async () => {
      const label = chipSettled
        ? `P.Dues void · ${familyLabel}`
        : `P.Dues paid · ${familyLabel} · ₹${fmt(toRecord)}`;
      const out = await enqueueTogglePDuesPaid(
        { familyId, remaining: toRecord, period: PDUES_PERIOD },
        label,
      );
      if (!out.ok && out.online) {
        setOptimistic(null);
        toast.error(`P.Dues toggle failed: ${out.error}`);
        return;
      }
      const base = chipSettled
        ? `P.Dues reopened · ${familyLabel}`
        : `P.Dues marked paid · ${familyLabel} · ₹${fmt(toRecord)}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
  }

  const showsValue = effective > 0;
  const baseClass =
    "grid-cell sticky-col sticky-col-anchor editable" +
    (showsValue ? " unpaid" : "") +
    (showChip && chipSettled ? " term-paid" : "") +
    (pendingSync ? " pending-sync" : "");
  const tdStyle: React.CSSProperties = showsValue
    ? { fontWeight: 500 }
    : { background: "#f1f5f9", color: "#0f172a", fontWeight: 600 };

  if (editing) {
    return (
      <td
        className={baseClass + " editing"}
        data-anchor-pos="1"
        style={tdStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <input
          className="cell-input"
          autoFocus
          inputMode="numeric"
          value={value}
          disabled={pending}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) =>
            setValue(e.currentTarget.value.replace(/[^0-9,]/g, ""))
          }
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
      </td>
    );
  }

  return (
    <td
      className={baseClass}
      data-anchor-pos="1"
      style={tdStyle}
      onClick={startEdit}
    >
      {/* Settled state keeps the carry-forward amount visible (mirrors how
          T.Fees shows the annual amount when paid). Unpaid state renders
          the current remaining as before. Families with no p_dues render
          blank. */}
      {showChip && chipSettled ? (
        <>₹{fmt(pduesBase)}</>
      ) : showsValue ? (
        <>₹{fmt(effective)}</>
      ) : null}
      {showChip && (
        <button
          type="button"
          className="term-paid-toggle"
          onClick={onChipClick}
          disabled={pending}
          aria-label={
            chipSettled
              ? `Reopen P.Dues for ${familyLabel}`
              : `Mark P.Dues as paid for ${familyLabel}`
          }
          title={
            chipSettled
              ? "P.Dues settled — click to reopen"
              : "Mark P.Dues as paid"
          }
        >
          ✓
        </button>
      )}
    </td>
  );
}
