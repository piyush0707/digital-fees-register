# Digital Fees Register — portfolio snapshot

A working offline-first web app built for a real client — a school of ~250
students where fee payments are tracked in a paper register. Designed, built,
and shipped end to end by one person, from problem framing through demo.

> **Live demo:** https://fees-register-demo.vercel.app — synthetic data only.
> Message me for a guided walkthrough.

**Prefer pictures?** [Product walkthrough (PDF, 7 slides)](./Product_Walkthrough.pdf) — the register, offline sync, dashboard, and how it was built.

This repo is a **public portfolio snapshot** of a private working repo. Client
identity is anonymized as "Sample School" throughout; every name, phone, and
Aadhaar in the seed is synthetic. No credentials are present in this tree.

---

## The problem

Built for a single administrator — the school's Principal — used primarily
on a laptop. A phone-friendly view is on the roadmap.

The school of ~250 students collects monthly tuition, term/annual fees, two
exam fees, and prior-session carry-forward dues in a paper register that has
nine columns of math done by hand. A missed entry compounds across months;
a late parent is a phone call away; siblings span multiple classes;
concessions and waivers vary per student. The register is the source of
truth and the bottleneck.

## What this is

An offline-first replacement for that register — same nine-column mental model,
same row-per-student layout, every cell editable in one click. Built so the
Principal can keep working when the school's Wi-Fi drops and reconcile when it
comes back without ever losing a payment.

- **Register grid** — sticky Roll / Name / P.Dues / T.Fees / Monthly anchors;
  Apr-Mar months across the row; Sep + Feb exam columns; live Pending column;
  click-anywhere-to-edit; ⋯ escape-hatch opens a full payment modal.
- **Dashboard** — Collections (today / month-to-date), Total pending dues
  with a 6-month trend, return-on-investment delta (average pending versus
  prior 3-month average) + rupee value recovered since launch.
- **Total Transactions** — windowed by chip (All time / This year / This
  month / Custom), filtered by class + fee head + name; realtime via Supabase.
- **Student profile dialog** — family link / unlink, sibling chips (resolved
  by `family_id` join, never parsed from text), per-student concession
  overrides feeding the pending math.

## How it was built

1. **Product spec** — problem statement, primary user, scope, and the v1/v2
   line in a doc the Principal could read and react to.
2. **Tech spec** — schema, Row-Level Security posture, period conventions,
   enumerated values, and the architecture choices that bound the build
   (offline-first via Dexie, a single server-side function call for the
   register, Supabase Realtime on payments).
3. **Clickable mockup** — every screen, every dialog, every cell state wired
   by hand in plain markup and JavaScript. The Principal walked it before
   any code was written; feedback (sibling chips, concession scope, P.Dues
   toggle semantics) folded back into the spec.
4. **Build** — implementation phase by phase against the mockup; one screen
   at a time, audited against the mockup before moving on.
5. **Demo with synthetic data** — the live demo above; the Principal walked
   the full flow and round-2 feedback dropped in (Undo window, date-of-birth
   clamp, real fee ladder, dashboard trend story for pre-launch demos).
6. **Real data next** — seeding the production project from the school's
   roster spreadsheet is the final step before handoff.

Driven end to end by one product manager using Claude Cowork (product
strategy, specs, user-acceptance-test plans, code review) and Claude Code
(implementation).

## Architecture highlights

- **Next.js 15** App Router · TypeScript · Tailwind v4 · shadcn/ui.
- **Supabase** Postgres + Auth (cookie-based via `@supabase/ssr`) + Realtime
  on `payments`. Row-Level Security gates every table to authenticated users
  only; no anonymous read path. Database functions run with `SECURITY INVOKER`
  and grant `EXECUTE` only to authenticated users.
- **Single round-trip register payload** — a `register_payload(p_class)`
  Postgres function returns `{ students, families, siblings, payments,
  fee_structure }` in one round-trip; the dashboard inlines its metric
  computation rather than making an extra network call.
- **Offline-first writes** — every mutation flows through a Dexie outbox
  (`lib/offline/*`). A worker drains it in first-in, first-out order,
  retries on `online`, and parks failed entries instead of hot-looping. A
  read-overlay merges pending + recently-synced entries onto the server
  snapshot so cells stay green through the sync hand-off (no flicker
  between outbox-delete and router.refresh). Synthetic create rows render
  immediately, accept further edits, and de-dupe against the real row once
  it arrives via temp→real id remap.
- **Unsynced changes panel** — clicking the nav sync badge opens a panel
  listing each queued mutation with a human-readable label, per-entry
  Retry + Discard (with confirm), and Retry-all.
- **Security headers** — `Referrer-Policy`, `X-Content-Type-Options: nosniff`,
  `X-Frame-Options: DENY`, `Permissions-Policy: camera=(), microphone=(),
  geolocation=()`. Strict Content Security Policy is queued for v1.1 (needs
  per-request nonces and a WebSocket Secure allow-list for Supabase Realtime).
- **Accessibility** — Lighthouse accessibility score 100 on the deployed
  demo; sibling-chip accessible names match their visible text (clears axe
  `label-content-name-mismatch`); a `<main>` landmark on every authenticated
  page; a modern `browserslist` target trims unnecessary JavaScript
  polyfills from the bundle.

## Repo layout

```
app/                  Next.js App Router
  (app)/              auth-gated route group (Register · Dashboard · Transactions)
  login/
  page.tsx            redirects to /register
components/           shared UI (nav, sync badge, sync panel, toaster)
lib/
  offline/            Dexie outbox / replay / sync / overlay / recently-synced
  queries.ts          typed Supabase data layer (one shared write path)
  classes.ts          canonical class identifiers
  today.ts            Asia/Kolkata "today" — shared by all date math
  dashboard-metrics.ts metrics computation called inline by /dashboard
supabase/migrations/  schema, Row-Level Security policies, database functions
supabase/seed_*.sql   synthetic seed data
Docs/
  Mockup/             clickable mockup + behaviour doc
  Product_Technical_Spec/  product spec + technical spec + schema diagram
```

## Status

Portfolio snapshot of a private working repo — not accepting pull requests
and not maintained as a public project. The private repo continues to evolve
toward v1 production handoff; this snapshot is what shipped at the end of
the demo sprint. Stack choices, names, dates, and the build journal are
real; client identity is not.

License: All rights reserved. Code may be read for evaluation only.
