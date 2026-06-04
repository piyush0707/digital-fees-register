# Mockup User Functionality — Implementation Instructions (v1.0 · build-ready)

> ## ▶ CLAUDE CODE — START HERE
>
> This Markdown file is the **single source of truth** for the v1 build. The two Principal review sessions captured in `feedback_session_1.md` are reflected here. The HTML mockup is locked.
>
> 1. Read this file **end-to-end** before opening any other file in the workspace.
> 2. Open `Digital_Fees_Register_UI_Mockup.html` in a browser as your pixel-level visual reference. The mockup uses CSS variables and inline styles you can copy verbatim into your Tailwind / shadcn implementation.
> 3. Cross-check the schema in `Digital_Fees_Register_Technical_Spec.pdf` (in this folder) — **rebuilt v1.0, build-ready**. The old `Tech_Spec_Addendum_v0.9.md` has been folded into §3 / §4 of the docx and retired (archived under `_archive/`).
> 4. v1 scope is **Class 10 only**, **digital register only** (no PDF / WhatsApp / Print / Email send). Other classes (5/7/8) appear in the prototype as demo data only — wire them as read-only previews in v1.
> 5. The 7-day build plan is in **§20** below.
> 6. When you discover a behavioural detail not covered here, the mockup HTML is authoritative — and please record the answer in this file so the next agent doesn't re-derive it.
>
> ### Document precedence (highest wins on conflict)
> 1. This file (Mockup_User_Functionality.md) — interaction-level source of truth
> 2. `Digital_Fees_Register_Technical_Spec.pdf` v1.0 — schema, validation, scope, invariants
> 3. `Digital_Fees_Register_UI_Mockup.html` — visual + interactive reference
> 4. `feedback_session_1.md` — history of why decisions were made
> 5. Anything in `_archive/` — historical only; do not implement from it.

---

## What's in this document

| # | Section | What it covers |
|---|---|---|
| 1 | Screen 1 — Login | Auth form (real Supabase Auth in v1) |
| 2 | Screen 2 — Register Grid | The main paper-register replacement |
| 3 | Screen 3 — Dashboard | Principal's daily KPIs + pending dues |
| 4 | Screen 4 — Total Transactions | Year-over-year planning view |
| 5 | Screen 5 — Receipt / Record-payment | The ⋯ escape-hatch modal (v1-simplified) |
| 6 | Screen 6 — Fee Structure | Per-class default fees |
| 7 | Screen 7 — Student Profile | Per-student record + concession |
| §17 | Feedback Session 1 items (FB#1–FB#7) | Detailed, item-by-item contracts |
| §18 | Sibling profile pre-population | NEW — family-shared fields auto-populate across sibling profiles |
| §19 | Session-2 feedback consolidated | Per-student fees, clickable chips, top-bar consistency, screen reorder, draft new-row flow, theme cleanup |
| §20 | Updated 7-day Timeline | What to build, in what order |
| §21 | Build sequence + checklist | Last-mile handoff |

**Companion files in this folder:**
- `Digital_Fees_Register_UI_Mockup.html` — the prototype itself (open in browser to reference)
- `Digital_Fees_Register_Technical_Spec.pdf` — v1.0 build-ready · authoritative schema, validation, scope, ER diagram, invariants
- `feedback_session_1.md` — Principal review notes (history, not requirements)
- `Digital_Fees_Register_Product_Spec.pdf` — v1 vs v2 scope framing (historical)
- `_archive/` — pre-merge tech spec (v0.7) and the retired addendum (v0.9). Do not implement from these.

---

## Screen 1 — Login

Simple email + password form, centred on a slate-to-indigo gradient background. Sign-in routes to the Register. School logo (emerald-to-green-700 grad-cap SVG) above the card. School name "Sample School" displayed below the logo. v0.6 version label and online/sync-status badges at the foot of the card. No real auth in the prototype — sign-in just scrolls to Screen 2.

---

## Screen 2 — Register Grid

The Register Grid is the primary working surface. Replaces the school's paper register. Mirrors paper layout, paper terminology, paper family-grouping conventions.

### 1. Column structure (20 columns total)

Left to right:

```
Roll | Name | P.Dues | T.Fees | Monthly | Apr | May | Jun | Jul | Aug | Sep Exam | Sep | Oct | Nov | Dec | Jan | Feb Exam | Feb | Mar | Pending
```

- **Roll** — student/family roll number. Centered, bold. Width 56px. Sticky-left.
- **Name** — family primary name + sibling chips. Width 220px. Sticky-left.
- **P.Dues, T.Fees, Monthly** — anchor reference values. Width 88px each. Sticky-left. The Monthly column has a 2px slate divider on its right edge marking the end of the sticky-left zone.
- **Apr–Mar** — 12 month payment columns. Width ~88px. Scrolls horizontally.
- **Sep Exam, Feb Exam** — exam-fee cells inserted before Sep and Feb. Default expected ₹400. Width ~88px. Scrolls.
- **Pending** — computed total pending dues. Sticky-right. Header dark red `#991b1b`.

### 2. Sticky positioning rules (critical implementation notes)

- **Left-sticky group** (always visible during horizontal scroll): Roll → Name → P.Dues → T.Fees → Monthly + any user-added anchor columns.
- **Right-sticky**: Pending.
- **Scrolling middle**: Apr → Mar plus the two Exam columns.

**Must use:**
- `position: sticky` with `box-sizing: border-box` and explicit widths
- `border-collapse: separate; border-spacing: 0` on the table — collapsed-borders silently break `z-index` on table cells
- `isolation: isolate` on the table to establish a clean stacking context
- Z-index hierarchy: sticky headers `30` > sticky data cells `20` > scrolling cells `0`
- `background-clip: padding-box` so opaque backgrounds fully cover scrolling content underneath

Anchor sticky lefts are assigned by a `data-anchor-pos="N"` attribute on each anchor cell. CSS uses `[data-anchor-pos="N"] { left: <px> !important }`. Positions: 276 / 364 / 452 / 540 / 628 / 716 for positions 1–6. Supports up to 6 anchor columns (3 default + 3 user-added).

**Anchor reindex on delete**: When a user deletes an anchor column, the remaining anchor cells' `data-anchor-pos` attributes are reindexed sequentially (1, 2, 3…). Otherwise a gap appears in the sticky zone. This applies to live DOM AND to all saved class snapshots.

### 3. Colour palette (final)

| State | Background | Text | Notes |
|---|---|---|---|
| Paid in full | `#dcfce7` (green-100) | `#166534` | No ₹ symbol — just the amount |
| Partial | `#fed7aa` (orange-200) | `#9a3412` | No ₹ symbol |
| Missed / Pending (red) | `#fee2e2` (red-100) | `#991b1b` | **Show ₹ prefix** (e.g., `₹1,500`) |
| Not yet due (future) | `#f8fafc` (slate-50) | `#94a3b8` | Content: `—` |
| Anchor / Reference | `#f1f5f9` (slate-100) | `#0f172a` | Bold weight |
| Exam pending | `#f8fafc` | `#94a3b8` italic | Shows default `400` |
| Withdrawn future | striped diagonal slate | — | Indicates no payment expected |

Header colours: Roll, Name, month headers dark slate `#1e293b`. Anchor headers `#475569`. Pending header dark red `#991b1b`. Sep Exam / Feb Exam headers school green `#15803d`.

Brand accents: `+ New entry` button uses gradient `from-emerald-500 to-green-700`. School logos use the same gradient.

**The ₹ symbol rule: only red/due cells show ₹.** Paid, partial, future, and neutral anchor cells display plain numbers (or `—`). P.Dues is a special case: positive value = red + ₹; zero/blank = neutral slate.

### 4. Family name & sibling representation (multi-class rendering)

Each Name cell has two lines:

- Line 1: primary family name in **bold** (`.family-name-primary`).
- Line 2 (only if siblings exist): small slate chips, format `Name · Class` (e.g., `Kavya · VIII`).

Examples:
- `Aarav Sharma` (no siblings, single-line)
- `Diya Verma` / `[Kavya · VIII]`
- `Kabir Kumar` / `[Naina · VII] [Aanya · V]`

Chip styling: 10px text, slate-100 background, slate-600 text, 4px padding, 4px radius. Roman numerals for class numbers; words for Nursery/LKG/UKG.

**Multi-class rendering rule (v1):** A family with students in multiple classes appears in **every** class register it has students in. The "primary" of any register row is *contextual* — it's the student of that family who is in the currently-viewed class. So the Kabir + Naina + Aanya family appears:
- In Class 10 register: Kabir primary, Naina & Aanya as chips
- In Class 7 register: Naina primary, Kabir & Aanya as chips  
- In Class 5 register: Aanya primary, Kabir & Naina as chips

Implementation: do NOT store `is_primary` on the students table. Determine the primary by JOIN: `WHERE students.class = currentClass AND students.family_id = families.id`. Sibling chips are every other active student in the same family.

**Per-student fees rule (confirmed in Principal review 2026-05-16):** every cell on a row — `P.Dues`, `T.Fees`, `Monthly`, every month cell, every exam cell — represents the **contextual student**, never the family sum. So Kabir's row in Class 10 shows `₹1,500 / ₹1,500`, Naina's row in Class 7 shows `₹1,500 / ₹1,400`, and Aanya's row in Class 5 (3rd-sibling concession) shows `₹0 / ₹0` for the waived heads. Editing a cell or applying a concession from the row's profile dialog affects **only that student**.

**Sibling chip navigation (FB session 2):** sibling chips (`NAINA · VII`, `AANYA · V`) are clickable. Click jumps to the sibling's class register, scrolls to their row, and applies the same `.row-highlight` yellow flash (~2.5s) that Dashboard's pending-dues list uses. The handler in the prototype matches by first-word-of-primary against the chip's first name; in the real app match by `family_id` join. Chip click bubbles through `stopPropagation()` so the parent cell's inline-edit handler is not triggered.

In v1 the prototype now has **mock data for Class 5, Class 7, and Class 8** as well as Class 10 — specifically to demo the multi-class sibling rendering. Switching to Class 5 shows Aanya Kumar (with chips Kabir·X and Naina·VII) and Param Joshi (with chip Pari·X). Switching to Class 7 shows Naina Kumar (with chips Kabir·X and Aanya·V). Switching to Class 8 shows Kavya Verma (with chip Diya·X). Other classes remain v2 placeholders.

### 5. Inline cell edit (Option B — primary interaction)

Clicking any month-cell or anchor-cell opens an inline editor inside the cell. **No modal for the common case.**

**Flow:** Click cell → input pre-filled with expected amount (family monthly for month cells, current value for anchor cells, ₹400 for exam cells) → focused, content selected → floating dark tooltip below the cell shows `↵ save · Esc cancel · ⋯ more` (omit `⋯` for anchor cells) → **Enter** saves, **Esc** cancels silently, **blur (click away) cancels** with a warn toast.

**Numeric-only input filter:**
- `inputmode="numeric"`
- Keypress blocks any non-digit / non-comma character
- Paste/input event strips non-numeric chars
- Indian comma format (e.g., `1,500`) allowed

**Save behaviour for payment cells:**
- `amount === 0` → future (`—`), or exam-pending (italic `400`) for exam cells
- `0 < amount < expected` → partial (orange)
- `amount >= expected` → paid (green)
- Bumps running totals (Today + MTD) by the delta
- Toast: `Saved · {family} · {column-name} · ₹{amount}`

**Anchor-cell special case (P.Dues):**
- Value > 0 → cell turns red + ₹ prefix (`₹1,500`)
- Value = 0 → red goes away, cell becomes blank slate
- T.Fees, Monthly, user-added anchors: always neutral slate, no ₹

**Concession workflow (P.Dues / T.Fees / Monthly are all editable).** When the principal types a new value into the Monthly anchor on a family's row, the value is saved to `families.monthly_fee_override`. From that moment on, every Pending / Expected calculation for that family — including the inline-edit pre-fill on month-cells and the Modal's Expected field — reads the override instead of `SUM(fee_structures[student.class].monthly_fee)`. The override is recurring (stays applied until cleared) and propagates across every class register where the family has students (via the families.id JOIN). Past payments are never retroactively recalculated; only future expected/pending values change. T.Fees and P.Dues edits follow the same pattern (stored as columns on the family row).

**CRITICAL implementation note for Claude Code.** The Register table's click handler must distinguish `sticky-col-roll` and `sticky-col-name` (skip — these are identity columns, not editable) from `sticky-col-anchor` (allow — these ARE editable). A generic `sticky-col` check will mistakenly exclude anchors because every left-sticky cell shares the `sticky-col` base class. Use:

```js
if (cell.classList.contains('sticky-col-roll')) return;
if (cell.classList.contains('sticky-col-name')) return;
if (cell.classList.contains('pending-cell')) return;
// anchor cells fall through and become editable
```

### 6. Payment modal (⋯ escape hatch, redesigned for click-first UX)

Clicking the `⋯` badge on an inline-editing cell opens the full modal. Optimised for click-first interaction — minimal typing required.

**Fields, top to bottom:**

1. **Fee head** — dropdown (Tuition (auto-detected) · Annual · Exam (Sep) · Exam (Feb Pre-board) · Admission · Late Fine · P.Dues).

2. **Period — multi-select month chips.** 12 chip buttons (Apr through Mar) in a wrapping row. The cell-clicked month is auto-active in green; click other months to toggle. **Already-paid months are disabled** (strikethrough, faded slate, `cursor: not-allowed`, tooltip *"Apr is already paid"*). The cell-clicked month is always editable even if paid.

3. **Expected** — editable numeric field for applying concessions. When chips toggle, Expected = per-month base × selected count. Helper text: *"(editable — apply concession here)"*.

4. **Amount paid** (required, numeric-only) — pre-filled with `expected × selected count`. Recomputes when chips change.

5. **Date paid** — `<input type="date">` (native browser picker). Defaults to today in ISO `YYYY-MM-DD`.

6. **Payment method / notes** — one-click preset chips above a text input:
   - 💵 Paid in cash
   - 📃 Cheque
   - 📱 UPI
   - 🏦 Bank transfer

**Notes chip behaviour:**
- Click chip → fills the input with chip's label, activates that chip, deactivates others
- Click an already-active chip → clears the input, deactivates the chip
- Typing in the input → only the chip whose label matches the text exactly is highlighted; chips for non-matching text deactivate

**Save behaviour with multi-month:**
- Both `amount` and `expected` are divided by `selectedMonths.length` for per-cell state
- Each selected month's corresponding cell gets `applyCellState(cell, perMonthAmount, perMonthExpected)`
- Each cell is judged independently → all marked green if `perMonthAmount >= perMonthExpected`
- Totals bumped by `perMonthAmount × count`
- Toast: `Saved · {family} · {paidFor} · {N} months · ₹{total}`

**"Paid for" selector (1% edge case — parent pays only one child):**

Above the Period chips, a "For" row with chips:
- **Whole family** (default, active) — payment treated as the combined family payment. Stored on `payments` with `student_id = NULL`.
- One chip per individual student in the family — primary + each sibling. Clicking selects that single student; payment stored with `payments.student_id = <that student's id>`.

If the family is single-child (no siblings), the "For" block is hidden entirely — no choice to make.

Selecting an individual student does NOT change the displayed amount or cells in v1 prototype — the modal still records to the cell-clicked row's cells. v1 just records the attribution. The full per-student Pending calculation that respects this attribution is v2 work.

### 7. Row operations (✏ edit profile / × delete or withdraw)

Hover any family row → TWO icon buttons appear at the right edge of the Name cell: indigo `✏` edit (left) and red `×` delete (right).

**`✏` opens the Student Profile modal** (see §11).

**`×` opens a reason-for-removal popover** with two options:

1. **Withdrawn** (warn / yellow tone) — *Keep payment history. Grey out future months. Restorable any time.*
   - Adds `.withdrawn` class. Name becomes muted italic with `WITHDRAWN` badge.
   - Past payment cells preserved. Future months switch to striped diagonal slate.
   - **Totals are NOT subtracted.**
   - `×` button flips to green `↻`. Clicking it shows a yes/no restore popover.

2. **Typo / mistake** (danger / red tone) — *Remove the row entirely. 8 seconds to undo.*
   - Row removed; red toast with **Undo** button for 8 seconds.
   - Undo restores to exact original position.
   - Switching classes dismisses any open undo toast.

Esc / click-outside closes the reason popover.

### 8. Add new family row (`+ New entry` button)

Top-right of the register card, green emerald-to-green-700 gradient.

**Flow:** Click → new blank row appended → Roll auto-incremented → Name input pre-focused with placeholder `Type name & press Enter (e.g., Aryan Mehra)` → **Enter** commits → toast `Added family · {name}`.

- Esc discards entire row
- Blur with content → commits (deliberate creation, different from cell-edit blur=cancel)
- Blur empty → discards with `Discarded (no name typed)` toast
- New row: empty anchors, future months, exam-pending exam cells, Pending = 0 (green)

For v2 preview classes: button shows warn toast `Class N loads in v2 — try Class 10 or Class 7` and aborts.

### 9. Class picker

Single pill at top-left showing current class with chevron. Click → dropdown of all 13 classes (Nursery → Class 10), each with a status badge: `live · v1` (Class 10), `preview` (Class 7), `v2` (everything else).

**Implementation:**
- `position: fixed` with dynamic `top` / `left` from button rect (escapes parent `overflow: hidden`)
- `max-height: min(60vh, viewportHeight - buttonBottom - 16px)`
- Body scroll-locked while menu open (`body.dropdown-open { overflow: hidden }`)
- Auto-scrolls to centre the active class
- Esc / click-outside closes

**On selection:**
1. Save current class's tbody snapshot + totals to per-class map
2. Load destination class's snapshot (or build mock if first visit)
3. Pill label updates, toast confirms
4. Any open undo toast dismissed

**Class data:**
- **Class 10** — 28 families, 9 visible. Source of truth.
- **Class 7** — mock preview: 3 families (Naina Kumar, Riya Singh, Vivaan Sharma) at ₹1,400/mo, Apr+May paid, all others future.
- **Other classes** — placeholder card: *"{Class} — preview. Families load in v2. The UI is identical to Class 10."* Editing disabled.

### 10. Anchor column management — v2 (deferred)

Custom anchor column types (e.g. *Activity Fee*, *Lab Fee*, *Transport*) are deferred to v2. The `+ Anchor` button and anchor-header rename / delete icons have been **removed from the v1 prototype**. In v1, the three fixed anchors (P.Dues, T.Fees, Monthly) are hardcoded; concessions live on `families.monthly_fee_override` as a simple per-family override.

When v2 builds this:
- Anchor column types live in their own `anchor_columns` table (per-class, with display order).
- Per-family anchor values live in `family_anchor_values` (a join table — many anchors × many families).
- Reuse the same hover-revealed ✏ / × header pattern from the v1 prototype's earlier iterations.
- Sequential `data-anchor-pos` reindexing after add/delete (the v1 prototype already proved this pattern works).

### 11. Student Profile modal (opens from row `✏`)

Hover row → click `✏` → modal opens (uses standard `.modal-overlay` shell).

**Header:** `Student profile · {family} · {class}`.

**Fields:**

> **v1 field requirements (transitional):** Only **Student name** and **Class** are mandatory. Every other field — Father, Mother, Phone, Address, DOB, Date of Admission, Aadhaar, PEN — is **optional for now**, so the Principal can create rows quickly during the initial roster build. These will be promoted back to mandatory in a later iteration. Formats (phone = 10 digits, Aadhaar = 12 digits) are still validated, but **only when a value is actually entered** — an empty optional field never blocks Save. **SQL implication: create these columns as nullable now; tighten to NOT NULL later.**

1. **Student name** (required) — pre-filled with family name from the row.

2. **Class** (required, dropdown) — Nursery → Class 10. Pre-selected to the row's current class.

3. **Phone** (optional in v1, **10-digit numeric only** when entered):
   - `inputmode="numeric"`, `maxlength="10"`
   - Keypress blocks non-digits; input event strips non-digits and truncates to 10 chars
   - Save validates exact length === 10 **only if a value was entered**; an empty phone never blocks Save

4. **Father's name** and **Mother's name** — labelled `(or Mother)` / `(or Father)` and marked `(optional)`. **Optional in v1** — the earlier "at least one parent must be filled" rule is suspended for now and returns in a later iteration.

5. **Address** — multiline textarea, optional.

6. **Siblings also enrolled** — dynamic list. Each sibling row: `Name input · Class dropdown · × remove`. A dashed `+ Add sibling` button below appends a blank row.

**Sibling data flow:**
- Modal pre-fills from existing chips in the row (parses `Name · ClassRoman` text). Stored profile takes priority if present.
- Internally stored as `Class N` (matches the dropdown); rendered as roman numeral in the chip via `classToChipLabel()` helper.
- Nursery / LKG / UKG stay as-is in chips.

**Save behaviour:**
1. Validate: name non-empty, phone exactly 10 digits, at least one parent filled
2. Collect siblings from form rows (skip empty names)
3. Store in `FAMILY_PROFILES[name]` (class, phone, father, mother, address, siblings array)
4. Re-render the Name cell: primary name + sibling chips → preserve row controls via `addRowControls()`
5. Toast: `Saved profile · {name}`

**Future enhancement (v2 — see §17):** sibling auto-match across class registers to handle spelling variations and link records.

### 12. Pending column

- Sticky-right during horizontal scroll
- Per-family running total of outstanding dues (P.Dues + missed-month amounts + partial-month deficits)
- Display: `0` → green-100 background, green-800 text; `> 0` → red-100 background, red-800 text (e.g., `2,200`)
- Not editable (computed)

**Prototype caveat:** Pending values are hardcoded per row in the static HTML. The real implementation must compute them live from anchor + payment cells. v1 implementation requirement.

### 13. Totals (Today + MTD)

Two streams:

- **Current-class totals** drive the Register top bar (`Today` + `May 2026 MTD` figures). Bump on every payment in the current class (live or preview).
- **School-wide totals** drive the Dashboard cards (`Collected today · school-wide` + `May 2026 MTD · school-wide`). Bump **only** when the active class status is `live` (Class 10 in v1).

On class switch: save current totals to per-class store, load destination totals. Dashboard totals don't reset.

### 14. State persistence across class switches

```
CLASS_TBODY[classId]    → HTML snapshot of tbody
CLASS_TOTALS[classId]   → { today, month }
FAMILY_PROFILES[name]   → { class, phone, father, mother, address, siblings }
```

On leave: snapshot from live DOM. On enter: snapshot replayed (or built fresh on first visit). New rows, deletions, anchor add/delete, payment edits, P.Dues edits, withdrawn states, profile data — all persist across switches.

Anchor structural changes propagate to **every** snapshot via DOM-manipulation helpers (`insertCellInLiveAndSavedTbodies`, `removeCellInLiveAndSavedTbodies`, `reindexAnchorsInHTML`).

### 15. Legend (bottom-right footer of the register card)

A slim right-aligned strip inside the register card, below the table:

| Swatch | Label |
|---|---|
| green-100 | Paid |
| orange-200 | Partial |
| red-100 | Missed / Pending |
| slate-50 bordered | Not yet due |
| slate-100 bordered | Anchor / Reference |

### 15A. Cross-screen navigation (Register ↔ Dashboard)

Symmetric navigation between the two main screens — both achievable in one click:

**Register → Dashboard.** A small `📊 Dashboard` button in the Register top bar (between the school-name area and the ⚙ Settings button). Click → smooth-scrolls down to the Dashboard.

**Dashboard → Class register.** A prominent green `📓 Open class register` button on the Dashboard top bar (left of ↻ Refresh). Click → a class popover opens (same style as the Register's class picker), listing all 13 classes with the same `live · v1` / `preview` / `v2` status badges. Click any class → switches the Register to that class AND smooth-scrolls up to Screen 2. Toast: `Opened {class} register`. Esc / click-outside closes the popover.

In addition: the dashboard's *Students with pending dues* table already supports a deep-link flow per row — click any row → jumps to that family on the Register with the row briefly highlighted in amber. See §D3 of Screen 4.

### 15B. Settings popover (Register top bar)

The ⚙ Settings button in the Register top bar opens a small popover anchored below it. v1 contains one option:

- **Edit fee structure** — opens the Fee Structure modal (Screen 5).

v2 will expand the menu (school profile, academic session, sign-out variants, etc).

The popover closes on outside click, Esc, or after a menu item is chosen.

### 15C. Sync indicator (removed in v1)

The "Synced 2 min ago" status badge that appeared on the Register top bar in earlier drafts has been **removed**. v1 ships without a sync indicator until the offline-first sync wiring is verified to be reliable in production. The Dexie/IndexedDB queue is still the write path; the badge returns in v2 once we know what state it should reflect.

### 16. Keyboard shortcuts

| Keys | Action |
|---|---|
| `Enter` | Save inline cell edit / commit new row / save modal |
| `Esc` | Cancel cell edit / discard new row / close modal / close popover / close class picker |
| Click outside | Cancel cell edit (with warn toast); close popovers; close class picker |
| Click `⋯` on cell | Open payment modal |
| Click `✏` on row | Open student profile modal |
| Click `+ Anchor` | Prompt for new anchor column |
| Click `+ New entry` | Append new family row |
| Hover anchor header | Reveal ✏ × controls |
| Hover family row | Reveal ✏ + × buttons in Name cell |

### 17. Things explicitly NOT in v1 (do NOT implement now)

- Pending column auto-recompute when payments are recorded
- Receipt PDF generation, WhatsApp / Print / Email delivery, sequential receipt numbers (all v2)
- Family CRUD via admin forms (v2 — `+ New entry` and Profile modal in v1 are previews only)
- Razorpay UPI integration, auto-reconciliation (v2)
- Defaulter list, bulk WhatsApp reminders (v2)
- **Sibling auto-link across classes** (v2 — see below)
- Year-end roll-over (v2)
- Parent self-service login (v3)

**Sibling cross-class linking (v2)**: In v1 the Profile modal stores siblings as free-text label + class. v2 must add: autocomplete from existing student records across all classes as the principal types a sibling name; fuzzy matching (Levenshtein ≤ 2) for spelling variations; once linked, store the actual student ID for two-way relationship integrity; surface a small "linked" indicator on the chip.

---

## Screen 5 — Fee Structure (Settings)

Accessed via the ⚙ Settings button in the Register top bar. Click Settings → popover with one option `Edit fee structure` (v2 will expand the menu with more options). Selecting it opens the Fee Structure modal as an overlay on top of whichever screen the principal is on.

The prototype HTML also includes a **static scrollable demo** of this same screen at the bottom of the page (`#screen-fees`, "Screen 5 of 5 · Fee structure") so the form layout can be reviewed without first opening the modal. The functional version lives inside the `#fees-modal-overlay` element and is the one the principal actually interacts with.

### Fields

- **Class** (dropdown) — pick which class to edit. Defaults to the currently-active class. Switching the dropdown reloads the form from the stored fees for that class.
- **Monthly fee** (required, numeric)
- **Annual fee** (numeric)
- **September exam fee** (numeric, default 400)
- **February exam fee** (numeric, default 400)
- **Miscellaneous fees** (numeric, default 0) — placeholder for any other recurring fee category. After the Principal confirms the actual school structure, this may be split into specific named columns (library / activity / lab).

### Live total

Below the fields, a computed `Total per year` reads:

```
Total = monthly_fee × 12 + annual_fee + sep_exam_fee + feb_exam_fee + misc_fees
```

For Class 10's defaults (`1,500 / 1,500 / 400 / 400 / 0`): `₹20,300/year`. Updates live as the principal types.

### Save behaviour

- Writes to `fee_structures` for the chosen class.
- Toast: *"Fee structure updated · {class} · changes apply to families without a concession."*
- The Register Grid's Monthly anchor recomputes automatically for any family that doesn't have `families.monthly_fee_override` set.
- Past `payments` records are unchanged (history preserved).
- v1: changes apply forward only. v2 may add backdating with audit trail.

### v1 default seed values

```
Class 10 → monthly 1,500 · annual 1,500 · sep_exam 400 · feb_exam 400 · misc 0
Class 7  → monthly 1,400 · annual 1,400 · sep_exam 400 · feb_exam 400 · misc 0
Class 5  → monthly 1,000 · annual 1,000 · sep_exam 400 · feb_exam 400 · misc 0
Others   → monthly 0 · annual 0 · sep_exam 400 · feb_exam 400 · misc 0 (principal fills in)
```

The expected per-family Monthly anchor for a multi-class sibling family is therefore the sum across each active student's class default — `families.monthly_fee_override` wins when set.

---

## Screen 3 — Payment Modal (standalone demo of §6)

Screen 3 is a static documentation page showing what the Payment modal looks like with `Kabir Kumar + Naina + Aanya · SR 4 · Class 10` as the example context. Same fields and layout as the functional modal described in §6. No actual interactivity on this screen — it's a reference for designers / Claude Code.

---

## Screen 4 — Dashboard

Mobile-friendly read-only view. Heading is just *"Dashboard"* (no subtitle).

### D1. Dashboard top bar

Logo + `Sample School · Dashboard` on the left. Two buttons on the right:

**📓 Open class register** (green-gradient pill, matches the school brand):
- Click → opens a class-picker popover (same style as the Register's class picker) listing all 13 classes with `live` / `preview` / `v2` status badges
- Click a class → `switchClass(classId)` + smooth-scroll up to Screen 2 + toast `Opened {class} register`
- Popover closes on Esc / click-outside / after selection

**↻ Refresh** (slate pill):
- Icon spins 360° on click (`refresh-icon` rotates)
- Calls `setTotals()` to re-render metric values
- Toast: `Dashboard refreshed`

### D2. Key metric tiles (3 tiles)

`grid-cols-3` layout. Three balanced tiles.

1. **Collections · school-wide** — single merged card carrying class `.collections-card`. Two label/value rows separated by a thin divider:
   - `Today` → `₹12,400`
   - `May 2026 · MTD` → `₹38,800`
   Both numbers in slate-900 20px bold. Header text reads `Collections · school-wide` to set scope. Replaces the previous two side-by-side tiles which were mostly empty space.

2. **Total pending dues** — the current in-progress month's pending PLUS the 6-month trend chart. Layout:
   - Header `Total pending dues` (text-xs slate-500)
   - Big `₹11,300` in rose-600 (3xl, leading-none)
   - 6-month END-OF-MONTH sparkline directly below the number — one datapoint per month, sampled on the last day after parents have had time to pay. X-axis labels Dec → May. Most recent month is a slightly larger filled dot.
   Carries class `.pending-trend-card` so it inherits the sparkline styles.

3. **avg pending dues vs prior 3-month avg** — the ROI tile. The header text IS the metric description (no separate "Collection trend" label). Contents:
   - **Green delta pill:** `▼ 20%` in a light-green pill — the smoothed success metric. Average pending of the most recent 3 months vs the average of the 3 months before that.
   - **Rupee-ROI line:** a small green-bordered fact, e.g. `≈ ₹8,700 recovered since launch (3 months · ₹2,900 / mo)`. Tooltip explains the formula. This translates the percentage into actual cash recovered vs the pre-app baseline.
   Carries class `.pending-trend-card`.

### D2a. The success metric — why this design

The straightforward "pending dues over time" chart misleads because of the monthly billing sawtooth: every 1st, new fees become due and pending spikes; through the month, parents pay and it drops. Plotted raw, you get a zigzag that never tells you whether the product is helping.

The card defuses this with two things working together:

1. **End-of-month snapshots only on the sparkline** — sample pending dues once per month, on the last day. Each snapshot represents the same phase of the billing cycle, so it's apples-to-apples month over month.
2. **Smoothed comparison in the headline delta** — instead of comparing single months, compare a 3-month rolling average to the prior 3-month rolling average. For May, that's `avg(Mar, Apr, May)` vs `avg(Dec, Jan, Feb)`. Both sides are smoothed, so the comparison is robust to any one month being anomalous.

If the resulting `▼ X%` is consistently positive (down), the app is doing its job — parents are paying more reliably, the notification flow is working, the principal's time spent in the app is paying off. If it goes flat or `▲ red`, that's a signal to debug.

**Query the trend like this** (in real v1 build):

```sql
-- Step 1 — end-of-month pending snapshots for the last 6 months
WITH month_ends AS (
  SELECT (date_trunc('month', m) + INTERVAL '1 month - 1 day')::DATE AS as_of
  FROM generate_series(
    date_trunc('month', CURRENT_DATE - INTERVAL '5 months'),
    date_trunc('month', CURRENT_DATE),
    INTERVAL '1 month'
  ) m
),
snapshots AS (
  SELECT
    me.as_of,
    compute_expected_through(me.as_of) -
    COALESCE((
      SELECT SUM(amount) FROM payments
      WHERE status = 'active' AND paid_on <= me.as_of
    ), 0) AS pending
  FROM month_ends me
)
SELECT as_of, pending FROM snapshots ORDER BY as_of;
-- → 6 rows, plotted as the sparkline points.

-- Step 2 — the rolling 3-month-avg comparison for the delta headline
WITH ordered AS (
  SELECT pending, ROW_NUMBER() OVER (ORDER BY as_of DESC) AS rn FROM snapshots
)
SELECT
  ROUND(
    (1 - (
      AVG(CASE WHEN rn <= 3 THEN pending END)::NUMERIC
      / NULLIF(AVG(CASE WHEN rn BETWEEN 4 AND 6 THEN pending END), 0)
    )) * 100,
    1
  ) AS pct_change
FROM ordered;
-- → positive means pending shrank (good); render ▼ N% in green.
-- → negative means pending grew (bad); render ▲ N% in red.
```

**Why simple mean and not median:** pending-dues data is bounded (can't go negative) and behaves smoothly within a single school's enrollment cycle. We don't expect wild outliers, so the median's robustness benefit doesn't pay off — and the mean is easier to explain to a non-technical user. If we later see one anomalous month skewing things, we can switch.

### D2b. The rupee-value ROI

The percentage tells the principal whether the trend is healthy. The rupee-value line tells her how much money the app has actually put in the school's account that wouldn't otherwise be there. Formula:

```
monthly_improvement (₹) = prior_3mo_avg_pending − recent_3mo_avg_pending
months_since_launch     = months between (app_launch_date) and (today)
value_recovered (₹)     = monthly_improvement × months_since_launch
```

For the May 2026 demo:
- Prior 3-month avg pending (Dec, Jan, Feb) = ₹14,833
- Recent 3-month avg pending (Mar, Apr, May) = ₹11,933
- Monthly improvement = ₹2,900
- Months since launch (assume Mar 1) = 3
- Value recovered ≈ ₹8,700

**Read this carefully:** the rupee number is cash-flow improvement vs the pre-app counterfactual, not "money saved from default." Most parents pay eventually; what the app changes is *when* they pay. Money that used to sit in pending for 4 weeks now sits in the school's account for those 4 weeks. Over time, that compounds into a real working-capital benefit.

**Don't claim more than you can defend.** Frame this as "≈ ₹X recovered" (with the ≈), not "X saved." If the principal asks how it's calculated, the tooltip on the line says it directly: "Monthly improvement × months since launch — cash that's already in the school's account vs the pre-app baseline."

**The store-and-compare problem:** for `months_since_launch` to be meaningful, the v1 build needs to know when the app launched. Solution: add an `app_launched_at` row to a tiny `settings` table when the production deploy goes out (or hardcode it in env). On the dashboard, render the rupee line only if `months_since_launch >= 2` — anything shorter than that is statistical noise.

**SQL for the rupee line:**

```sql
WITH ordered AS (
  SELECT pending, ROW_NUMBER() OVER (ORDER BY as_of DESC) AS rn FROM snapshots
),
deltas AS (
  SELECT
    AVG(CASE WHEN rn BETWEEN 4 AND 6 THEN pending END)::NUMERIC AS prior_avg,
    AVG(CASE WHEN rn <= 3 THEN pending END)::NUMERIC AS recent_avg
  FROM ordered
),
launch AS (
  SELECT value::DATE AS launched FROM settings WHERE key = 'app_launched_at'
)
SELECT
  ROUND((prior_avg - recent_avg) * EXTRACT(MONTH FROM AGE(CURRENT_DATE, launched))) AS value_recovered_inr,
  ROUND(prior_avg - recent_avg) AS monthly_improvement_inr,
  EXTRACT(MONTH FROM AGE(CURRENT_DATE, launched))::INT AS months_since_launch
FROM deltas, launch;
```

Render as: `≈ ₹{value_recovered} recovered since launch ({months_since_launch} months · ₹{monthly_improvement} / mo)`.

**Don't over-build this.** v1 ships with a static-looking sparkline that re-renders on data refresh. No tooltips, no hover states, no zoom.

### D3. Students with pending dues (collapsible, **open by default**)

Primary focus of the dashboard. Uses native `<details open class="collapsible">`.

**Summary line:** `Students with pending dues · ₹11,300` + chevron icon (rotates 180° when closed).

**Table columns:** `Student / Family · Class · Period · Action · Amount due`.

**Rows in v1 prototype (hardcoded):**

| Family | Class | Period | Amount |
|---|---|---|---|
| Zara Khan | Class 10 | Previous-session dues | ₹3,100 |
| Zara Khan | Class 10 | Apr 2026 (missed) | ₹1,500 |
| Zara Khan | Class 10 | May 2026 (missed) | ₹1,500 |
| Myra Patel | Class 10 | Previous-session dues | ₹1,500 |
| Myra Patel | Class 10 | May 2026 (missed) | ₹1,500 |
| Ishaan Mishra | Class 10 | Apr 2026 (missed) | ₹1,500 |
| Ishaan Mishra | Class 10 | May 2026 (partial — ₹800 paid) | ₹700 |

**Total pending row** at the bottom: `Total pending` (colspan=3) · `[📢 Notify all]` icon button · `₹11,300` (bold rose).

**Action column behaviour:**
- Each row has a small green outlined `💬` chat-bubble icon button (`.notify-btn`)
- Click → toast `WhatsApp reminder sent · {family} (v2 wires the real send)`
- `stopPropagation` — clicking icon does NOT trigger the row's jump-to-register

**Row click behaviour (anywhere except the icon):**
- `data-family` and `data-class` attributes on each `<tr class="dues-row">`
- Click → `jumpToFamilyInRegister(family, classId)`:
  1. If active class ≠ target class, call `switchClass(classId)`
  2. After 80ms, find the family row by matching `.family-name-primary` text
  3. Smooth-scroll Register screen into view
  4. After 550ms more, smooth-scroll the target row into view (centred)
  5. Call `highlightRow(row)` — adds `.row-highlight` class for ~2.6s
- Row highlight: amber `background-color: rgba(250, 204, 21, 0.55)` on each `<td>`, fades out over ~1.5s
- If family not found: toast `Family not found · {name}`

**Hover state on rows:** `background-color: #e2e8f0` (slate-200) so it's distinct from the slate-100 header. Row text deepens to slate-900.

**Notify all (the megaphone icon at the bottom):**
- Solid school-green gradient pill, 32×28px, icon-only (megaphone SVG `m3 11 18-5v12L3 14v-3z`)
- Hover scales 1.06 and deepens gradient
- Click → counts unique families across `.dues-row` elements → toast `WhatsApp reminders sent to {count} families (v2 wires the real send)`
- Tooltip: `Notify all families with pending dues (WhatsApp broadcast)`

### D4. Class-wise collections (collapsible, **closed by default**)

5-row table: Class 10 (live) + Classes 9, 8, 7, Nursery–6 (all v2 placeholder rows with `—` cells). Header `Class-wise collections (May 2026) · Class 10 live · other classes load in v2`. Closed by default to reduce noise.

### D5. Last 20 entries (collapsible, **closed by default**)

`<details class="collapsible">` containing a sticky-header table with columns `Family · For · Amount`. Hardcoded ~8 rows of recent payments. Opens on click for the principal to verify what was just recorded.

### D6. Default-state philosophy

The dashboard is principal's "what needs attention" view. The default is:
- **Students with pending dues** — OPEN (primary focus)
- **Class-wise collections** — CLOSED (mostly v2 placeholder)
- **Last 20 entries** — CLOSED (verification aid)

This keeps the screen short and focused; everything else is one click away.

---

## Data model (v1) — authoritative

Four tables. Source of truth for the schema; `Digital_Fees_Register_Technical_Spec.pdf` §3 mirrors this.

```
fee_structures (per-class catalogue, edited via Settings → Fee structure)
─────────────────────────────────────────────
id              uuid pk
class           text unique
monthly_fee     numeric
annual_fee      numeric
sep_exam_fee    numeric  default 400
feb_exam_fee    numeric  default 400
misc_fees       numeric  default 0

families (billing unit · class-agnostic)
─────────────────────────────────────────────
id                      uuid pk
phone                   text  nullable · 10-digit when present (CHECK phone IS NULL OR length(phone) = 10)
father_name             text  nullable
mother_name             text  nullable
address                 text  nullable
monthly_fee_override    numeric  nullable  ← recurring concession
p_dues_carryover        numeric  default 0
status                  text  'active'|'withdrawn'
created_at, updated_at
-- v1: at-least-one-parent CHECK deferred (family fields optional for now); re-enable later:
-- CHECK (father_name IS NOT NULL OR mother_name IS NOT NULL)

students (every individual student — primary + siblings)
─────────────────────────────────────────────
id              uuid pk
family_id       uuid fk → families.id (cascade)
name            text
class           text
roll_no         int   (per-class roll number)
status          text  'active'|'graduated'|'withdrawn'  default 'active'
created_at, updated_at
UNIQUE (class, roll_no)

payments (audit log · every cell entered)
─────────────────────────────────────────────
id              uuid pk
family_id       uuid fk → families.id
student_id      uuid fk → students.id  NULLABLE
period          text  'apr'|'may'|...|'sep_exam'|'pdues'
amount          numeric (CHECK amount >= 0)
paid_on         date
method          text  'cash'|'cheque'|'upi'|'bank'|null
notes           text  nullable
status          text  'active'|'void'
created_at      timestamptz
```

### Key derived values

**Family's expected Monthly anchor (computed live, never stored):**
```
COALESCE(
  families.monthly_fee_override,
  SUM over active students in this family:
    fee_structures[student.class].monthly_fee
)
```

**Family's Pending for a period (computed):**
```
expected_monthly = (formula above)
paid_for_period  = SUM(payments.amount) WHERE family_id = ? AND period = ?
pending          = MAX(0, expected_monthly - paid_for_period)
```

### Why `is_primary` is NOT in this schema

A family with students in multiple classes (e.g., Kabir in 10 + Naina in 7 + Aanya in 5) appears in *every* class register where it has a student. The "primary" of any register row is contextual — determined by the JOIN `students.class = currentClassBeingViewed`, not by a stored flag. This means graduation handling is automatic: set `students.status = 'graduated'` and the row simply stops appearing in that class register, while continuing to appear in any class registers where siblings are still active.

### Indexes worth creating on day 1

- `students(class)` — Register grid queries by class
- `students(family_id)` — sibling chip rendering
- `payments(family_id, period)` — Pending calculation
- `payments(paid_on)` — Today / MTD totals

### Deferred to v2 (do not implement now)

- `anchor_columns` + `family_anchor_values` — custom anchor types (v1 has 3 hardcoded)
- Sibling cross-class auto-link with fuzzy matching (see §17 of Screen 2)
- Year-end roll-over (uses `students.status='graduated'` flag at session boundary)
- Concession audit trail (`concessions` table tracking who/when/why)
- CSV / PDF / spreadsheet export from Total Transactions (removed from the v1 UI; deferred to v2)
- PEN format validation (column exists in v1 as free-text; format rules added when Principal confirms PEN spec)

### Promoted into v1 (was previously v2)

After the Principal's 1st review session (FB#7), per-student fee-head concessions move into v1:
- `students.monthly_fee_override INT NULL`
- `students.term_fees_override   INT NULL`
- `students.exam_fees_override   INT NULL`
- `students.concession_reason    VARCHAR(64) NULL`

These replace the family-level `monthly_fee_override` that used to live on `families`.

Also new in v1 from feedback session 1 (**all nullable in v1** — see the v1 field-requirements note under Screen 7; tighten to NOT NULL in a later iteration):
- `students.dob DATE NULL`
- `students.date_of_admission DATE NULL DEFAULT CURRENT_DATE`
- `students.aadhaar_no CHAR(12) NULL CHECK (aadhaar_no IS NULL OR aadhaar_no ~ '^[0-9]{12}$')`
- `students.pen VARCHAR(32) NULL`

---

## Implementation notes for Claude Code

1. **Read this document before writing any UI code.** Every behaviour described is required.
2. The current prototype lives in `Digital_Fees_Register_UI_Mockup.html` in the same folder. **Reference it for exact CSS values, spacing, and visual treatments.** Treat the prototype as the authoritative pixel-level reference; this document as the authoritative behavioural reference.
3. **Tech stack target**: Next.js 15 + TypeScript + Tailwind + shadcn/ui (UI) · Supabase Postgres + Auth + Realtime (persistence) · Dexie + IndexedDB (offline-first writes). See `Digital_Fees_Register_Technical_Spec.pdf` for architecture + data model.
4. **v1 scope is Class 10 only, digital register only** (no PDF / WhatsApp / Print / Email send). See `Digital_Fees_Register_Product_Spec.pdf`.
5. **Numeric inputs everywhere**: payment cells, modal Expected, modal Amount paid, profile Phone. No non-numeric characters accepted via the `attachNumericInput` / `attachPhoneInput` helpers in the prototype JS. Phone is hard-capped at 10 digits.
6. **State persistence is critical**: Class switches must round-trip without losing payment edits, row additions, deletions, withdrawn states, anchor column changes, or profile data. Use the per-class snapshot pattern.
7. **Sticky positioning quirks**: Use `border-collapse: separate; border-spacing: 0` on the register table. The collapsed-borders mode silently breaks z-index on table cells across all major browsers.

---

## Screen 6 — Total Transactions (FB#6)

A **record of money already collected** — and how it came in (cash in hand vs. UPI / online to the bank) — to help the Principal plan expenditure and hiring. Past-looking by design; the forward-looking Expected / Outstanding view lives on the Dashboard.

### Access points (two ways in)

1. **Settings popover → Total transactions** — available from any screen with a ⚙ Settings button.
2. **Dashboard → Last 20 entries → "View all transactions" icon** — small outlined indigo button in the section's summary bar (next to the chevron).

Both routes scroll to `#screen-total-tx`. A **Back to Dashboard** button on the screen returns to Screen 4.

### Layout, top to bottom

1. **Top bar**: Back-to-Dashboard button · screen title · Sign out. (No Export button — spreadsheet/CSV export is deferred to v2 and was removed from the v1 UI.)
2. **Filter bar** (chips on left, secondary filters on right):
   - **Window chips** — single-select, default **This month**: `All time`, `This year`, `This month`, `Custom`. Selecting **Custom** reveals an inline from/to date picker directly beside the chip, on the same row (no separate row, no "Apply" button, no "Showing…" caption). The KPI tiles re-apply automatically as either date changes; an invalid range (from > to) is rejected with a warn toast.
   - **Secondary filters** (compose with the window chip): Class dropdown, Fee head dropdown, Search by student name. All filters apply to the table; the KPI tiles reflect the window chip only.
3. **KPI tiles** (3-up, equal-height cards). **Cash + UPI always sum exactly to Total Collected** — the two method tiles are a breakdown of the headline, never separate buckets:
   - 💰 **Total Collected** — sum of `payments.amount` for the window. Green value. Sub-line "<window> · N payments".
   - 💵 **Cash payments** — sum of `payments.amount WHERE method='Cash'` for the window. Amber value. Sub-line "N payments · in hand".
   - 📲 **UPI / Online** — sum of `payments.amount WHERE method='UPI'` for the window. Blue value. Sub-line "N payments · to bank".
   - **Why this set:** this page is about money already collected, so it does NOT repeat the Dashboard's forward-looking Expected / Outstanding. The cash-vs-online split tells the Principal how much is physically in hand vs. in the bank — directly useful for planning spend.
4. **Transactions table** — columns: Date · Student · Class · Family · Fee head · For (period) · Amount · Method · Notes. Default sort: Date desc.
5. **Summary footer** — `N records · sorted by date desc` (left) and `Window total: ₹X` (right).

### Behavioural contract

- Filter chips are visual-toggle + recompute KPIs from a window-keyed lookup. In the prototype this is mocked via `TX_WINDOWS`; in v1 the actual SQL runs `SUM(payments.amount) WHERE paid_at BETWEEN ?`, plus the same SUM partitioned by `method` for the Cash and UPI tiles.
- **Tile invariant:** Cash total + UPI/Online total = Total Collected, in every window (including a custom date range). If a third method is ever introduced, fold it into the right tile or widen the breakdown — never let the two sub-tiles drift from the headline.
- Secondary filters compose: class + fee head + search all narrow the row set.
- Search compares uppercase substrings against the Student column (consistent with FB#1 — all names are uppercase).
- Collected totals reflect actual recorded payments regardless of current enrolment status, so withdrawn students still count toward the window they paid in.
- Realtime: subscribe to `payments` so new rows appear without a manual refresh, consistent with Register and Dashboard.

### Open questions for the Principal (logged in `feedback_session_1.md`)

- Session year bounds for the "This year" chip (recommend April → March).
- Whether the Cash / UPI split should later break out additional methods (e.g. cheque, bank transfer) as the school adopts them, or keep folding them into "UPI / Online".

---

## §17 — Feedback Session 1 (Principal review, 2026-05-16)

All seven items from the principal's first review are accounted for below. Detailed rationale and open questions live in `feedback_session_1.md` (companion file).

### FB#1 — All names UPPERCASE everywhere

- **Where:** every name field in the UI (student name, parent names, sibling rep, dashboard pending list, payment modal, profile modal, fee-structure page, Last 20 entries, Total Transactions table).
- **How:** dual enforcement.
  - **CSS** rule applied to all name surfaces: `text-transform: uppercase` on inputs (`#profile-name`, `#profile-father`, `#profile-mother`, `.sibling-name`) and rendered cells (`.family-name-primary`, `.sibling-chip`, `.recent-entries-table td:nth-child(1)`, `.total-tx-table td.tx-student`, etc.).
  - **JS** `attachUppercaseInput(input)` helper enforces the actual VALUE — so when JS later reads `input.value`, toasts, dataset writes, mock data, DB inserts, and search filters all see the uppercase string. Wired to all name inputs in `openProfileModal()` plus event-delegated handler on `#profile-siblings` for dynamically-created sibling rows.
- **Persistence:** the API/DB layer should also normalise to uppercase on write as defense-in-depth, so pasted/imported data renders correctly.

### FB#2 — Student profile must capture DOB + Date of Admission

- **DOB** — native `<input type="date">`. **Optional in v1** (originally required; relaxed — see the v1 field-requirements note under Screen 7).
- **Date of Admission** — native `<input type="date">`, optional in v1; still **defaults to today** when the modal opens for a new student. Today's date is recomputed each modal-open via `new Date().toISOString().slice(0, 10)`.
- **Validation order (Save) — v1:** name (required) → phone (10 digits, only if entered) → Aadhaar (12 digits, only if entered). The DOB / admission / at-least-one-parent checks are suspended in v1 and return in a later iteration. Each failure fires a `toast(msg, 'warn')`.
- **Schema additions (v1, nullable):** `students.dob DATE NULL` and `students.date_of_admission DATE NULL DEFAULT CURRENT_DATE`.

### FB#3 — Student profile must capture Aadhaar + PEN

- **Aadhaar** — 12-digit numeric, **optional in v1** (originally mandatory; relaxed — see the v1 field-requirements note under Screen 7). Input formatted on the fly as `XXXX XXXX XXXX` for readability (via `attachAadhaarInput`); the raw 12-digit string is stored in `input.dataset.rawAadhaar` and read on Save. JS rejects non-digit keypresses. Validation runs only when a value is entered — `aadhaar && aadhaar.length !== 12 → "Aadhaar must be 12 digits"`.
- **PEN (Personal Education Number)** — optional free-text. Schema column `students.pen VARCHAR(32) NULL`. No format validation for v1; the Principal will confirm spec in a later iteration.
- **Schema additions (v1, nullable):**
  - `students.aadhaar_no CHAR(12) NULL CHECK (aadhaar_no IS NULL OR aadhaar_no ~ '^[0-9]{12}$')`
  - `students.pen VARCHAR(32) NULL`

### FB#4 — Term Fees one-click paid mechanism

- **UI:** every T.Fees anchor cell (column index 3, `data-anchor-pos="2"`) renders a small round **✓ toggle** in the top-right corner, injected by `injectTermFeesToggles()` on initial load and after every tbody re-render (class switch, snapshot restore, anchor add/delete).
- **States:**
  - Unpaid (default): outlined muted ✓ (slate border, white background).
  - Paid: filled green ✓; the whole T.Fees cell turns light green (`.term-paid` class).
- **Click handler:** a **capture-phase** listener on `document` intercepts `.term-paid-toggle` clicks BEFORE the inline-edit bubble handler fires on the table — this is critical because the T.Fees cell is otherwise editable. The handler toggles the `.term-paid` class on the cell, then `stopPropagation()` so inline-edit doesn't kick in.
- **Pending column integration:** when a T.Fees cell is unpaid, its amount MUST roll into the rightmost Pending column total alongside P.Dues and unpaid monthly cells:
  ```
  Pending = P.Dues + Σ(unpaid months) + (T.Fees if !term_paid else 0)
  ```
  The prototype does the visual toggle only; the actual recalc lives in v1 build.
- **Persistence (recommended Option B from feedback_session_1.md):** mark term-fees paid by inserting a row in `payments` with `fee_head = 'Annual'` for that family + session year. Existence of that row drives the ✓ state. Toggling off deletes the row. Keeps the data model uniform with Tuition/Exam payments.
- **Edge case:** if T.Fees amount is edited while the ✓ is active, warn the user ("Term fees already marked paid — change anyway?") before updating the linked payment row.
- **"First month" question:** for a student admitted mid-session, "first month for term fees" should default to **April** (academic year start). Mid-session admissions can be handled by overriding via the student profile — open question logged in `feedback_session_1.md` Q1.

### FB#5 — Dashboard "Last 20 entries" column changes

- **Header rename:** `Family` → **`Student`**.
- **Column added:** **Date** (right-aligned, slate-500 muted, format `DD MMM`). Tooltip on hover shows the full timestamp (v1 build).
- **Row data:** one row per payment, attributed to a specific student (`payments.student_id → students.name`). Falls back to family primary if `student_id IS NULL`. Concession-waived rows still appear, rendered in muted italic with `₹0` and a "Waived" note in the "For" column.
- **"View all transactions" button:** in the summary bar, top-right (before the chevron). Outlined indigo, icon = ↗ arrow. Click navigates to Screen 6 (`scrollToScreen('screen-total-tx')`). Click event uses `stopPropagation()` so the `<details>` toggle doesn't fire.

### FB#6 — New Screen 6 "Total Transactions"

See dedicated section above. Key points:
- Renamed from "Detailed Transactions" → **"Total Transactions"**.
- A record of money already collected, with three KPI tiles — **Total Collected / Cash payments / UPI · Online** (Cash + UPI = Total Collected) — on top of a filterable table. It does NOT repeat the Dashboard's Expected / Outstanding.
- Reachable from two paths (Settings popover + Last 20 entries icon).
- Filter chips: All time / This year / This month (default) / Custom; selecting Custom reveals an inline from/to date range that auto-applies.
- No spreadsheet / CSV export in v1 — removed from the UI, deferred to v2.

### FB#7 — Sibling concession: per-student, per-fee-head overrides

This replaces the v0.7 `families.monthly_fee_override` design. Concessions are now student-level AND per-fee-head.

- **UI:** new collapsible **Concession** section at the bottom of the Student Profile modal (open by default if any override is set, closed otherwise). Three toggleable rows + a reason field:
  - ☐ Waive / override **monthly** fee — checkbox + amount input (₹0 = waived, any other amount = override).
  - ☐ Waive / override **term** fees — same pattern.
  - ☐ Waive / override **exam** fees — same pattern (covers Sep + Feb).
  - Reason for concession — optional free-text (e.g. "3rd sibling", "Staff child").
- **Toggle behaviour:** checking the box enables its amount input and pre-fills `0` (= waived). Unchecking clears the value. JS rejects non-digit keypresses on amount fields.
- **Schema (replaces `families.monthly_fee_override`):**
  - `students.monthly_fee_override INT NULL` — NULL = use class default; 0 = free; X = custom.
  - `students.term_fees_override INT NULL` — same semantics.
  - `students.exam_fees_override INT NULL` — same semantics.
  - `students.concession_reason VARCHAR(64) NULL` — free-text reason.
- **Register grid behaviour:**
  - Family rows with any active override get a small **"Concession"** chip next to the family name (`.concession-chip`, green pill).
  - Monthly anchor cell renders the override value. If `0`, the cell gets `.waived` class (soft green background, italic-ish styling, no click-to-edit) and tooltip "Waived (3rd sibling)".
  - T.Fees anchor cell behaves the same way for `term_fees_override`. `0` automatically applies `.term-paid` so the cell visually reads "paid/waived" and the ✓ toggle is hidden.
  - Pending column **excludes** waived heads — don't roll ₹0 into the outstanding sum.
- **Expected / pending impact:** Expected and pending calculations (Dashboard tiles + Register Pending column) must respect overrides student-by-student; waived heads contribute 0. (Total Transactions itself shows only money actually collected — Cash + UPI — so concession overrides don't change its tiles.)
- **Worked example** (verified during principal review):
  - Family Kabir + Naina + Aanya, all three children.
  - Kabir (Class 10): all overrides NULL → uses defaults (₹1,500 monthly, ₹1,500 term).
  - Naina (Class 7): all overrides NULL → uses Class 7 defaults (₹1,400 monthly, ₹1,500 term).
  - Aanya (Class 5): `monthly_fee_override = 0` → row renders ₹0 in muted-green for every month. `term_fees_override` left NULL initially — Principal decides per case.
- **Migration:** any existing `families.monthly_fee_override` data should be migrated onto the youngest sibling's `students.monthly_fee_override` at v1 build time, then the `families` column dropped.

### Implementation note for FB#1 + FB#7 — UPPERCASE on dynamic content

When the saveProfile() handler in the prototype writes the family name back into the register row, the name is uppercased (`.toUpperCase()`) before being written into the DOM. Real backend writes (Supabase inserts) should do the same. Don't rely on CSS alone — it only affects display, not the stored value.

---

---

## §18 — Sibling profile pre-population (FB session 2)

Each student has their **own profile**, but every student is linked to a **family unit** via `family_id`. Some fields are *family-shared* and should auto-populate across all siblings; the rest are *student-specific* and stay independent.

### Fields, classified

**Family-shared** — when set on any sibling, the value propagates to every other student in the same family. Editing one sibling's value updates the family's value for all of them.

- `families.father_name`
- `families.mother_name`
- `families.phone` (the family contact phone, hard-capped at 10 digits)
- `families.address`
- (Future) bank info, emergency contact, locality PIN — out of v1 scope

**Student-specific** — independent per student, never shared:

- `students.name` (full name, uppercase)
- `students.class`
- `students.dob`
- `students.date_of_admission`
- `students.aadhaar_no` (each person has their own 12-digit Aadhaar)
- `students.pen` (Personal Education Number is per-student by definition)
- `students.monthly_fee_override` / `term_fees_override` / `exam_fees_override` / `concession_reason`
- `students.roll_no` (scoped per-class)
- `students.status` (active / graduated / withdrawn)

### Behaviour when adding a sibling

The Student Profile dialog has a **"Siblings also enrolled in this school"** section. The principal can add a sibling by typing first name + class. On Save:

1. The current student is upserted into `students` (linked to family via `family_id`).
2. **For each new sibling listed**: create a `students` row with the typed name + class + `family_id = current family`. Their `dob / aadhaar / pen / overrides / roll_no` start empty.
3. The new sibling row appears in their class's register with the family's primary name shown in their own row's name cell, plus chips for every other sibling in the same family (`students.family_id` JOIN).

### Behaviour when opening a sibling's profile later

When the principal clicks `✏` on a sibling's row (or navigates to it by clicking a chip on the original student's row):

1. `students` row is loaded for that specific student → `name / class / dob / doa / aadhaar / pen / overrides / reason` come from `students`.
2. `families` row is loaded for that student's `family_id` → `father_name / mother_name / phone / address` are **pre-populated** (read-only-feeling but editable; edits write back to `families` and propagate).
3. Sibling chip list comes from `SELECT * FROM students WHERE family_id = ? AND id <> currentStudentId AND status='active'`.

### Edit propagation

- Editing **father name / mother name / phone / address** on any sibling's profile updates the **families** row → next time you open any other sibling, the new value is already there.
- Editing **name / DOB / Aadhaar / PEN / concession** never propagates — those are per-student.
- The prototype HTML does NOT implement the live propagation (FAMILY_PROFILES is keyed by family name, not family_id). The v1 build must implement it correctly via `family_id` JOINs.

### Why this matters

The principal explicitly called this out in the wrap-up: typing the same father/mother name + phone three times for three siblings is wasted effort. Auto-population saves time and reduces typos (e.g. "RAJEEV KUMAR" vs "RAJIV KUMAR" for the same parent).

---

## §19 — Session-2 feedback consolidated

All principal-review items captured after `feedback_session_1.md`, in one place.

### §19.1 — Per-student fees (each row = one student's fees only)

Every cell on a row — `P.Dues`, `T.Fees`, `Monthly`, every month cell, every exam cell — represents the **contextual student in that class**, never the family sum. So:

- Kabir's row in Class 10 → `T.Fees ₹1,500`, `Monthly ₹1,500` (Class 10 default).
- Naina's row in Class 7 → `T.Fees ₹1,500`, `Monthly ₹1,400` (Class 7 default).
- Aanya's row in Class 5, 3rd-sibling concession → `Monthly ₹0` (waived), `T.Fees` per principal's case-by-case decision.

Editing a cell or applying a concession from a row's profile dialog affects **only that student**.

Implementation: query `payments / students / fee_structures` with `WHERE students.id = currentStudentId` not `WHERE family_id = ?`.

### §19.2 — Sibling chips are clickable

Sibling chips on a row (`NAINA · VII`, `AANYA · V`) are **clickable**. Click:

1. `e.stopPropagation()` so the parent cell's inline-edit handler does NOT fire.
2. Parse chip text → first-name + roman-class.
3. Resolve `Class X` to `class_id` via `chipLabelToClass()`.
4. If the destination class is not the active class, call `switchClass(targetId)` — this re-renders the tbody for that class.
5. After a short delay (80ms), find the row whose primary-name's first word **case-insensitively** matches the chip's first name.
6. Scroll the Register screen into view → scroll the matched row into the centre → apply the `.row-highlight` flash (~2.5s yellow fade).

**Critical bug fix from the session:** the match must be **case-insensitive**. Class 10 mock rows are uppercase in static HTML; Classes 5/7/8 are built at runtime from `CLASS_MOCK_DATA` in title-case (CSS only displays them uppercase). Normalize both sides via `.toUpperCase()` before comparing.

The chip has a `cursor: pointer` and an emerald-tinted hover state so it visibly invites clicking.

### §19.3 — Top-bar consistency across the three "main" screens

Every "main" page has **exactly 3 buttons** in the top bar, with Sign out always on the right:

- **Screen 2 — Register**: `📊 Dashboard` (green pill) · `⚙ Settings` · `Sign out`
- **Screen 3 — Dashboard**: `📓 Open class register` (green pill) · `↻ Refresh` · `Sign out`
- **Screen 4 — Total Transactions**: `📊 Back to dashboard` (green pill) · `Export Spreadsheet` · `Sign out`

The leftmost button is the green-gradient "primary action" pill (the principal's main path back to the most-used screen). Refresh / Export / Settings are slate utility buttons. Sign out is the rightmost slate button.

### §19.4 — Final screen order (locked)

```
1. Login
2. Register
3. Dashboard
4. Total Transactions
5. Receipt (record-payment modal demo + ⋯ functional modal documentation)
6. Fee Structure
7. Student Profile
```

The top nav links and the `Screen N of 7` chip on each screen reflect this order. Scrolling top-to-bottom moves through them in this order.

### §19.5 — Draft new-row flow

Clicking **+ New entry** on Screen 2 no longer creates an inline-edit row. Instead:

1. Append an empty placeholder row at the bottom of the active class's table. The name cell shows "New student…" in muted slate-italic until the principal types.
2. Open the Student Profile dialog in **draft mode** (`profileModalIsNew = true`).
3. As the principal types in the dialog's name field, the placeholder row's `.family-name-primary` updates **live** in the background (auto-uppercased).
4. On **Save**: the row is committed with all the profile/sibling/concession data; `profileModalIsNew` flag is cleared.
5. On **Cancel / × / Esc / backdrop click**: the draft row is removed entirely with a "Cancelled · row removed" toast.

This avoids the principal having to context-switch between the inline-edit input and the profile-modal fields — everything is captured in one flow.

### §19.6 — Green-theme color consistency

The mockup uses **three colours only** for status:

- **Green** (`#15803d` / `#dcfce7`) — paid, primary actions, success, hover-emphasis.
- **Red** (`#991b1b` / `#fee2e2`) — outstanding dues, errors.
- **Slate / black** (`#0f172a` / `#475569`) — neutral text, anchor reference values, expected amounts.

All previously-indigo elements have been swapped to green:
- Sign in button (Screen 1)
- Save button on Record-payment modal (Screen 5) + functional modal
- Payment-method chips active state (`💵 Cash` etc.)
- Form input focus border + ring (replaced browser-default blue)
- "Dashboard" + "Back to dashboard" pills on Screens 2 + 4
- Sibling chip hover state

The Expected KPI tile on Screen 4 is **black** (`#0f172a`), not blue — to avoid colour clutter beyond green / red / slate.

### §19.7 — Screen 4 (Total Transactions) layout

Order is **KPI tiles → filter bar → table** (KPIs are the primary read; filter bar narrows the table below). Emoji icons removed from KPI labels for a professional feel — labels read `Collected`, `Expected`, `Outstanding`. The amber "Changes apply to families…" warning was removed from Screen 6 (Fee Structure) for the same reason.

### §19.8 — Student profile lightness

Three changes to keep the profile dialog from feeling heavy:

- Address textarea has no placeholder text.
- Concession section opens **collapsed** by default (always). The principal expands it only when applying a waiver / override.
- Reason-for-concession field is empty by default — no example pre-filled.

---

## §20 — Updated 7-day Build Timeline (v1)

Hard scope: Class 10 only · digital register only · Admin role only · web PWA. Other classes appear read-only as demo data. No PDF / WhatsApp / Print / Email send — those ship in v1.1+.

| Day | Phase | Deliverables | Validation |
|---|---|---|---|
| **D1** | **Foundations** | Next.js 15 + TypeScript + Tailwind + shadcn project boot · Supabase project + Auth · 4-table schema (`families`, `students`, `payments`, `fee_structures`) + indexes per §3 of this doc + addendum · Seed script that loads Class 10's current 28 students from the principal's paper register · Login screen with Supabase Auth | Sign in works · DB tables exist · seed students visible via SQL |
| **D2** | **Register grid — read path** | Screen 2 layout (sticky columns Roll/Name/P.Dues/T.Fees/Monthly + Pending right-sticky) · CLASS_MOCK_DATA replaced by real Supabase query · Sibling chips render from `family_id` JOIN · Per-student fee values reflect `students.*_override` falling back to `fee_structures` per class | Class 10 register matches the paper register row-for-row · Sibling chips show right names + class · Aanya-style waiver renders ₹0 muted-green |
| **D3** | **Register grid — write path** | Inline cell edit (Enter to commit, Esc to discard, blur=cancel) · Payment insert into `payments` · Live recompute of Pending column from P.Dues + unpaid months + (T.Fees if no Annual payment for current session-year) · Term-fees ✓ toggle = insert/delete an `Annual` payment row · Today + MTD totals on top bar update on each payment | Pay a month → cell turns green · Toggle ✓ → cell turns light-green · Pending recomputes correctly · Refresh page → state survives |
| **D4** | **Student profile + + New entry draft flow** | Profile modal with all FB#1–FB#7 fields · DOB + Date of Admission (defaults today) · Aadhaar formatted XXXX XXXX XXXX (raw 12-digit storage) · PEN optional · Concession section per fee-head · Live-uppercase on name inputs · **Draft new-row flow** (§19.5): + New entry creates empty row + opens dialog · Cancel removes row, Save commits · **Sibling auto-population** (§18): family-shared fields propagate via `families` row on Save · Sibling chips clickable (§19.2) with row-highlight flash | Create a 3-sibling family in one flow · Re-open the youngest sibling's profile → parent names + phone + address pre-filled · Chip-click navigates + highlights |
| **D5** | **Dashboard (Screen 3)** | KPI cards (Collected today / MTD / Total pending) · Pending dues list (`payments.amount = 0` derivation) · Class-wise collections collapsible · Last 20 entries with Student/For/Amount/Date columns · "Open class register" + "View all transactions" navigation · Top bar: 3 buttons with Sign out · Realtime subscription on `payments` so dashboard live-updates | Pay on Register → MTD card updates within a second on dashboard · Click pending row → jump to Register with row highlighted |
| **D6** | **Total Transactions (Screen 4) + Fee Structure (Screen 6)** | Total Transactions: KPI tiles (Collected / Expected / Outstanding for selected window) · Filter chips (All time / This year / This month / Custom date-range) · Composing secondary filters (Class / Fee head / Search) · Live `payments` table with all columns + Realtime · Settings popover with Edit fee structure + Total transactions menu items · Fee Structure modal: per-class monthly / annual / Sep exam / Feb exam / misc · Updates write to `fee_structures` (history preserved on `payments`) | Window switch recomputes KPIs · Filter combination narrows table · Edit Class 10 monthly → Class 10 register reflects new default for non-override students |
| **D7** | **Polish, validation, and demo** | Validation order per §17 (name → parent → DOB → DoA → phone → Aadhaar) with toast errors · All names UPPERCASE everywhere (CSS + JS + server-side normalization) · Theme audit: zero indigo anywhere · Empty / error / loading states for every screen · PWA install banner on mobile · Smoke-test script covering: create → pay → refresh → toggle term ✓ → apply concession → check Pending math · Hand over to principal for live test | Principal can open on her phone + laptop · Creates 3 students live · No errors in console · Pending math matches her paper register exactly |

**Day-1 dependencies before coding starts**:
- Supabase project created (free tier) + URL + anon key in `.env.local`.
- Vercel project linked (free tier).
- Principal's full Class 10 roster as CSV: Name | Father | Mother | Phone | Aadhaar (if available) | DOB | DoA. (Can be 28 rows in a Google Sheet.)
- The four `*.md` / `*.pdf` / `*.html` files in this folder copied into the repo as `docs/`.

**Cut lines** (don't build these in v1 even if they look small):
- Multi-class register switching for non-mock classes — read-only previews are fine.
- CSV export from Total Transactions — button exists, returns "v2 feature" toast.
- Custom date-range picker on Total Transactions — chip exists, opens "Coming in v1.1" toast.
- Audit log of profile edits — schema column reserved, UI deferred.

---

## §21 — Build sequence + handoff checklist

**Before writing any code, in order:**

1. ☐ Read this file top to bottom (single source of truth).
2. ☐ Read `Digital_Fees_Register_Technical_Spec.pdf` §3 + §4 (schema, validation, invariants).
3. ☐ Open `Digital_Fees_Register_UI_Mockup.html` in a browser — click through every screen, every modal, every chip. Make notes.
4. ☐ Confirm with Piyush: Supabase project URL, anon key, Vercel project, roster CSV.
5. ☐ Boot the Next.js project, install shadcn, install Supabase JS, install Dexie (for offline writes).
6. ☐ Apply the four-table schema + indexes + seed script.
7. ☐ Build screen by screen following §20.

**Coding conventions (mirror what the mockup demonstrates):**

- All money values stored as `INT` rupees (no decimals — Indian school fees are whole-rupee amounts).
- All names normalised to uppercase before insert (`name = name.toUpperCase().trim()`).
- Aadhaar persisted as raw 12-digit string; formatted only for display.
- Dates stored as ISO `YYYY-MM-DD`; the prototype's `attachUppercaseInput`, `attachPhoneInput`, `attachAadhaarInput` patterns map directly to controlled-input handlers in React.
- Sticky-column technique from the mockup HTML (`border-collapse: separate`, `data-anchor-pos` attribute, `box-sizing: border-box`) is verified across Chrome / Safari / Firefox — copy it verbatim.

**What "done" looks like**:

- The principal can open the app on her phone (PWA install) and laptop, sign in, see Class 10 with all 28 students, record a payment in under 5 seconds per child, and see Today's and MTD totals update live on the dashboard. Term-fees ✓ works. Concession waiver works. Sibling auto-link works. Total Transactions shows the current month's Collected vs Expected vs Outstanding correctly. No crashes. No console errors. Zero indigo or unexpected colours.

---

## §22 — Linking flows (Session 3 wrap-up · 2026-05-17)

This section captures everything decided in the third review session. It supersedes §18 and §19 wherever they conflict.

### Two entry points, one mechanism

A student gets attached to a family through exactly one mechanism: the cyan **"Already in the system?"** search bar at the top of the Student Profile dialog. This bar accepts father name, mother name, OR 10-digit phone (substring match, case-insensitive, 2+ characters required) and shows suggestions as cards with all three identifiers + the enrolled children. Clicking a suggestion attaches the family and locks the four family fields (father, mother, phone, address) with an inherited-read-only style.

The search bar appears whenever a profile has no family linked yet — both for new entries (Entry Point B) and for existing students whose `family_id` is null (Entry Point A re-link). When a family IS linked, the search bar is replaced by the inherited family fields — father / mother / phone / address shown read-only with the "FAMILY" inherited style — and the **Unlink** action sits inline in the FAMILY column section title. (Design note, 2026-06-03 / Day 7c: this replaced the earlier green "Linked to existing family" banner + red Unlink button; the inline Unlink in the Family header is the current implementation and behaviour is unchanged.)

The old "+ Link existing student" class+roll picker dialog has been retired. The reasoning is in the conversation log: the family-search bar already covers every realistic case, and the picker introduced confusion about what "linking" meant.

### Adding new siblings

The green **"+ Add new sibling"** button under the sibling list opens a compact mini-dialog. It inherits family info from the parent profile (shown in an "Inheriting from family" banner) and asks only for per-student fields: name, class (with auto-assigned roll), DOB, DoA, Aadhaar, PEN. Roll number is always auto-assigned to the next available in the chosen class — there is no Roll No input. On save, the new sibling is inserted as a row in the active class register at the bottom (smooth-scroll + flash highlight), and sibling chips on every related row refresh automatically.

### Sibling list inside the profile dialog

The "Siblings also enrolled" list is now **read-only**. Each sibling renders as a card with `NAME · Class · → Open profile`. There is no × button. To unlink a specific sibling from this family, the principal opens THAT sibling's profile and clicks the inline **Unlink** action in the FAMILY column title there. This keeps the unlink action in exactly one place and avoids the destructive × that previously created orphan registry entries.

### How "Unlink" actually works

Clicking the inline **Unlink** action in the FAMILY column title:

- Sets the current student's `family_id` to `null` in `__STUDENTS` (in real v1: an UPDATE on `students.family_id`)
- Keeps the family field values populated and editable so the principal can save them as a personal family record if they want
- Clears the inline sibling list (those siblings are no longer relevant to this student)
- Refreshes sibling chips on every other family member's register row so this student disappears off their chips
- For a draft Entry Point B student, additionally clears the family fields and shows the cyan search bar again so the principal can pick a different family

### Profile dialog layout

The dialog now has a two-column layout below the student name:

- **Left column — FAMILY · SHARED ACROSS SIBLINGS:** father name, mother name, phone, address. When inherited, these get a slate-grey background and a small "FAMILY" chip on each label.
- **Right column — STUDENT DETAILS:** class, DOB, DoA, Aadhaar, PEN. Per-student, never inherited.

Modal card widened to 920px to give breathing room. Collapses to a single column on viewports below 720px.

### Pre-seeded data the prototype uses (v1 build can replace with real data)

- Class 10 register has rolls 1–9: AARAV SHARMA, DIYA VERMA, ISHAAN MISHRA, KABIR KUMAR, MYRA PATEL, NEEL GUPTA, PARI JOSHI, ZARA KHAN, VIHAAN RAO
- Six seeded families: Kumar (KABIR / NAINA / AANYA), Verma (DIYA / KAVYA), Gupta (NEEL / PARAM), plus singleton families for SHARMA, PATEL, MISHRA, JOSHI, KHAN, RAO
- All 9 visible students have placeholder DOB / DoA / 12-digit Aadhaar / optional PEN so the principal can link siblings without re-filling fields (note: in v1 these fields are optional anyway — see the v1 field-requirements note under Screen 7)

### Register screen — permanent horizontal scrollbar

The Apr → Mar months strip now has a thick, always-visible green horizontal scrollbar (not hover-revealed). The Principal sees the scroll affordance immediately and knows months continue off-screen to the right.

### Data-layer mapping for the v1 build

The prototype's in-memory `__STUDENTS` map (`{ class, roll, family_id }` keyed by uppercase name) maps to the real `students` table with the same fields. The prototype's `__FAMILIES` map maps to the `families` table. Sibling lookups (`__siblingsOf`) become `SELECT * FROM students WHERE family_id = $1 AND id != $2`. The "next roll" auto-assignment (`__nextRollFor`) becomes `SELECT COALESCE(MAX(roll_no), 0) + 1 FROM students WHERE class = $1`.

The chip-text-derived sibling list that caused the duplication bug in the prototype has been retired entirely — both `openProfileModal` and `saveProfile` now read siblings from the registry directly. Implement the same way in v1: never parse the visual chip text to reconstruct siblings.

---

*Last updated: 2026-05-17 (Session 3 wrap-up). Mockup version v1.0 — build-ready. All Principal feedback through Session 3 reflected. Mockup source: `Digital_Fees_Register_UI_Mockup.html`. Schema authority: `Digital_Fees_Register_Technical_Spec.pdf` v1.0 (addendum has been folded into §3 / §4 and archived). Linking flows: see §22.*

---

## §24 — Build addendum: shipped post-mockup changes (2026-06-03)

The HTML mockup (`Digital_Fees_Register_UI_Mockup.html`) predates the items below. Until the mockup is regenerated, **fidelity audits compare against the mockup PLUS this section.** These changes were demo-driven (Phase 6A two-environment plan); Principal feedback may revise them.

1. **Multi-class register is live.** Canonical class set lives in `lib/classes.ts` ("Nursery","LKG","UKG","1"…"10") and is the single owner used by the URL (`?class=`), the picker, the DB `class` columns, the RPC, and all dialogs. The class picker navigates between all 13 classes (status pills removed — everything is live); the Fee Structure modal edits any class; "+ New entry" defaults to the class being viewed.
2. **Sibling chips navigate.** Clicking a chip goes to `/register?class=<sibling class>&highlight=<sibling id>` and the §D3 amber flash (~2.6s) runs on arrival. Chip visuals unchanged.
3. **Dynamic dates.** "Today" and the MTD window/label derive from the real current date (Asia/Kolkata) via `lib/today.ts` — register totals, grid past/current/future month states, dashboard metrics, and the Transactions "This month"/"This year" windows. (Replaces the prototype's pinned 2026-05-26.)
4. **P.Dues "mark paid" ✓ toggle** (new, mirrors the T.Fees chip). Shown when a family has carry-forward dues: unpaid → red cell "₹remaining" + outline ✓; click records a family-scoped P.Dues payment (period '2025-26') for the exact remaining; settled → green cell that KEEPS showing the amount + solid ✓; click again voids (toggle-off). Partial P.Dues via the ⋯ modal still nets. The inline edit of the carry-forward value is unchanged (chip and cell body are separate click targets). Offline-aware through the outbox.
5. **Dashboard is fully multi-class.** Class-wise collections renders one real row per class (Expected / Collected / Outstanding / %; no "live"/"v2" placeholders); tiles, sparkline, ROI and the pending-dues table are school-wide; family-scoped payments attribute to the family's primary class. "Students with pending dues" gained a filter bar (dues chips All / ₹1,000+ / ₹5,000+ · class dropdown · name search; the Notify-all megaphone targets the filtered set).
6. **Offline-first layer (Day 7 — not in the mockup).** Durable Dexie outbox for every write; sync badge in the nav (green = synced, amber = pending, red = failed/stale >2h; collapses to a dot ≤640px); clicking the badge opens an "unsynced changes" panel (per-entry Retry + Discard-with-confirm, Retry-all). Offline edits render immediately; offline-created students appear as synthetic rows (amber row tint + "PENDING SYNC" chip) and accept payments against temp ids that remap on sync; edited cells carry a small amber dot until synced; the screen auto-refreshes after background sync (no manual reload; no flicker via a recently-synced hand-off).
7. **§22 design evolution (also noted in §22):** the green "Linked to existing family" banner was replaced by an inline **Unlink** in the FAMILY column title.
8. **Transactions:** the Class filter offers all canonical classes (default Class 10).
9. **Hardening:** security headers (Referrer-Policy, X-Content-Type-Options, X-Frame-Options, Permissions-Policy) on all responses; sibling-chip accessible names match their visible text (a11y 100). Enforced CSP and the service-worker offline app-shell are deferred to v1.1.
