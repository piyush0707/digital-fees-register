"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  loadSiblings,
  searchFamiliesWithChildren,
  type FamilySuggestion,
} from "./actions";
import { enqueueSaveProfile, enqueueUnlink } from "@/lib/offline/outbox";
import type { Family, Student } from "@/lib/types";
import { SiblingMiniDialog } from "./sibling-mini-dialog";
import { CLASS_LIST, DEFAULT_CLASS, formatClassLabel } from "@/lib/classes";
import { getTodayContext } from "@/lib/today";

const CLASS_OPTIONS = CLASS_LIST;

function formatAadhaarOnInput(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 12);
  return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

function formatAadhaarFromDb(value: string | null): string {
  if (!value) return "";
  return value.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
}

export interface StudentProfileDialogProps {
  open: boolean;
  onClose: () => void;
  // null = draft / "+ New entry" mode. Existing edit mode otherwise.
  studentId: string | null;
  // For drafts: the active class to default into. For edits: ignored
  // (we use the student's own class).
  draftClass?: string;
  // Initial data hydrated from the server-rendered row (avoids a flash
  // of empty fields). For drafts both can be undefined.
  initialStudent?: Student | null;
  initialFamily?: Family | null;
  initialSiblings?: Student[];
}

type ConcessionState = {
  monthlyOn: boolean;
  monthlyAmt: string;
  termOn: boolean;
  termAmt: string;
  examOn: boolean;
  examAmt: string;
  reason: string;
};

export function StudentProfileDialog(props: StudentProfileDialogProps) {
  const {
    open,
    onClose,
    studentId,
    draftClass,
    initialStudent,
    initialFamily,
    initialSiblings,
  } = props;

  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Draft-mode autofocus target — the Student name input. Editing existing
  // students stays focus-neutral so the principal can scan first.
  const nameInputRef = useRef<HTMLInputElement | null>(null);
  // Asia/Kolkata "today" — caps the DOB picker so a future date can't be
  // entered. Stored values from before this guard render unchanged because
  // `value` is independent of `max`.
  const todayIso = getTodayContext().today;

  const isDraft = studentId === null;

  // Family state (left column). When linkedFamilyId is set, fields are
  // read-only inherited values; otherwise they're editable.
  const [linkedFamilyId, setLinkedFamilyId] = useState<string | null>(
    initialFamily?.id ?? null,
  );
  const [father, setFather] = useState(initialFamily?.father_name ?? "");
  const [mother, setMother] = useState(initialFamily?.mother_name ?? "");
  const [phone, setPhone] = useState(initialFamily?.phone ?? "");
  const [address, setAddress] = useState(initialFamily?.address ?? "");

  // Student state (right column).
  const [name, setName] = useState(initialStudent?.name ?? "");
  const [cls, setCls] = useState(
    initialStudent?.class ?? draftClass ?? DEFAULT_CLASS,
  );
  const [dob, setDob] = useState(initialStudent?.dob ?? "");
  const [doa, setDoa] = useState(
    initialStudent?.date_of_admission ?? "",
  );
  const [aadhaar, setAadhaar] = useState(
    formatAadhaarFromDb(initialStudent?.aadhaar_no ?? null),
  );
  const [pen, setPen] = useState(initialStudent?.pen ?? "");

  // Concession state.
  const [conc, setConc] = useState<ConcessionState>(() => ({
    monthlyOn: initialStudent?.monthly_fee_override !== null && initialStudent?.monthly_fee_override !== undefined,
    monthlyAmt:
      initialStudent?.monthly_fee_override !== null &&
      initialStudent?.monthly_fee_override !== undefined
        ? String(initialStudent.monthly_fee_override)
        : "",
    termOn: initialStudent?.term_fees_override !== null && initialStudent?.term_fees_override !== undefined,
    termAmt:
      initialStudent?.term_fees_override !== null &&
      initialStudent?.term_fees_override !== undefined
        ? String(initialStudent.term_fees_override)
        : "",
    examOn: initialStudent?.exam_fees_override !== null && initialStudent?.exam_fees_override !== undefined,
    examAmt:
      initialStudent?.exam_fees_override !== null &&
      initialStudent?.exam_fees_override !== undefined
        ? String(initialStudent.exam_fees_override)
        : "",
    reason: initialStudent?.concession_reason ?? "",
  }));

  // Siblings (read-only). Loaded fresh on open + after each save.
  const [siblings, setSiblings] = useState<Student[]>(initialSiblings ?? []);
  const [siblingDialogOpen, setSiblingDialogOpen] = useState(false);

  // "Already in the system?" search bar — only shown when no family linked.
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<FamilySuggestion[]>([]);
  const [searchPending, setSearchPending] = useState(false);

  // Hydrate when (re)opened. Refreshes siblings from the server so a
  // newly-added sibling shows up without a full page reload.
  useEffect(() => {
    if (!open) return;
    setLinkedFamilyId(initialFamily?.id ?? null);
    setFather(initialFamily?.father_name ?? "");
    setMother(initialFamily?.mother_name ?? "");
    setPhone(initialFamily?.phone ?? "");
    setAddress(initialFamily?.address ?? "");
    setName(initialStudent?.name ?? "");
    setCls(initialStudent?.class ?? draftClass ?? DEFAULT_CLASS);
    setDob(initialStudent?.dob ?? "");
    setDoa(initialStudent?.date_of_admission ?? "");
    setAadhaar(formatAadhaarFromDb(initialStudent?.aadhaar_no ?? null));
    setPen(initialStudent?.pen ?? "");
    setSearchQuery("");
    setSuggestions([]);
    setConc({
      monthlyOn:
        initialStudent?.monthly_fee_override !== null &&
        initialStudent?.monthly_fee_override !== undefined,
      monthlyAmt:
        initialStudent?.monthly_fee_override !== null &&
        initialStudent?.monthly_fee_override !== undefined
          ? String(initialStudent.monthly_fee_override)
          : "",
      termOn:
        initialStudent?.term_fees_override !== null &&
        initialStudent?.term_fees_override !== undefined,
      termAmt:
        initialStudent?.term_fees_override !== null &&
        initialStudent?.term_fees_override !== undefined
          ? String(initialStudent.term_fees_override)
          : "",
      examOn:
        initialStudent?.exam_fees_override !== null &&
        initialStudent?.exam_fees_override !== undefined,
      examAmt:
        initialStudent?.exam_fees_override !== null &&
        initialStudent?.exam_fees_override !== undefined
          ? String(initialStudent.exam_fees_override)
          : "",
      reason: initialStudent?.concession_reason ?? "",
    });
    setSiblings(initialSiblings ?? []);
    // After mount, refresh siblings from the server — siblingsOf via
    // family_id join (never chip text — §22).
    if (studentId) {
      loadSiblings(studentId).then(setSiblings).catch(() => undefined);
    }
  }, [open, studentId, draftClass, initialStudent, initialFamily, initialSiblings]);

  // Draft-mode autofocus. Move the cursor to Student name (not the cyan
  // "Already in the system?" search) so the principal doesn't accidentally
  // type the student's name into the parent-search bar. Editing an existing
  // student leaves focus alone so the principal can scan the populated
  // fields first.
  useEffect(() => {
    if (!open || !isDraft) return;
    // Defer one frame so the portal-mounted input is in the DOM.
    const handle = requestAnimationFrame(() => {
      nameInputRef.current?.focus();
    });
    return () => cancelAnimationFrame(handle);
  }, [open, isDraft]);

  // Debounced family search when typing in the cyan bar.
  useEffect(() => {
    if (linkedFamilyId) return;
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    setSearchPending(true);
    const handle = setTimeout(async () => {
      try {
        const matches = await searchFamiliesWithChildren(q);
        if (!cancelled) setSuggestions(matches);
      } catch {
        if (!cancelled) setSuggestions([]);
      } finally {
        if (!cancelled) setSearchPending(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [searchQuery, linkedFamilyId]);


  function pickSuggestion(s: FamilySuggestion) {
    setLinkedFamilyId(s.family.id);
    setFather(s.family.father_name ?? "");
    setMother(s.family.mother_name ?? "");
    setPhone(s.family.phone ?? "");
    setAddress(s.family.address ?? "");
    // Pre-populate siblings list with the linked family's children for
    // immediate feedback. (After Save these come from siblingsOf().)
    setSiblings(
      s.children
        .filter((c) => c.id !== studentId)
        .map((c) => ({
          id: c.id,
          family_id: s.family.id,
          name: c.name,
          class: c.class,
          roll_no: c.roll_no,
          dob: null,
          date_of_admission: null,
          aadhaar_no: null,
          pen: null,
          monthly_fee_override: null,
          term_fees_override: null,
          exam_fees_override: null,
          concession_reason: null,
          status: "active",
          created_at: "",
          updated_at: "",
        })),
    );
    setSearchQuery("");
    setSuggestions([]);
    toast.success(`Linked to family · ${s.family.father_name || s.family.mother_name || s.family.phone || "existing"}`);
  }

  function handleUnlink() {
    if (!studentId) {
      // Draft path — just clear the linked family + fields so the
      // cyan bar reappears for re-selection.
      setLinkedFamilyId(null);
      setFather("");
      setMother("");
      setPhone("");
      setAddress("");
      setSiblings([]);
      return;
    }
    if (!confirm("Unlink this student from the family?")) return;
    startTransition(async () => {
      const out = await enqueueUnlink(
        { studentId },
        `Unlink family · ${initialStudent?.name ?? name}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Unlink failed: ${out.error}`);
        return;
      }
      setLinkedFamilyId(null);
      // Keep the field values populated so the principal can save them
      // as a personal family record if they want (§22).
      setSiblings([]);
      if (out.online) {
        toast.success("Unlinked from family");
        router.refresh();
      } else {
        toast.success("Unlinked from family · queued offline");
      }
    });
  }

  function handleSave() {
    if (!name.trim()) {
      toast.error("Student name is required");
      return;
    }
    if (phone && !/^\d{10}$/.test(phone.replace(/\s/g, ""))) {
      toast.error("Phone must be exactly 10 digits");
      return;
    }
    const aadhaarDigits = aadhaar.replace(/\s/g, "");
    if (aadhaarDigits && !/^\d{12}$/.test(aadhaarDigits)) {
      toast.error("Aadhaar must be exactly 12 digits");
      return;
    }
    startTransition(async () => {
      const out = await enqueueSaveProfile(
        {
          studentId,
          linkedFamilyId,
          familyFields: linkedFamilyId
            ? {
                // Linked: server uses the existing family record verbatim.
                father_name: null,
                mother_name: null,
                phone: null,
                address: null,
              }
            : {
                father_name: father.trim() ? father.trim().toUpperCase() : null,
                mother_name: mother.trim() ? mother.trim().toUpperCase() : null,
                phone: phone.replace(/\s/g, "") || null,
                address: address.trim() || null,
              },
          studentFields: {
            name: name.trim(),
            class: cls,
            dob: dob || null,
            date_of_admission: doa || null,
            aadhaar_no: aadhaarDigits || null,
            pen: pen.trim() || null,
          },
          concession: {
            monthly_fee_override: conc.monthlyOn
              ? parseInt(conc.monthlyAmt.replace(/,/g, ""), 10) || 0
              : null,
            term_fees_override: conc.termOn
              ? parseInt(conc.termAmt.replace(/,/g, ""), 10) || 0
              : null,
            exam_fees_override: conc.examOn
              ? parseInt(conc.examAmt.replace(/,/g, ""), 10) || 0
              : null,
            concession_reason: conc.reason.trim() || null,
          },
        },
        undefined,
        isDraft
          ? `New student · ${name.trim().toUpperCase()}`
          : `Profile · ${name.trim().toUpperCase()}`,
      );
      if (!out.ok && out.online) {
        toast.error(`Save failed: ${out.error}`);
        return;
      }
      const base = `Saved profile · ${name.trim().toUpperCase()}`;
      if (out.online) {
        toast.success(base);
        router.refresh();
      } else {
        toast.success(`${base} · queued offline`);
      }
    });
    // Close the dialog right away — the server action proceeds in the
    // background (router.refresh fires when it returns). The principal
    // gets instant feedback instead of staring at a frozen modal until
    // the round-trip completes. If the action errors, the catch above
    // surfaces a red toast.
    onClose();
  }

  if (!open) return null;

  const showSearchBar = !linkedFamilyId;
  const showLinkedBanner = !!linkedFamilyId;

  return (
    <>
      {createPortal(
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && !pending) onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && !pending) onClose();
          }}
        >
          <div className="modal-card modal-card-wide profile-form">
            {/* Header */}
            <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="font-semibold text-slate-900">
                  Student profile
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isDraft
                    ? `New entry · ${formatClassLabel(cls)}`
                    : `${name || "—"} · ${formatClassLabel(cls)}`}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="text-slate-400 hover:text-slate-600 text-xl leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Cyan search bar OR green banner */}
              {showSearchBar && (
                <div className="link-existing-family">
                  <div className="link-pill">
                    <strong>Already in the system?</strong>
                    <span className="link-pill-hint">
                      Search by parent name or 10-digit phone to inherit
                      father, mother, phone, address — no re-typing.
                    </span>
                  </div>
                  <div className="link-search">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Type father / mother name or phone…"
                      autoComplete="off"
                      disabled={pending}
                    />
                    {suggestions.length > 0 && (
                      <div className="link-suggestions">
                        {suggestions.map((s) => (
                          <button
                            key={s.family.id}
                            type="button"
                            className="link-suggestion"
                            onClick={() => pickSuggestion(s)}
                          >
                            <div className="ls-parents">
                              {s.family.father_name || "—"}
                              {s.family.mother_name
                                ? ` & ${s.family.mother_name}`
                                : ""}
                            </div>
                            {s.family.phone && (
                              <span className="ls-phone">
                                {s.family.phone}
                              </span>
                            )}
                            <span className="ls-meta">
                              {s.children.length === 0
                                ? "No children on file"
                                : s.children
                                    .map(
                                      (c) =>
                                        `${c.name.split(" ")[0]} · ${formatClassLabel(c.class)}`,
                                    )
                                    .join(" · ")}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {searchQuery.trim().length >= 2 &&
                      !searchPending &&
                      suggestions.length === 0 && (
                        <div className="link-suggestions">
                          <div className="link-no-match">
                            No matching family — fill the fields below to
                            create a new one.
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}
              {/* Green "Linked to existing family" banner was here. It
                  duplicated the parent fields rendered just below in the
                  Family column, so we removed it to reclaim vertical
                  space and moved the Unlink button inline into the
                  Family column title (see below). */}

              {/* Student name */}
              <div>
                <label>
                  Student name <span className="req">*</span>
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  className="name-input"
                  value={name}
                  // CLAUDE.md: names auto-uppercase as typed.
                  onChange={(e) => setName(e.target.value.toUpperCase())}
                  disabled={pending}
                  placeholder="e.g., AARAV SHARMA"
                />
              </div>

              {/* Two-column layout */}
              <div className="profile-two-col">
                {/* LEFT: Family — Unlink button lives in the title bar
                    when a family is linked (replaces the old banner). */}
                <div className="profile-col col-family">
                  <div className="col-title">
                    <span>Family</span>
                    {showLinkedBanner && (
                      <button
                        type="button"
                        className="col-title-unlink"
                        onClick={handleUnlink}
                        disabled={pending}
                      >
                        Unlink
                      </button>
                    )}
                  </div>

                  <div
                    className={showLinkedBanner ? "field-inherited" : undefined}
                  >
                    <label>
                      Father&rsquo;s name
                      {showLinkedBanner && (
                        <span className="inherited-label">Family</span>
                      )}
                    </label>
                    <input
                      type="text"
                      className="name-input"
                      value={father}
                      onChange={(e) => setFather(e.target.value.toUpperCase())}
                      disabled={pending || showLinkedBanner}
                      readOnly={showLinkedBanner}
                      placeholder="e.g., RAJEEV SHARMA"
                    />
                  </div>

                  <div
                    className={showLinkedBanner ? "field-inherited" : undefined}
                  >
                    <label>
                      Mother&rsquo;s name
                      {showLinkedBanner && (
                        <span className="inherited-label">Family</span>
                      )}
                    </label>
                    <input
                      type="text"
                      className="name-input"
                      value={mother}
                      onChange={(e) => setMother(e.target.value.toUpperCase())}
                      disabled={pending || showLinkedBanner}
                      readOnly={showLinkedBanner}
                      placeholder="e.g., SUNITA SHARMA"
                    />
                  </div>

                  <div
                    className={showLinkedBanner ? "field-inherited" : undefined}
                  >
                    <label>
                      Phone
                      {showLinkedBanner && (
                        <span className="inherited-label">Family</span>
                      )}
                    </label>
                    <input
                      type="tel"
                      inputMode="numeric"
                      maxLength={10}
                      value={phone ?? ""}
                      onChange={(e) =>
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))
                      }
                      disabled={pending || showLinkedBanner}
                      readOnly={showLinkedBanner}
                      placeholder="9876543210"
                    />
                  </div>

                  <div
                    className={showLinkedBanner ? "field-inherited" : undefined}
                  >
                    <label>
                      Address
                      {showLinkedBanner && (
                        <span className="inherited-label">Family</span>
                      )}
                    </label>
                    <textarea
                      rows={2}
                      value={address ?? ""}
                      onChange={(e) => setAddress(e.target.value)}
                      disabled={pending || showLinkedBanner}
                      readOnly={showLinkedBanner}
                    />
                  </div>
                </div>

                {/* RIGHT: Student details */}
                <div className="profile-col col-student">
                  <div className="col-title">Student details</div>

                  <div>
                    <label>
                      Class <span className="req">*</span>
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

                  <div className="field-grid-2">
                    <div>
                      <label>Date of birth</label>
                      <input
                        type="date"
                        value={dob ?? ""}
                        max={todayIso}
                        onChange={(e) => setDob(e.target.value)}
                        disabled={pending}
                      />
                    </div>
                    <div>
                      <label>Date of admission</label>
                      <input
                        type="date"
                        value={doa ?? ""}
                        onChange={(e) => setDoa(e.target.value)}
                        disabled={pending}
                      />
                    </div>
                  </div>

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
                        (Personal Education Number · optional)
                      </span>
                    </label>
                    <input
                      type="text"
                      value={pen}
                      onChange={(e) => setPen(e.target.value)}
                      disabled={pending}
                      placeholder="optional for v1"
                    />
                  </div>
                </div>
              </div>

              {/* Siblings (read-only) */}
              <div>
                <label>Siblings also enrolled in this school</label>
                <div>
                  {siblings.map((sib) => (
                    <div key={sib.id} className="sibling-display-row">
                      <div className="sibling-display-name">{sib.name}</div>
                      <div className="sibling-display-class">
                        {formatClassLabel(sib.class)}
                      </div>
                      <button
                        type="button"
                        className="sibling-display-open"
                        onClick={() => {
                          toast.info(
                            `${sib.name} — open profile flow ships once the per-class register lands`,
                          );
                        }}
                      >
                        → Open profile
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn-add-sibling"
                  onClick={() => {
                    if (!studentId) {
                      toast.warning(
                        "Save this student first, then add siblings",
                      );
                      return;
                    }
                    if (!linkedFamilyId) {
                      toast.warning(
                        "Link this student to a family first to add siblings",
                      );
                      return;
                    }
                    setSiblingDialogOpen(true);
                  }}
                  disabled={pending}
                >
                  + Add new sibling
                </button>
              </div>

              {/* Concession — verbatim port of the mockup HTML so the
                  native <details> toggle does the work. Classes match
                  the .concession-section / .conc-row / .conc-toggle /
                  .conc-amount / .conc-reason rules in globals.css. */}
              <details className="concession-section">
                <summary>
                  <span>Concession (waive or override fees for this student)</span>
                </summary>
                <div className="conc-body">
                  <p
                    className="text-xs text-slate-500"
                    style={{ margin: "0 0 10px 0" }}
                  >
                    Use for sibling concessions, staff children, or any
                    per-student exception. Leave unchecked to use class
                    defaults.
                  </p>

                  <div className="conc-row">
                    <label className="conc-toggle">
                      <input
                        type="checkbox"
                        checked={conc.monthlyOn}
                        onChange={(e) =>
                          setConc((c) => ({
                            ...c,
                            monthlyOn: e.target.checked,
                          }))
                        }
                        disabled={pending}
                      />
                      <span>
                        Waive / override <strong>monthly</strong> fee
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="conc-amount"
                      placeholder="₹0 = waived"
                      value={conc.monthlyAmt}
                      onChange={(e) =>
                        setConc((c) => ({
                          ...c,
                          monthlyAmt: e.target.value.replace(/[^0-9,]/g, ""),
                        }))
                      }
                      disabled={pending || !conc.monthlyOn}
                    />
                  </div>

                  <div className="conc-row">
                    <label className="conc-toggle">
                      <input
                        type="checkbox"
                        checked={conc.termOn}
                        onChange={(e) =>
                          setConc((c) => ({ ...c, termOn: e.target.checked }))
                        }
                        disabled={pending}
                      />
                      <span>
                        Waive / override <strong>term</strong> fees
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="conc-amount"
                      placeholder="₹0 = waived"
                      value={conc.termAmt}
                      onChange={(e) =>
                        setConc((c) => ({
                          ...c,
                          termAmt: e.target.value.replace(/[^0-9,]/g, ""),
                        }))
                      }
                      disabled={pending || !conc.termOn}
                    />
                  </div>

                  <div className="conc-row">
                    <label className="conc-toggle">
                      <input
                        type="checkbox"
                        checked={conc.examOn}
                        onChange={(e) =>
                          setConc((c) => ({ ...c, examOn: e.target.checked }))
                        }
                        disabled={pending}
                      />
                      <span>
                        Waive / override <strong>exam</strong> fees
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="conc-amount"
                      placeholder="₹0 = waived"
                      value={conc.examAmt}
                      onChange={(e) =>
                        setConc((c) => ({
                          ...c,
                          examAmt: e.target.value.replace(/[^0-9,]/g, ""),
                        }))
                      }
                      disabled={pending || !conc.examOn}
                    />
                  </div>

                  <label style={{ marginTop: 8 }}>Reason for concession</label>
                  <input
                    type="text"
                    className="conc-reason"
                    value={conc.reason}
                    onChange={(e) =>
                      setConc((c) => ({ ...c, reason: e.target.value }))
                    }
                    disabled={pending}
                    placeholder="e.g., 3rd sibling, Staff child"
                  />
                </div>
              </details>
            </div>

            {/* Footer */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="text-sm text-slate-600 hover:text-slate-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={pending}
                className="px-6 py-2 bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800 text-white rounded-md text-sm font-semibold shadow-sm disabled:opacity-60"
              >
                {pending ? "Saving…" : "Save profile"}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {studentId && (
        <SiblingMiniDialog
          open={siblingDialogOpen}
          onClose={() => {
            setSiblingDialogOpen(false);
            if (studentId) {
              loadSiblings(studentId).then(setSiblings).catch(() => undefined);
            }
          }}
          parentStudentId={studentId}
          parentStudentName={name || initialStudent?.name || "this student"}
          inherit={{
            father,
            mother,
            phone,
            address,
          }}
          defaultClass={cls}
        />
      )}
    </>
  );
}
