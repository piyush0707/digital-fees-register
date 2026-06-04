"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NotifyControls } from "./notify-controls";

// §D3 — clicking anywhere on a pending-dues row (except the Notify icon)
// deep-links to /register?class=<cls>&highlight=<studentId>, which scrolls
// + amber-flashes the matching row on that class's register. Phase 6a:
// `cls` is now required so cross-class siblings land on the right register
// instead of always defaulting to Class 10. Notify icon stops propagation.

interface DueRowProps {
  studentId: string | null;
  familyName: string;
  cls: string;
  classLabel: string;
  period: string;
  amount: number;
  familyCount: number;
}

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export function DueRow({
  studentId,
  familyName,
  cls,
  classLabel,
  period,
  amount,
  familyCount,
}: DueRowProps) {
  const router = useRouter();

  function onRowClick() {
    if (studentId) {
      const params = new URLSearchParams();
      if (cls) params.set("class", cls);
      params.set("highlight", studentId);
      router.push(`/register?${params.toString()}`);
    } else {
      toast.warning(`No linked student row for ${familyName}`);
    }
  }

  return (
    <tr className="dues-row" onClick={onRowClick}>
      <td className="px-3 py-1.5 font-medium">{familyName}</td>
      <td className="px-3 py-1.5 text-slate-500">{classLabel}</td>
      <td className="px-3 py-1.5 text-slate-500">{period}</td>
      <td className="px-3 py-1 text-center">
        <NotifyControls
          variant="row"
          familyName={familyName}
          count={familyCount}
        />
      </td>
      <td className="px-3 py-1.5 text-right text-rose-700 font-semibold">
        ₹{fmt(amount)}
      </td>
    </tr>
  );
}
