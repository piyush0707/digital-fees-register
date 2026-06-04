// Suspense fallback for /dashboard. Renders the 3-tile grid skeleton +
// pending-dues + tables outline so the URL flips immediately while the
// server component awaits /api/dashboard/metrics. No data fetches here.

function Bar({ w, h = 14 }: { w: string; h?: number }) {
  return (
    <span
      className="inline-block rounded bg-slate-200"
      style={{ width: w, height: h }}
    />
  );
}

export default function DashboardLoading() {
  return (
    <section className="min-h-screen py-8 px-6 bg-slate-50">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* 3 metric tiles */}
          <div className="grid grid-cols-3 gap-4 p-6 bg-slate-50 border-b border-slate-200">
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm collections-card">
              <p className="text-xs text-slate-500 mb-2">
                Collections <span className="text-slate-400">· school-wide</span>
              </p>
              <div className="cc-row">
                <span className="cc-label">Today</span>
                <Bar w="60px" h={18} />
              </div>
              <div className="cc-divider" />
              <div className="cc-row">
                <Bar w="100px" />
                <Bar w="72px" h={18} />
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm pending-trend-card">
              <p className="text-xs text-slate-500 mb-1">Total pending dues</p>
              <Bar w="120px" h={28} />
              <div className="pt-sparkline-wrap" style={{ marginTop: 14 }}>
                <p className="pt-sparkline-title">
                  Avg pending dues{" "}
                  <span className="pt-sparkline-title-meta">· last 6 months</span>
                </p>
                <div
                  className="pt-sparkline"
                  style={{
                    background:
                      "repeating-linear-gradient(90deg, #e2e8f0, #e2e8f0 6px, transparent 6px, transparent 12px)",
                    height: 40,
                    borderRadius: 4,
                  }}
                />
                <div className="pt-sparkline-axis">
                  {["Dec", "Jan", "Feb", "Mar", "Apr", "May"].map((m) => (
                    <span key={m}>{m}</span>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm pending-trend-card">
              <p className="text-xs text-slate-500 mb-2">
                Avg pending dues vs prior 3-month avg
              </p>
              <div className="pt-delta-row">
                <span className="pt-delta-pct flat">— %</span>
              </div>
              <p className="pt-roi-rupee" style={{ visibility: "hidden" }}>
                placeholder
              </p>
            </div>
          </div>

          {/* Pending-dues table outline */}
          <details open className="collapsible mx-6 mt-6">
            <summary>
              <span>
                Students with pending dues
                <span className="summary-meta">Loading…</span>
              </span>
              <span className="text-slate-300">▾</span>
            </summary>
            <div>
              <table className="w-full text-xs">
                <thead className="bg-slate-100 text-slate-600 uppercase tracking-wide">
                  <tr>
                    <th className="px-3 py-2 text-left">Student / Family</th>
                    <th className="px-3 py-2 text-left">Class</th>
                    <th className="px-3 py-2 text-left">Period</th>
                    <th className="px-3 py-2 text-center">Action</th>
                    <th className="px-3 py-2 text-right">Amount due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-3 py-1.5">
                        <Bar w="100px" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Bar w="60px" />
                      </td>
                      <td className="px-3 py-1.5">
                        <Bar w="140px" />
                      </td>
                      <td className="px-3 py-1.5 text-center">
                        <Bar w="24px" h={24} />
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <Bar w="50px" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className="grid grid-cols-5 gap-6 p-6">
            <div className="col-span-3">
              <details className="collapsible">
                <summary>
                  <span>
                    Class-wise collections
                    <span className="summary-meta">Loading…</span>
                  </span>
                  <span className="text-slate-300">▾</span>
                </summary>
              </details>
            </div>
            <div className="col-span-2">
              <details className="collapsible">
                <summary>
                  <span>
                    Last 20 entries
                    <span className="summary-meta">Loading…</span>
                  </span>
                  <span className="text-slate-300">▾</span>
                </summary>
              </details>
            </div>
          </div>

          <div className="border-t border-slate-200 px-6 py-3 bg-slate-50 text-xs text-slate-400">
            Loading dashboard…
          </div>
        </div>
      </div>
    </section>
  );
}
