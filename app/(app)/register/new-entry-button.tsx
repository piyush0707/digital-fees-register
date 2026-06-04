"use client";

import { useState } from "react";
import { StudentProfileDialog } from "./student-profile-dialog";

// Opens StudentProfileDialog in draft mode — no studentId, blank family
// fields, cyan "Already in the system?" search bar visible so the
// principal can either pick an existing family or fill in new ones.
export function NewEntryButton(props: { defaultClass: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white px-4 py-1.5 rounded-md text-sm font-medium shadow-sm"
      >
        + New entry
      </button>
      <StudentProfileDialog
        open={open}
        onClose={() => setOpen(false)}
        studentId={null}
        draftClass={props.defaultClass}
      />
    </>
  );
}
