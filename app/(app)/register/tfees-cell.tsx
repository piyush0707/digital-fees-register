"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueToggleAnnual } from "@/lib/offline/outbox";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

// The T.Fees anchor cell. Renders the expected annual amount + a small
// circular ✓ toggle in the top-right corner. Clicking the toggle inserts /
// voids the STUDENT's Annual payment row for the session (per-student after
// migration 0004).
export function TFeesCell(props: {
  studentId: string;
  studentName: string;
  session: string;
  annualExpected: number;
  annualPaid: boolean;
  concessionReason: string | null;
  pendingSync?: boolean;
}) {
  const {
    studentId,
    studentName,
    session,
    annualExpected,
    annualPaid,
    concessionReason,
    pendingSync,
  } = props;
  // FB#7 — when term_fees_override is 0, the cell reads as "Waived"
  // (auto-applies term-paid) and the ✓ toggle is hidden since there's
  // nothing to mark paid.
  const isWaived = annualExpected === 0;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [optimisticPaid, setOptimisticPaid] = useState<boolean | null>(null);

  useEffect(() => {
    setOptimisticPaid(null);
  }, [annualPaid]);

  const effectivePaid =
    optimisticPaid !== null ? optimisticPaid : annualPaid;

  function onClick() {
    if (pending) return;
    const nextPaid = !effectivePaid;
    setOptimisticPaid(nextPaid);
    startTransition(async () => {
      const out = await enqueueToggleAnnual(
        {
          studentId,
          session,
          amount: annualExpected,
        },
        nextPaid
          ? `T.Fees paid · ${studentName}`
          : `T.Fees cleared · ${studentName}`,
      );
      if (!out.ok && out.online) {
        setOptimisticPaid(null);
        toast.error(`T.Fees update failed: ${out.error}`);
        return;
      }
      const base = nextPaid
        ? `T.Fees paid · ${studentName} · ₹${fmt(annualExpected)}`
        : `T.Fees cleared · ${studentName}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
  }

  const visiblePaid = effectivePaid || isWaived;
  // Unpaid + has an amount due → render in the same pink as overdue month
  // cells so "anything pink = owed" reads consistently across the row.
  const showsUnpaid = !visiblePaid && annualExpected > 0;

  return (
    <td
      className={
        "grid-cell sticky-col sticky-col-anchor" +
        (visiblePaid ? " term-paid" : "") +
        (isWaived ? " waived" : "") +
        (showsUnpaid ? " unpaid" : "") +
        (pendingSync ? " pending-sync" : "")
      }
      data-anchor-pos="2"
      title={
        isWaived
          ? concessionReason
            ? `Waived (${concessionReason})`
            : "Waived"
          : undefined
      }
    >
      {isWaived ? "Waived" : fmt(annualExpected)}
      {!isWaived && (
        <button
          type="button"
          className="term-paid-toggle"
          onClick={onClick}
          disabled={pending}
          aria-label={
            effectivePaid
              ? `Mark T.Fees as unpaid for ${studentName}`
              : `Mark T.Fees as paid for ${studentName}`
          }
          title={
            effectivePaid
              ? "T.Fees paid — click to clear"
              : "Mark T.Fees as paid"
          }
        >
          ✓
        </button>
      )}
    </td>
  );
}
