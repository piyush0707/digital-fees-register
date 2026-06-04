import { PendingDuesTable } from "./pending-dues-table";
import { ViewAllLink } from "./view-all-link";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import {
  computeDashboardMetrics,
  type SparklinePoint,
} from "@/lib/dashboard-metrics";

// Day 4 — Dashboard. Renders the 3 metric tiles + pending dues table + Last 20
// entries + class-wise collections, all from a single server-side computation
// (lib/dashboard-metrics.ts). Day 7 perf pass dropped the internal fetch to
// /api/dashboard/metrics (which had its own auth.getUser() RTT) — middleware
// already verifies the JWT and RLS still gates DB access, so we call straight.

export const dynamic = "force-dynamic";

function fmt(n: number): string {
  return n.toLocaleString("en-IN");
}

// Build the SVG path for the 6-point sparkline. ViewBox is 220×40 with a
// 4px horizontal inset so the first/last datapoint circles render fully
// inside the visible area instead of being clipped at the edge.
function sparklinePaths(points: SparklinePoint[]) {
  const W = 220;
  const inset = 4;
  const top = 4;
  const bottom = 36;
  const range = bottom - top;
  const max = Math.max(...points.map((p) => p.pending), 1);
  const min = 0;
  const span = max - min || 1;
  const usableW = W - inset * 2;
  const stepX = usableW / Math.max(points.length - 1, 1);

  const xy = points.map((p, i) => {
    const x = inset + Math.round(i * stepX);
    const norm = (p.pending - min) / span;
    // Invert: high pending → lower y (closer to top).
    const y = Math.round(bottom - norm * range);
    return { x, y };
  });

  const line = xy.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
  const area = `${line} L ${xy[xy.length - 1].x},${bottom} L ${xy[0].x},${bottom} Z`;
  return { line, area, xy, lastIndex: xy.length - 1 };
}

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const m = await computeDashboardMetrics(supabase);
  const spark = sparklinePaths(m.pending.sparkline);

  const deltaDir = m.delta.direction;
  const deltaPct = m.delta.pct;
  const deltaText =
    deltaPct === null
      ? "— %"
      : deltaDir === "down"
        ? `▼ ${Math.abs(deltaPct)}%`
        : deltaDir === "up"
          ? `▲ ${Math.abs(deltaPct)}%`
          : `▬ ${Math.abs(deltaPct)}%`;
  const deltaPctClass =
    deltaDir === "down"
      ? "pt-delta-pct"
      : deltaDir === "up"
        ? "pt-delta-pct up"
        : "pt-delta-pct flat";

  // §D2b says hide the rupee line until months_since_launch >= 2 because
  // anything shorter is statistical noise. v1 demo with synthetic seed has
  // months_since_launch < 2, so per user feedback we still render the box
  // with an explanatory placeholder — design intent is that the tile is
  // never empty.
  const rupeeReady =
    m.rupee !== null &&
    m.rupee.monthsSinceLaunch >= 2 &&
    m.rupee.monthlyImprovement > 0;

  return (
    <section className="min-h-screen py-8 px-6 bg-slate-50">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Key metric tiles — 3 tiles in grid-cols-3 */}
          <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-200">
            {/* Tile 1 · Collections (today + MTD merged) */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm collections-card">
              <p className="text-xs text-slate-500 mb-2">
                Collections <span className="text-slate-400">· school-wide</span>
              </p>
              <div className="cc-row">
                <span className="cc-label">Today</span>
                <span className="cc-value">₹{fmt(m.today.amount)}</span>
              </div>
              <div className="cc-divider" />
              <div className="cc-row">
                <span className="cc-label">{m.mtd.monthLabel} · MTD</span>
                <span className="cc-value">₹{fmt(m.mtd.amount)}</span>
              </div>
            </div>

            {/* Tile 2 · Total pending dues + 6-month sparkline */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm pending-trend-card">
              <p className="text-xs text-slate-500 mb-1">Total pending dues</p>
              <p className="text-3xl font-bold text-rose-600 leading-none mt-1">
                ₹{fmt(m.pending.current)}
              </p>
              <div className="pt-sparkline-wrap" style={{ marginTop: 14 }}>
                <p className="pt-sparkline-title">
                  Avg pending dues{" "}
                  <span className="pt-sparkline-title-meta">· last 6 months</span>
                </p>
                <svg
                  className="pt-sparkline"
                  viewBox="0 0 220 40"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-label="Pending dues, last 6 months"
                >
                  <line x1="0" y1="36" x2="220" y2="36" stroke="#e2e8f0" strokeWidth="1" />
                  <path d={spark.area} fill="rgba(16, 185, 129, 0.08)" />
                  <path
                    d={spark.line}
                    fill="none"
                    stroke="#10b981"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {spark.xy.map((p, i) =>
                    i === spark.lastIndex ? (
                      <circle
                        key={i}
                        cx={p.x}
                        cy={p.y}
                        r="3"
                        fill="#047857"
                        stroke="white"
                        strokeWidth="1.5"
                      />
                    ) : (
                      <circle key={i} cx={p.x} cy={p.y} r="2.4" fill="#10b981" />
                    ),
                  )}
                </svg>
                <div className="pt-sparkline-axis">
                  {m.pending.sparkline.map((s) => (
                    <span key={s.period}>{s.label}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Tile 3 · ROI (smoothed delta + rupee value) */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm pending-trend-card">
              <p className="text-xs text-slate-500 mb-2">
                Avg pending dues vs prior 3-month avg
              </p>
              <div className="pt-delta-row">
                <span className={deltaPctClass}>{deltaText}</span>
              </div>
              {rupeeReady && m.rupee ? (
                <p
                  className="pt-roi-rupee"
                  title="Cash that's already in the school's account vs the pre-app baseline."
                >
                  ≈ ₹{fmt(m.rupee.valueRecovered)} recovered since launch
                </p>
              ) : (
                <p
                  className="pt-roi-rupee"
                  title="Rupee value will appear here once 2 months of post-launch data is available. Formula: monthly improvement × months since launch."
                >
                  ≈ Rupee value recovered will appear here once 2 months of
                  post-launch data is collected.
                </p>
              )}
            </div>
          </div>

          {/* Students with pending dues (open by default — §D3) */}
          <details open className="collapsible mx-6 mt-6">
            <summary>
              <span>
                Students with pending dues
                <span className="summary-meta">₹{fmt(m.pendingDues.total)}</span>
              </span>
              <svg className="chevron w-4 h-4 text-slate-500" viewBox="0 0 12 8" fill="none">
                <path
                  d="M1 1l5 5 5-5"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </summary>
            <PendingDuesTable rows={m.pendingDues.rows} />
          </details>

          {/* Two-column area — Class-wise (left, 3/5) · Last 20 entries (right, 2/5) */}
          <div className="grid grid-cols-5 gap-6 p-6">
            <div className="col-span-3">
              <details className="collapsible">
                <summary>
                  <span>
                    Class-wise collections ({m.mtd.monthLabel})
                  </span>
                  <svg
                    className="chevron w-4 h-4 text-slate-500"
                    viewBox="0 0 12 8"
                    fill="none"
                  >
                    <path
                      d="M1 1l5 5 5-5"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </summary>
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="px-3 py-2 text-left">Class</th>
                      <th className="px-3 py-2 text-right">Expected</th>
                      <th className="px-3 py-2 text-right">Collected</th>
                      <th className="px-3 py-2 text-right">Outstanding</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {m.classWise.map((c) => (
                      <tr key={c.class}>
                        <td className="px-3 py-2 font-medium">{c.class}</td>
                        <td className="px-3 py-2 text-right">
                          ₹{fmt(c.expected)}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold">
                          ₹{fmt(c.collected)}
                        </td>
                        <td className="px-3 py-2 text-right text-rose-600">
                          ₹{fmt(c.outstanding)}
                        </td>
                        <td className="px-3 py-2 text-right">{c.pct}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </div>

            <div className="col-span-2">
              <details className="collapsible">
                <summary>
                  <span>
                    Last 20 entries
                    <span className="summary-meta">verify what was just recorded</span>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <ViewAllLink />
                    <svg
                      className="chevron w-4 h-4 text-slate-500"
                      viewBox="0 0 12 8"
                      fill="none"
                    >
                      <path
                        d="M1 1l5 5 5-5"
                        stroke="currentColor"
                        strokeWidth="1.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </summary>
                <div className="max-h-80 overflow-y-auto">
                  <table className="w-full text-xs recent-entries-table">
                    <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left">Student</th>
                        <th className="px-3 py-2 text-left">For</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                        <th className="px-3 py-2 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {m.lastEntries.length === 0 && (
                        <tr>
                          <td
                            className="px-3 py-3 text-slate-500 italic"
                            colSpan={4}
                          >
                            No recent payments.
                          </td>
                        </tr>
                      )}
                      {m.lastEntries.map((e) => (
                        <tr key={e.id}>
                          <td className="px-3 py-1.5">{e.studentName}</td>
                          {/* Mockup: same-class rows show "May tuition";
                              cross-class siblings append "· Class VIII". */}
                          <td className="px-3 py-1.5 text-slate-500">
                            {e.forLabel}
                            {e.classLabel !== "Class 10"
                              ? ` · ${e.classLabel}`
                              : ""}
                          </td>
                          <td className="px-3 py-1.5 text-right">₹{fmt(e.amount)}</td>
                          <td
                            className="px-3 py-1.5 text-right text-slate-500"
                            title={e.paidOn}
                          >
                            {e.dateLabel}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </div>

          <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 flex justify-between text-xs text-slate-500">
            <span>Read-only view. The register grid is where entries are made.</span>
            <span>Pending math respects per-student waivers (FB#7).</span>
          </div>
        </div>
      </div>
    </section>
  );
}
