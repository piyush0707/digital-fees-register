"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StudentProfileDialog } from "./student-profile-dialog";
import type { DeletedStudentSnapshot } from "./actions";
import {
  enqueueSetStudentStatus,
  enqueueTypoDelete,
  enqueueUndoDelete,
} from "@/lib/offline/outbox";
import type { Family, Student } from "@/lib/types";

export interface RowControlsProps {
  student: Student;
  family: Family | null;
  siblings: Student[];
}

// Two hover-revealed buttons in the family-row name cell (§7):
//   ✏ — opens the Student profile dialog
//   ✗ — opens a Reason-for-removal popover. Withdrawn flips students.status
//        (soft remove, payments preserved). Typo / mistake hard-deletes the
//        row and shows an 8-second Undo toast.
// When the student is already withdrawn the ✗ flips to a green ↻ that
// opens the Restore popover instead.
export function RowControls(props: RowControlsProps) {
  const { student, family, siblings } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [profileOpen, setProfileOpen] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });

  const deleteBtnRef = useRef<HTMLButtonElement | null>(null);
  const isWithdrawn = student.status === "withdrawn";

  function openPopover() {
    const btn = deleteBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popHeight = 180;
    const popWidth = 272;
    const top =
      rect.bottom + popHeight + 16 < window.innerHeight
        ? rect.bottom + 6
        : Math.max(8, rect.top - popHeight - 6);
    const left = Math.max(
      8,
      Math.min(window.innerWidth - popWidth - 8, rect.right - popWidth + 16),
    );
    setPopoverPos({ top, left });
    setPopoverOpen(true);
  }

  function applyStatus(next: "active" | "withdrawn", label: string) {
    setPopoverOpen(false);
    startTransition(async () => {
      const out = await enqueueSetStudentStatus(
        {
          studentId: student.id,
          status: next,
        },
        next === "withdrawn"
          ? `Withdraw · ${student.name}`
          : `Restore · ${student.name}`,
      );
      if (!out.ok && out.online) {
        toast.error(`${label} failed: ${out.error}`);
        return;
      }
      const base =
        next === "withdrawn"
          ? `Marked withdrawn · ${student.name} · totals unchanged`
          : `Restored · ${student.name}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
  }

  function handleTypoDelete() {
    setPopoverOpen(false);
    // Snapshot every restorable field BEFORE the delete so Undo can
    // re-insert the row identically (same roll_no, family_id, concession
    // overrides, etc). The id itself is gone — a new uuid is fine.
    const snapshot: DeletedStudentSnapshot = {
      family_id: student.family_id,
      name: student.name,
      class: student.class,
      roll_no: student.roll_no,
      dob: student.dob,
      date_of_admission: student.date_of_admission,
      aadhaar_no: student.aadhaar_no,
      pen: student.pen,
      monthly_fee_override: student.monthly_fee_override,
      term_fees_override: student.term_fees_override,
      exam_fees_override: student.exam_fees_override,
      concession_reason: student.concession_reason,
    };
    startTransition(async () => {
      const out = await enqueueTypoDelete(
        { studentId: student.id },
        `Delete · ${student.name}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Remove failed · ${out.error}`);
        return;
      }
      if (out.online) router.refresh();
      // 15-second window for Undo (widened from 8s after Principal demo
      // feedback). Red-pill styling + white Undo pill come from
      // `.mockup-toast-delete` in globals.css so this stays visually
      // consistent with every other toast in the app.
      toast(`Student deleted · ${student.name}`, {
        duration: 15000,
        className: "mockup-toast-delete",
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              const undo = await enqueueUndoDelete(
                { snapshot },
                `Undo delete · ${snapshot.name}`,
              );
              if (!undo.ok && undo.online) {
                toast.error(`Undo failed · ${undo.error}`);
                return;
              }
              toast.success(
                undo.online
                  ? `Restored · ${snapshot.name}`
                  : `Restored · ${snapshot.name} · queued offline`,
              );
              if (undo.online) router.refresh();
            });
          },
        },
      });
    });
  }

  return (
    <>
      <button
        type="button"
        className="row-edit-btn"
        onClick={(e) => {
          e.stopPropagation();
          setProfileOpen(true);
        }}
        aria-label={`Edit profile for ${student.name}`}
        title="Edit student profile"
      >
        ✏
      </button>
      <button
        ref={deleteBtnRef}
        type="button"
        className="row-delete-btn"
        onClick={(e) => {
          e.stopPropagation();
          openPopover();
        }}
        aria-label={
          isWithdrawn
            ? `Restore ${student.name}`
            : `Remove ${student.name} from the register`
        }
        title={
          isWithdrawn
            ? "Restore this student"
            : "Remove this student from the register"
        }
        disabled={pending}
      >
        {isWithdrawn ? "↻" : "×"}
      </button>

      <StudentProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        studentId={student.id}
        initialStudent={student}
        initialFamily={family}
        initialSiblings={siblings}
      />

      <RowReasonPopover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        pos={popoverPos}
        isWithdrawn={isWithdrawn}
        pending={pending}
        onWithdraw={() => applyStatus("withdrawn", "Mark withdrawn")}
        onRestore={() => applyStatus("active", "Restore")}
        onTypo={handleTypoDelete}
      />
    </>
  );
}

interface RowReasonPopoverProps {
  open: boolean;
  onClose: () => void;
  pos: { top: number; left: number };
  isWithdrawn: boolean;
  pending: boolean;
  onWithdraw: () => void;
  onRestore: () => void;
  onTypo: () => void;
}

function RowReasonPopover(props: RowReasonPopoverProps) {
  const {
    open,
    onClose,
    pos,
    isWithdrawn,
    pending,
    onWithdraw,
    onRestore,
    onTypo,
  } = props;
  const ref = useRef<HTMLDivElement | null>(null);

  // Outside-click + Esc to dismiss — matches the mockup verbatim:
  //   - uses `click` (not `mousedown`) so React's synthetic click on a
  //     pop-action button fires BEFORE this handler closes the popover
  //   - skips closing when the click target is a .row-delete-btn (so a
  //     fresh click on the × that opened this popover doesn't double-fire
  //     into a close + immediate reopen)
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (!target) return;
      if (ref.current && ref.current.contains(target)) return;
      if (target.closest(".row-delete-btn")) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      className="row-popover"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="pop-title">
        {isWithdrawn ? "Restore this student?" : "Reason for removal?"}
      </div>

      {isWithdrawn ? (
        <>
          <button
            type="button"
            className="pop-action success"
            onClick={onRestore}
            disabled={pending}
          >
            <div className="pop-strong">Yes, restore</div>
            <div className="pop-help">
              Row returns to active. Future months become payable again.
            </div>
          </button>
          <button
            type="button"
            className="pop-action"
            onClick={onClose}
            disabled={pending}
          >
            <div className="pop-strong">No, keep withdrawn</div>
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            className="pop-action warn-tone"
            onClick={onWithdraw}
            disabled={pending}
          >
            <div className="pop-strong">Withdrawn</div>
            <div className="pop-help">
              Keep payment history. Grey out future months. Restorable any
              time.
            </div>
          </button>
          <button
            type="button"
            className="pop-action danger"
            onClick={onTypo}
            disabled={pending}
          >
            <div className="pop-strong">Typo / mistake</div>
            <div className="pop-help">
              Remove the row entirely. 15 seconds to undo.
            </div>
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
