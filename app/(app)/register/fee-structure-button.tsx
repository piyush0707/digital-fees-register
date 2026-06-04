"use client";

import { useState } from "react";
import { FeeStructureDialog } from "./fee-structure-dialog";

// "⚙ Fee structure" button on the Register class-picker row (CLAUDE.md:
// the editor is reached from here, not from a Settings page). Click opens
// the per-class editor as a modal overlay on top of the Register screen.

export function FeeStructureButton({
  currentClass = "10",
}: {
  currentClass?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Set this class's monthly, annual, exam, and misc fees"
        className="inline-flex items-center gap-1.5 bg-white border border-slate-300 hover:border-slate-400 hover:text-slate-900 rounded-md text-slate-700 font-medium"
        style={{ padding: "6px 12px", fontSize: 13 }}
      >
        <span
          className="text-emerald-600"
          style={{ fontSize: 16, lineHeight: 1 }}
        >
          ⚙
        </span>{" "}
        Fee structure
      </button>
      <FeeStructureDialog
        open={open}
        onClose={() => setOpen(false)}
        currentClass={currentClass}
      />
    </>
  );
}
