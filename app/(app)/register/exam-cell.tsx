"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueRecordExam } from "@/lib/offline/outbox";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (cleaned === "" || !/^\d+$/.test(cleaned)) return null;
  return parseInt(cleaned, 10);
}

export type ExamHead = "Sep Exam" | "Feb Exam";

// Sep Exam / Feb Exam cell. Family-level (the partial unique index in the
// schema enforces one active row per family+session). Pre-fill = current
// paid if any, otherwise the class default (₹400 for Class 10). Empty or
// `0` clears via the void path.
export function ExamCell(props: {
  studentId: string;
  studentName: string;
  feeHead: ExamHead;
  session: string;
  defaultAmount: number;
  paid: number;
  concessionReason: string | null;
  pendingSync?: boolean;
}) {
  const {
    studentId,
    studentName,
    feeHead,
    session,
    defaultAmount,
    paid,
    concessionReason,
    pendingSync,
  } = props;
  // FB#7 — exam_fees_override === 0 makes both Sep and Feb exam cells
  // a non-editable soft-green "Waived" affordance.
  const isWaived = defaultAmount === 0;

  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  const [pendingAmount, setPendingAmount] = useState<number | null>(null);
  const initialPreFillRef = useRef("");
  const skipBlurToastRef = useRef(false);

  useEffect(() => {
    setPendingAmount(null);
  }, [paid]);

  const effectivePaid = pendingAmount !== null ? pendingAmount : paid;

  function startEdit() {
    if (editing || pending) return;
    if (isWaived) return; // waived exam cells aren't editable (FB#7)
    const preFill =
      effectivePaid > 0 ? String(effectivePaid) : String(defaultAmount);
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
      const out = await enqueueRecordExam(
        {
          studentId,
          session,
          feeHead,
          amount,
        },
        amount === 0
          ? `Clear · ${studentName} · ${feeHead}`
          : `${feeHead} · ${studentName} · ₹${fmt(amount)}`,
      );
      if (!out.ok && out.online) {
        setPendingAmount(null);
        toast.error(`${feeHead} save failed: ${out.error}`);
        return;
      }
      const base =
        amount === 0
          ? `Cleared · ${studentName} · ${feeHead}`
          : `Saved · ${studentName} · ${feeHead} · ₹${fmt(amount)}`;
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
    const amount = trimmed === "" ? 0 : parseAmount(trimmed);

    if (amount === null) {
      skipBlurToastRef.current = true;
      clearEditing();
      return;
    }

    if (amount === 0) {
      if (effectivePaid > 0) {
        doSave(0);
      } else {
        skipBlurToastRef.current = true;
        clearEditing();
      }
      return;
    }

    doSave(amount);
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

    const amount = trimmed === "" ? 0 : parseAmount(trimmed);
    if (amount === 0) {
      if (effectivePaid > 0) doSave(0);
      else clearEditing();
      return;
    }
    if (amount === null) {
      clearEditing();
      return;
    }

    toast.warning(
      `Discarded · ${feeHead} for ${studentName} — click again to retry`,
    );
    clearEditing();
  }

  let cellClass: string;
  let body: React.ReactNode;
  if (isWaived) {
    cellClass = "grid-cell exam-cell waived";
    body = "Waived";
  } else if (effectivePaid > 0) {
    cellClass = "grid-cell exam-cell exam-paid editable";
    body = fmt(effectivePaid);
  } else {
    cellClass = "grid-cell exam-cell exam-pending editable";
    body = fmt(defaultAmount);
  }
  if (pendingSync) cellClass += " pending-sync";

  if (editing) {
    return (
      <td
        className={cellClass + " editing"}
        data-exam-fee={defaultAmount}
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
      className={cellClass}
      data-exam-fee={defaultAmount}
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
  );
}
