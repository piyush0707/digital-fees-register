"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueSetMonthlyOverride } from "@/lib/offline/outbox";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

// Monthly anchor cell (anchor-pos="3", end of the sticky-left zone).
// Display: always neutral slate anchor styling, no ₹ prefix. Click → input
// pre-filled with the current effective monthly (override if set, otherwise
// the class default). Save writes to students.monthly_fee_override; empty +
// Enter clears the override (revert to class default).
export function MonthlyCell(props: {
  studentId: string;
  studentName: string;
  monthlyExpected: number;
  classDefault: number;
  concessionReason: string | null;
  pendingSync?: boolean;
}) {
  const {
    studentId,
    studentName,
    monthlyExpected,
    classDefault,
    concessionReason,
    pendingSync,
  } = props;

  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  // Optimistic: number for an explicit override (incl. 0 waiver), "cleared"
  // for "revert to class default" (since null ambiguates with "not set").
  const [optimistic, setOptimistic] = useState<number | "cleared" | null>(
    null,
  );
  const initialPreFillRef = useRef("");
  const skipBlurToastRef = useRef(false);

  useEffect(() => {
    setOptimistic(null);
  }, [monthlyExpected]);

  const effective: number =
    optimistic === "cleared"
      ? classDefault
      : optimistic !== null
        ? optimistic
        : monthlyExpected;

  function startEdit() {
    if (editing || pending) return;
    const preFill = String(monthlyExpected);
    initialPreFillRef.current = preFill;
    setValue(preFill);
    setEditing(true);
  }

  function clearEditing() {
    setEditing(false);
    setValue("");
  }

  function doSave(amount: number | null) {
    skipBlurToastRef.current = true;
    setOptimistic(amount === null ? "cleared" : amount);
    clearEditing();
    startTransition(async () => {
      const out = await enqueueSetMonthlyOverride(
        { studentId, value: amount },
        amount === null
          ? `Monthly reset · ${studentName}`
          : `Monthly override · ${studentName} · ₹${fmt(amount)}`,
      );
      if (!out.ok && out.online) {
        setOptimistic(null);
        toast.error(`Monthly override failed: ${out.error}`);
        return;
      }
      const base =
        amount === null
          ? `Monthly reset to default · ${studentName} · ₹${fmt(classDefault)}`
          : `Monthly set · ${studentName} · ₹${fmt(amount)}`;
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
      doSave(null); // revert to class default
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
      doSave(null);
      return;
    }
    toast.warning(
      `Discarded · Monthly for ${studentName} — click again to retry`,
    );
    clearEditing();
  }

  // FB#7 — when the monthly override resolves to 0 the anchor cell
  // renders as a waived affordance (soft green) and isn't editable.
  const isWaived = effective === 0;
  const baseClassRaw = isWaived
    ? "grid-cell sticky-col sticky-col-anchor anchor-end waived"
    : "grid-cell sticky-col sticky-col-anchor anchor-end editable";
  const baseClass = baseClassRaw + (pendingSync ? " pending-sync" : "");
  const tdStyle: React.CSSProperties | undefined = isWaived
    ? undefined
    : {
        background: "#f1f5f9",
        color: "#0f172a",
        fontWeight: 600,
      };

  if (editing) {
    return (
      <td
        className={baseClass + " editing"}
        data-anchor-pos="3"
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
      data-anchor-pos="3"
      style={tdStyle}
      onClick={isWaived ? undefined : startEdit}
      title={
        isWaived
          ? concessionReason
            ? `Waived (${concessionReason})`
            : "Waived"
          : undefined
      }
    >
      {isWaived ? "Waived" : fmt(effective)}
    </td>
  );
}
