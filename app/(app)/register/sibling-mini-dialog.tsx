"use client";

import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { enqueueAddSibling } from "@/lib/offline/outbox";
import { CLASS_LIST, DEFAULT_CLASS, formatClassLabel } from "@/lib/classes";
import { getTodayContext } from "@/lib/today";

const CLASS_OPTIONS = CLASS_LIST;

function formatAadhaarOnInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export interface SiblingMiniDialogProps {
  open: boolean;
  onClose: () => void;
  parentStudentId: string;
  parentStudentName: string;
  inherit: {
    father: string | null;
    mother: string | null;
    phone: string | null;
    address: string | null;
  };
  defaultClass?: string;
}

export function SiblingMiniDialog(props: SiblingMiniDialogProps) {
  const {
    open,
    onClose,
    parentStudentId,
    parentStudentName,
    inherit,
    defaultClass,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Asia/Kolkata "today" — caps the DOB picker so a future date can't be
  // chosen. Existing stored values render unchanged.
  const todayIso = getTodayContext().today;

  const [name, setName] = useState("");
  const [cls, setCls] = useState(defaultClass ?? DEFAULT_CLASS);
  const [dob, setDob] = useState<string>("");
  const [doa, setDoa] = useState<string>("");
  const [aadhaar, setAadhaar] = useState<string>("");
  const [pen, setPen] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setCls(defaultClass ?? DEFAULT_CLASS);
    setDob("");
    setDoa("");
    setAadhaar("");
    setPen("");
  }, [open, defaultClass]);

  if (!open) return null;

  function handleSave() {
    if (!name.trim()) {
      toast.error("Sibling name is required");
      return;
    }
    const aadhaarDigits = aadhaar.replace(/\s/g, "");
    if (aadhaarDigits && !/^\d{12}$/.test(aadhaarDigits)) {
      toast.error("Aadhaar must be exactly 12 digits");
      return;
    }
    startTransition(async () => {
      const out = await enqueueAddSibling(
        {
          parentStudentId,
          name: name.trim().toUpperCase(),
          class: cls,
          dob: dob || null,
          date_of_admission: doa || null,
          aadhaar_no: aadhaarDigits || null,
          pen: pen.trim() || null,
        },
        undefined,
        `New sibling · ${name.trim().toUpperCase()}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Add sibling failed: ${out.error}`);
        return;
      }
      const base = `Sibling added · ${name.trim().toUpperCase()}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
    // Close instantly — server work continues in the background and
    // router.refresh() lands the new row when ready (online), or the
    // optimistic-closed dialog state stays as-is (offline).
    onClose();
  }

  return createPortal(
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !pending) onClose();
      }}
      style={{ zIndex: 70 }}
    >
      <div className="sib-mini-card">
        <div className="sib-mini-header">
          <div>
            <h4>Add sibling — full profile</h4>
            <div className="sib-mini-context">
              Inheriting from {parentStudentName}&rsquo;s family · only
              per-student fields below
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            style={{
              background: "transparent",
              border: "none",
              fontSize: 20,
              color: "#94a3b8",
              cursor: "pointer",
            }}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="sib-mini-body">
          <div className="inherit-banner">
            <strong>Inheriting from family</strong>
            <div style={{ lineHeight: 1.5 }}>
              <strong style={{ display: "inline", fontWeight: 600 }}>
                Father:
              </strong>{" "}
              {inherit.father || "—"}
              <br />
              <strong style={{ display: "inline", fontWeight: 600 }}>
                Mother:
              </strong>{" "}
              {inherit.mother || "—"}
              <br />
              <strong style={{ display: "inline", fontWeight: 600 }}>
                Phone:
              </strong>{" "}
              {inherit.phone || "—"}
              <br />
              <strong style={{ display: "inline", fontWeight: 600 }}>
                Address:
              </strong>{" "}
              {inherit.address || "—"}
            </div>
          </div>

          <div>
            <label>
              Student name <span style={{ color: "#e11d48" }}>*</span>
            </label>
            <input
              type="text"
              className="name-input"
              value={name}
              onChange={(e) => setName(e.target.value.toUpperCase())}
              disabled={pending}
              placeholder="e.g., NAINA KUMAR"
              autoFocus
            />
          </div>

          <div>
            <label>
              Class <span style={{ color: "#e11d48" }}>*</span>{" "}
              <span
                style={{ color: "#94a3b8", fontWeight: 400 }}
              >
                (roll number auto-assigned to next available in the class)
              </span>
            </label>
            <select
              value={cls}
              onChange={(e) => setCls(e.target.value)}
              disabled={pending}
            >
              {CLASS_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {formatClassLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="sib-mini-grid-2">
            <div>
              <label>
                Date of birth{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                type="date"
                value={dob}
                max={todayIso}
                onChange={(e) => setDob(e.target.value)}
                disabled={pending}
              />
            </div>
            <div>
              <label>
                Date of admission{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                type="date"
                value={doa}
                onChange={(e) => setDoa(e.target.value)}
                disabled={pending}
              />
            </div>
          </div>

          <div className="sib-mini-grid-2">
            <div>
              <label>
                Aadhaar number{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                  (optional · 12 digits)
                </span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={14}
                value={aadhaar}
                onChange={(e) =>
                  setAadhaar(formatAadhaarOnInput(e.target.value))
                }
                disabled={pending}
                placeholder="XXXX XXXX XXXX"
              />
            </div>
            <div>
              <label>
                PEN{" "}
                <span style={{ color: "#94a3b8", fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                type="text"
                value={pen}
                onChange={(e) => setPen(e.target.value)}
                disabled={pending}
                placeholder="optional"
              />
            </div>
          </div>
        </div>

        <div className="sib-mini-footer">
          <button
            type="button"
            className="sib-mini-cancel"
            onClick={onClose}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="sib-mini-save"
            onClick={handleSave}
            disabled={pending}
          >
            {pending ? "Saving…" : "Save sibling"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
