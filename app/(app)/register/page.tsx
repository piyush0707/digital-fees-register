import { createServerSupabaseClient } from "@/lib/supabase-server";
import { getRegisterPayload } from "@/lib/queries";
import { resolveClassParam } from "@/lib/classes";
import { getTodayContext } from "@/lib/today";
import { RowHighlighter } from "./row-highlighter";
import { FeeStructureButton } from "./fee-structure-button";
import { ClassPicker } from "./class-picker";
import { NewEntryButton } from "./new-entry-button";
import { RegisterGrid } from "./register-grid";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string; class?: string }>;
}) {
  const sp = await searchParams;
  const highlight = sp.highlight;
  // Demo build: register is multi-class. `?class=<id>` picks the roster the
  // page renders; anything off-list (or missing) falls back to Class 10 so
  // the original single-class behaviour is preserved as the default.
  const currentClass = resolveClassParam(sp.class);
  const supabase = await createServerSupabaseClient();

  // Single Postgres RPC returns students / families / siblings / payments /
  // fee_structure together. One PostgREST round-trip replaces the previous
  // two-stage waterfall (see migration 0005).
  const payload = await getRegisterPayload(supabase, currentClass);

  // Dynamic today / MTD computed in Asia/Kolkata so a payment recorded this
  // afternoon lands in the Today tile regardless of the server's UTC clock.
  const { today, monthStart, monthEnd, monthYearLabel } = getTodayContext();

  // School-wide running totals from the same payments query. The client
  // grid recomputes these from the overlay-effective payments via the
  // RegisterTotalsHydrator so they stay accurate when an offline payment
  // is queued; the server values below are the first-paint baseline.
  const todayTotal = payload.payments
    .filter((p) => p.status === "active" && p.paid_on === today)
    .reduce((s, p) => s + p.amount, 0);
  const mtdTotal = payload.payments
    .filter(
      (p) =>
        p.status === "active" &&
        p.paid_on >= monthStart &&
        p.paid_on <= monthEnd,
    )
    .reduce((s, p) => s + p.amount, 0);

  return (
    <section className="min-h-screen py-8 px-6 bg-slate-50">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Class picker + Fee structure + totals + new entry */}
          <div className="border-b border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClassPicker currentClass={currentClass} />
              <FeeStructureButton currentClass={currentClass} />
            </div>
            <div className="flex gap-6 text-sm items-center">
              <div>
                <span className="text-slate-500 text-xs">Today</span>
                <p
                  className="font-semibold text-slate-900"
                  data-totals-today
                >
                  ₹{fmt(todayTotal)}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">{monthYearLabel} MTD</span>
                <p
                  className="font-semibold text-slate-900"
                  data-totals-mtd
                >
                  ₹{fmt(mtdTotal)}
                </p>
              </div>
              <NewEntryButton defaultClass={currentClass} />
            </div>
          </div>

          {/* Grid — client component reads the server payload as initial
              props and overlays the Dexie outbox so offline edits render.
              currentClass scopes the overlay so synthetic rows for other
              classes don't leak in. */}
          <RegisterGrid
            initialPayload={payload}
            currentClass={currentClass}
          />

          {/* Legend */}
          <div className="border-t border-slate-200 px-6 py-2 bg-slate-50 flex justify-end gap-4 text-xs text-slate-500 flex-wrap">
            <span>
              <span className="legend-swatch" style={{ background: "#dcfce7" }} />
              Paid
            </span>
            <span>
              <span className="legend-swatch" style={{ background: "#fed7aa" }} />
              Partial
            </span>
            <span>
              <span className="legend-swatch" style={{ background: "#fee2e2" }} />
              Missed / Pending
            </span>
            <span>
              <span
                className="legend-swatch"
                style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
              />
              Not yet due
            </span>
            <span>
              <span
                className="legend-swatch"
                style={{ background: "#f1f5f9", border: "1px solid #cbd5e1" }}
              />
              Anchor / Reference
            </span>
          </div>
        </div>
      </div>
      {/* §D3 — amber-flash a row when navigated to with ?highlight=<id> */}
      <RowHighlighter highlight={highlight} />
    </section>
  );
}
