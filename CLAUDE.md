# Digital Fees Register — project context for Claude Code

A mobile-first PWA for a small school to record fee payments, replacing a paper
register. Single admin user (the Principal). This is v1.

## Source of truth (read the relevant section before building anything)
- Docs/Mockup/Mockup_User_Functionality.md — behaviour, screen by screen. The canonical reference.
- Docs/Product_Technical_Spec/Digital_Fees_Register_Technical_Spec.pdf — schema, validation rules, scope.
- Docs/Mockup/Digital_Fees_Register_UI_Mockup.html — exact visual + interaction reference.

## Stack
Next.js 15 (App Router, TypeScript) · Tailwind CSS · shadcn/ui · Supabase
(Postgres + Auth + Realtime) · Dexie (offline-first IndexedDB) · deploy to Vercel.
The Next.js app lives at the REPO ROOT (not in a subfolder).

## v1 scope — what's IN
Digital register only: record/edit payments, students, families, fee structure;
dashboard; total transactions. Class 10 only. There is NO standalone receipt
screen in v1 — confirming a payment landed is covered by the on-screen
record-payment modal (the ⋯ escape hatch) and the read-only Total Transactions
view. The fee-structure editor opens as a modal from the Register page's
"⚙ Fee structure" button (there is no Settings page / nav home in v1).

## v1 scope — what's OUT (all v2 — do not build)
Receipt screen + receipt PDF generation, WhatsApp/print/email delivery,
sequential receipt numbers, online/UPI payment collection, spreadsheet export,
multi-class rollout, defaulter automation.

## Guardrails (non-negotiable)
- NEVER put a real school or client name, address, or other identifying detail
  in code, comments, commits, seed data, or UI copy. Use neutral placeholders.
- Only "Student name" and "Class" are mandatory. Every other profile field is
  optional / nullable in v1.
- Sibling lookup is ALWAYS via family_id joins — never parse rendered chip text
  (this was a prototype bug; see §22 of the functionality doc).
- Source of truth for every screen: the mockup HTML
  (Docs/Mockup/Digital_Fees_Register_UI_Mockup.html) for layout + visuals, and
  Docs/Mockup/Mockup_User_Functionality.md for behaviour. Before building OR
  changing any screen, re-read BOTH for that screen and match them exactly —
  not only visuals (font family, sizes, colours, spacing, gradients, borders)
  but the precise placement and behaviour of every control: which column an
  icon lives in, what each button / ⋯ / ✏ / ✗ does, and what opens each dialog.
  Do NOT relocate, rename, merge, or invent controls. (Real miss to avoid: the
  record-payment ⋯ belongs in each MONTH cell, not the student-name column.)
  Don't substitute "close enough" tokens — if the mockup uses
  `from-slate-50 to-indigo-50`, use that, not a palette swap. The Principal has
  spent real time tuning the mockup; deviations cost re-work. Skip only the
  mockup-walkthrough artefacts that obviously don't belong in the shipped app
  (e.g. "Screen N of 8" chips, scroll-nav links) — use judgement and call them
  out when you do.
- Palette: green / slate / amber / blue / black, plus indigo where the
  mockup uses it (backgrounds / soft gradients only). Do NOT introduce
  indigo for text colour, focus rings, or element borders/highlights — the
  mockup was deliberately cleaned of those uses and they shouldn't creep back.
- Names auto-uppercase as typed. Aadhaar displays as "XXXX XXXX XXXX".

## Database
Apply SQL changes by running:
`node --env-file=.env.db.local scripts/run-sql.mjs <file.sql>`
(reads `SUPABASE_DB_URL` from the gitignored `.env.db.local`). Do NOT ask me
to paste SQL into the Supabase dashboard. Never print, log, or commit the
connection string.

## Workflow
Build one screen at a time. Before building or changing a screen, re-read its
section in BOTH Docs/Mockup/Mockup_User_Functionality.md (behaviour) and
Docs/Mockup/Digital_Fees_Register_UI_Mockup.html (layout + exact control/dialog
placement), then match them. Stop and let me verify against the mockup before
moving on.

## Definition of Done — mockup-fidelity self-audit (mandatory)
A screen/feature is NOT done until you have self-audited it against the mockup
and reported the result. "Match the mockup" is a hard gate, not a nicety — the
burden of catching visual/layout deviations is YOURS, not mine. Before you say
a screen or fix is finished:
1. Walk its mockup section element by element and output a short ✓/✗ checklist —
   one line per control/element (each button, icon, ⋯ / ✏ / ✗, dialog, chip,
   column): does it exist, sit in the right column/place, and do exactly what
   the mockup + functionality doc say?
2. Mark each ✓ (matches) or ✗ (missing / moved / wrong behaviour, with a note).
3. Fix every ✗ before stopping. Don't report "done" with open ✗ items.
4. Prefer copying the mockup's DOM structure + CSS classes verbatim over
   reinventing them.
This lets me verify workflow + data instead of hunting for visual deviations.
