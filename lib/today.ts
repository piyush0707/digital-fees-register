// Single source of truth for "today" / "this month" derived in Asia/Kolkata,
// the school's timezone. The Register page header + Dashboard tiles both
// pull from here so they agree on the date and the MTD window (UTC midnight
// would tick over hours before/after IST midnight, so we can't just use new Date()).

const KOLKATA_TZ = "Asia/Kolkata";

// Abbreviated to match the Dashboard's existing MONTH_NAMES so the MTD
// label reads identically on Register and Dashboard ("May 2026 MTD").
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function partsInKolkata(now: Date): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: KOLKATA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(now);
  const y = Number(parts.find((p) => p.type === "year")?.value);
  const m = Number(parts.find((p) => p.type === "month")?.value);
  const d = Number(parts.find((p) => p.type === "day")?.value);
  return { y, m, d };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function daysInMonth(y: number, m: number): number {
  // m is 1-12; Date(y, m, 0) gives the last day of month m in local time. We
  // just need the day count, which doesn't depend on TZ — Feb has 28/29 days
  // regardless of where we run.
  return new Date(y, m, 0).getUTCDate();
}

export interface TodayContext {
  // 'YYYY-MM-DD' for today in Asia/Kolkata. Compare directly against
  // payments.paid_on (DATE column, also stored as YYYY-MM-DD).
  today: string;
  // 'YYYY-MM' — the canonical Monthly period for the current month.
  currentMonthPeriod: string;
  // 'YYYY-MM-DD' for the first day of the current month.
  monthStart: string;
  // 'YYYY-MM-DD' for the last day of the current month — used by the
  // dashboard sparkline to anchor each end-of-month snapshot.
  monthEnd: string;
  // "May 2026" — used in the Register header and the Dashboard MTD line.
  monthYearLabel: string;
}

export function getTodayContext(now: Date = new Date()): TodayContext {
  const { y, m, d } = partsInKolkata(now);
  const today = `${y}-${pad(m)}-${pad(d)}`;
  const currentMonthPeriod = `${y}-${pad(m)}`;
  const monthStart = `${currentMonthPeriod}-01`;
  const monthEnd = `${currentMonthPeriod}-${pad(daysInMonth(y, m))}`;
  const monthYearLabel = `${MONTH_NAMES[m - 1]} ${y}`;
  return { today, currentMonthPeriod, monthStart, monthEnd, monthYearLabel };
}
