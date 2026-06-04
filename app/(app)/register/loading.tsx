// Suspense fallback for /register. Renders the page chrome immediately on
// route transition (Class picker row, header strip, empty grid) so the URL
// flips and the user sees structure while the server-component awaits its
// Supabase queries. No data fetches here — purely static skeleton.

const COLS = [
  "Roll",
  "Name of Students",
  "P.Dues",
  "T.Fees",
  "Monthly",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep Exam",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
  "Jan",
  "Feb Exam",
  "Feb",
  "Mar",
  "Pending",
];

export default function RegisterLoading() {
  return (
    <section className="min-h-screen py-8 px-6 bg-slate-50">
      <div className="max-w-[1400px] mx-auto">
        <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Class picker + totals strip — matches the real layout */}
          <div className="border-b border-slate-200 px-6 py-3 bg-slate-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-7 w-28 rounded-md bg-gradient-to-br from-emerald-500 to-green-700 opacity-50" />
              <div className="h-7 w-32 rounded-md bg-white border border-slate-300" />
            </div>
            <div className="flex gap-6 text-sm items-center">
              <div>
                <span className="text-slate-500 text-xs">Today</span>
                <p className="font-semibold text-slate-300">₹—</p>
              </div>
              <div>
                <span className="text-slate-500 text-xs">May 2026 MTD</span>
                <p className="font-semibold text-slate-300">₹—</p>
              </div>
              <div className="h-8 w-28 rounded-md bg-gradient-to-br from-emerald-500 to-green-700 opacity-50" />
            </div>
          </div>

          <div className="register-scroll">
            <table id="register-table" className="w-full">
              <thead>
                <tr>
                  {COLS.map((label, i) => (
                    <th
                      key={label + i}
                      className={
                        "grid-head" +
                        (i === 0
                          ? " sticky-col sticky-col-roll"
                          : i === 1
                            ? " sticky-col sticky-col-name"
                            : i === 2
                              ? " sticky-col sticky-col-anchor"
                              : i === 3
                                ? " sticky-col sticky-col-anchor"
                                : i === 4
                                  ? " sticky-col sticky-col-anchor anchor-end"
                                  : i === COLS.length - 1
                                    ? " sticky-col sticky-col-pending"
                                    : "")
                      }
                      style={
                        i === 2 || i === 3 || i === 4
                          ? { background: "#475569" }
                          : i === 10 || i === 16
                            ? { background: "#15803d" }
                            : i === COLS.length - 1
                              ? { background: "#991b1b" }
                              : i === 1
                                ? { textAlign: "left", paddingLeft: 16 }
                                : undefined
                      }
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-center">
                {Array.from({ length: 8 }).map((_, r) => (
                  <tr key={r} className="family-row">
                    {COLS.map((_, c) => (
                      <td
                        key={c}
                        className={
                          "grid-cell" +
                          (c === 0
                            ? " sticky-col sticky-col-roll"
                            : c === 1
                              ? " sticky-col sticky-col-name"
                              : c === 2
                                ? " sticky-col sticky-col-anchor"
                                : c === 3
                                  ? " sticky-col sticky-col-anchor"
                                  : c === 4
                                    ? " sticky-col sticky-col-anchor anchor-end"
                                    : c === COLS.length - 1
                                      ? " sticky-col sticky-col-pending"
                                      : "")
                        }
                      >
                        <span className="inline-block h-3 w-10 rounded bg-slate-200 align-middle" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-200 px-6 py-2 bg-slate-50 text-xs text-slate-400">
            Loading register…
          </div>
        </div>
      </div>
    </section>
  );
}
