"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { getFeeStructure } from "@/lib/queries";
import { enqueueUpsertFeeStructure } from "@/lib/offline/outbox";
import { CLASS_LIST, formatClassLabel } from "@/lib/classes";

// Screen 5 — Fee Structure modal. Lifted DOM + classes verbatim from
// #fees-modal-overlay in Docs/Mockup/Digital_Fees_Register_UI_Mockup.html
// and matches the §Fee Structure behaviour in Mockup_User_Functionality.md.
// Opens as an overlay on top of /register from the "⚙ Fee structure" button
// in the class-picker row.

interface FeeStructureDialogProps {
  open: boolean;
  onClose: () => void;
  currentClass: string;
}

// All 13 classes are editable in the demo build (CLASS_LIST is the canonical
// id set — same string used by the URL `?class=`, the register grid, and
// the DB `students.class` / `fee_structures.class` columns).

function fmtINR(n: number): string {
  return "₹" + n.toLocaleString("en-IN");
}

function sanitizeDigits(raw: string): string {
  return raw.replace(/[^\d]/g, "");
}

export function FeeStructureDialog({
  open,
  onClose,
  currentClass,
}: FeeStructureDialogProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);

  const [classSel, setClassSel] = useState<string>(currentClass);
  const [monthly, setMonthly] = useState<string>("0");
  const [annual, setAnnual] = useState<string>("0");
  const [sepExam, setSepExam] = useState<string>("400");
  const [febExam, setFebExam] = useState<string>("400");
  const [misc, setMisc] = useState<string>("0");

  const loadFor = useCallback(async (cls: string) => {
    setLoading(true);
    try {
      const row = await getFeeStructure(supabase, cls);
      if (row) {
        setMonthly(String(row.monthly_fee ?? 0));
        setAnnual(String(row.annual_fee ?? 0));
        setSepExam(String(row.sep_exam_fee ?? 400));
        setFebExam(String(row.feb_exam_fee ?? 400));
        setMisc(String(row.misc_fee ?? 0));
      } else {
        setMonthly("0");
        setAnnual("0");
        setSepExam("400");
        setFebExam("400");
        setMisc("0");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to load fee structure: ${msg}`);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reset to currentClass + reload on every modal open. Switching the
  // dropdown also reloads (handled in onChange below).
  useEffect(() => {
    if (!open) return;
    setClassSel(currentClass);
    void loadFor(currentClass);
  }, [open, currentClass, loadFor]);

  // §Fee Structure live total:
  //   monthly × 12 + annual + sep_exam + feb_exam + misc
  const total = useMemo(() => {
    const n = (s: string) => Number(s) || 0;
    return n(monthly) * 12 + n(annual) + n(sepExam) + n(febExam) + n(misc);
  }, [monthly, annual, sepExam, febExam, misc]);

  function onSave() {
    const m = Number(monthly) || 0;
    if (m <= 0) {
      toast.warning("Monthly fee is required");
      return;
    }
    startTransition(async () => {
      const out = await enqueueUpsertFeeStructure(
        {
          class: classSel,
          monthly_fee: m,
          annual_fee: Number(annual) || 0,
          sep_exam_fee: Number(sepExam) || 0,
          feb_exam_fee: Number(febExam) || 0,
          misc_fee: Number(misc) || 0,
        },
        `Fee structure · ${formatClassLabel(classSel)}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Failed to save: ${out.error}`);
        return;
      }
      const base = `Fee structure updated · ${formatClassLabel(classSel)} · changes apply to families without a concession.`;
      if (out.online) {
        toast.success(base);
        onClose();
        // Refresh /register so Monthly anchors + Pending columns recompute
        // for every family without a per-student override.
        router.refresh();
      } else {
        toast.success(
          `Fee structure update queued offline · will apply when back online`,
        );
        onClose();
      }
    });
  }

  // Esc closes the modal.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-card profile-form"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fees-modal-title"
      >
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <h3
              id="fees-modal-title"
              className="font-semibold text-slate-900"
            >
              Fee structure
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Per-class default fees · families without a concession use these values.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="modal-body">
          <div>
            <label>Class</label>
            <select
              value={classSel}
              onChange={(e) => {
                const next = e.target.value;
                setClassSel(next);
                void loadFor(next);
              }}
            >
              {CLASS_LIST.map((c) => (
                <option key={c} value={c}>
                  {formatClassLabel(c)}
                </option>
              ))}
            </select>
          </div>

          <div className="field-grid-2">
            <div>
              <label>
                Monthly fee <span className="req">*</span>
              </label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={monthly}
                disabled={loading}
                onChange={(e) => setMonthly(sanitizeDigits(e.target.value))}
              />
            </div>
            <div>
              <label>Annual fee</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={annual}
                disabled={loading}
                onChange={(e) => setAnnual(sanitizeDigits(e.target.value))}
              />
            </div>
          </div>

          <div className="field-grid-2">
            <div>
              <label>September exam fee</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={sepExam}
                disabled={loading}
                onChange={(e) => setSepExam(sanitizeDigits(e.target.value))}
              />
            </div>
            <div>
              <label>February exam fee</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={febExam}
                disabled={loading}
                onChange={(e) => setFebExam(sanitizeDigits(e.target.value))}
              />
            </div>
          </div>

          <div>
            <label>
              Miscellaneous fees{" "}
              <span className="text-slate-400 font-normal">(any other recurring fee)</span>
            </label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="0"
              value={misc}
              disabled={loading}
              onChange={(e) => setMisc(sanitizeDigits(e.target.value))}
            />
          </div>

          <div className="bg-slate-50 border border-slate-200 rounded-md p-3 text-sm flex items-center justify-between">
            <span className="text-slate-600 text-xs">
              Total per year (computed)
            </span>
            <span className="font-semibold text-slate-900">{fmtINR(total)}</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={pending || loading}
            className="px-6 py-2 bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white rounded-md text-sm font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {pending ? "Saving…" : "Save fee structure"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
