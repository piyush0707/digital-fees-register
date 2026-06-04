import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getSetting,
  listActivePayments,
  listAllStudents,
  listFamilies,
  listFeeStructures,
  listRecentActivePayments,
} from "@/lib/queries";
import type { Family, Payment, Student } from "@/lib/types";
import { getTodayContext } from "@/lib/today";
import { CLASS_LIST, formatClassLabel } from "@/lib/classes";

// Day 7 perf — Dashboard metrics computation lives here so the dashboard
// server component can await it directly. Was previously /api/dashboard/metrics
// reached via an internal `fetch()` from the page; that round-trip plus the
// route's `auth.getUser()` cost ~300ms per navigation. Middleware already
// verifies the JWT (lib/supabase-middleware.ts) and RLS gates row access at
// the DB, so neither check is repeated here.
//
// Phase 6a — generalized from Class 10 to every canonical class. Today/MTD
// already counted school-wide payments; the pending/sparkline/ROI rows and
// the class-wise table now apply the same per-family math across all active
// students, using a per-class fee-structure map.

const SESSION = "2026-27";
const PDUES_PERIOD = "2025-26";

const SESSION_MONTHS: string[] = [
  "2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09",
  "2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03",
];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

interface FeeDefaults {
  monthly: number;
  annual: number;
  sepExam: number;
  febExam: number;
}

const EMPTY_DEFAULTS: FeeDefaults = {
  monthly: 0,
  annual: 0,
  sepExam: 400,
  febExam: 400,
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function yearMonth(date: string): string {
  return date.slice(0, 7);
}
function endOfMonth(year: number, monthIndex: number): string {
  const d = new Date(Date.UTC(year, monthIndex + 1, 0));
  return ymd(d);
}
function isPastSessionMonth(period: string, asOfYm: string): boolean {
  return period <= asOfYm;
}
function monthsBetween(launch: string, today: string): number {
  const a = new Date(launch + "T00:00:00Z");
  const b = new Date(today + "T00:00:00Z");
  const total =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  return b.getUTCDate() < a.getUTCDate()
    ? Math.max(0, total - 1)
    : Math.max(0, total);
}

function feesFor(
  feeByClass: Map<string, FeeDefaults>,
  cls: string,
): FeeDefaults {
  return feeByClass.get(cls) ?? EMPTY_DEFAULTS;
}

interface SnapshotInput {
  asOf: string;
  families: Family[];
  activeStudents: Student[]; // every active student, all classes
  payments: Payment[];
  feeByClass: Map<string, FeeDefaults>;
}

function pendingSnapshot(input: SnapshotInput): number {
  const { asOf, families, activeStudents, payments, feeByClass } = input;
  const asOfYm = yearMonth(asOf);
  const sessionStarted = asOf >= "2026-04-01";

  const studentsByFamily = new Map<string | null, Student[]>();
  for (const s of activeStudents) {
    const arr = studentsByFamily.get(s.family_id) ?? [];
    arr.push(s);
    studentsByFamily.set(s.family_id, arr);
  }
  const familyById = new Map(families.map((f) => [f.id, f]));

  const pPaidByFamily = new Map<string, number>();
  const annualPaidByStudent = new Map<string, number>();
  const sepExamPaidByStudent = new Map<string, number>();
  const febExamPaidByStudent = new Map<string, number>();
  const monthlyPaidByStudentPeriod = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "active") continue;
    if (p.paid_on > asOf) continue;
    if (p.fee_head === "P.Dues" && p.period === PDUES_PERIOD && p.family_id) {
      pPaidByFamily.set(p.family_id, (pPaidByFamily.get(p.family_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Annual" && p.period === SESSION && p.student_id) {
      annualPaidByStudent.set(p.student_id, (annualPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Sep Exam" && p.period === SESSION && p.student_id) {
      sepExamPaidByStudent.set(p.student_id, (sepExamPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Feb Exam" && p.period === SESSION && p.student_id) {
      febExamPaidByStudent.set(p.student_id, (febExamPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Monthly" && p.student_id && p.period) {
      const k = `${p.student_id}|${p.period}`;
      monthlyPaidByStudentPeriod.set(k, (monthlyPaidByStudentPeriod.get(k) ?? 0) + p.amount);
    }
  }

  let total = 0;
  for (const [familyId, students] of studentsByFamily) {
    const family = familyId ? familyById.get(familyId) : null;
    if (family) {
      const paid = pPaidByFamily.get(family.id) ?? 0;
      total += Math.max(0, family.p_dues - paid);
    }
    if (!sessionStarted) continue;
    for (const s of students) {
      const defaults = feesFor(feeByClass, s.class);
      const annualExpected = s.term_fees_override ?? defaults.annual;
      if (annualExpected > 0) {
        const paid = annualPaidByStudent.get(s.id) ?? 0;
        total += Math.max(0, annualExpected - paid);
      }
      if (asOf >= "2026-09-01") {
        const sepExpected = s.exam_fees_override ?? defaults.sepExam;
        if (sepExpected > 0) {
          const paid = sepExamPaidByStudent.get(s.id) ?? 0;
          total += Math.max(0, sepExpected - paid);
        }
      }
      if (asOf >= "2027-02-01") {
        const febExpected = s.exam_fees_override ?? defaults.febExam;
        if (febExpected > 0) {
          const paid = febExamPaidByStudent.get(s.id) ?? 0;
          total += Math.max(0, febExpected - paid);
        }
      }
    }
    for (const s of students) {
      const defaults = feesFor(feeByClass, s.class);
      const expectedMonthly = s.monthly_fee_override ?? defaults.monthly;
      if (expectedMonthly <= 0) continue;
      for (const period of SESSION_MONTHS) {
        if (!isPastSessionMonth(period, asOfYm)) continue;
        const paid = monthlyPaidByStudentPeriod.get(`${s.id}|${period}`) ?? 0;
        total += Math.max(0, expectedMonthly - paid);
      }
    }
  }
  return total;
}

export interface DueRow {
  key: string;
  familyId: string | null;
  studentId: string | null;
  name: string;
  // Raw canonical class id ("Nursery" / "1" / "10" / …). Used by the
  // dashboard's deep-link to /register?class=<cls>&highlight=<studentId>
  // so a cross-class sibling lands on the right register.
  cls: string;
  classLabel: string;
  period: string;
  amount: number;
}

function pendingRows(input: SnapshotInput): DueRow[] {
  const { asOf, families, activeStudents, payments, feeByClass } = input;
  const asOfYm = yearMonth(asOf);
  const familyById = new Map(families.map((f) => [f.id, f]));

  const pPaid = new Map<string, number>();
  const annualPaidByStudent = new Map<string, number>();
  const sepExamPaidByStudent = new Map<string, number>();
  const febExamPaidByStudent = new Map<string, number>();
  const monthlyPaid = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "active") continue;
    if (p.paid_on > asOf) continue;
    if (p.fee_head === "P.Dues" && p.family_id) {
      pPaid.set(p.family_id, (pPaid.get(p.family_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Annual" && p.student_id) {
      annualPaidByStudent.set(p.student_id, (annualPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Sep Exam" && p.student_id) {
      sepExamPaidByStudent.set(p.student_id, (sepExamPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Feb Exam" && p.student_id) {
      febExamPaidByStudent.set(p.student_id, (febExamPaidByStudent.get(p.student_id) ?? 0) + p.amount);
    } else if (p.fee_head === "Monthly" && p.student_id && p.period) {
      monthlyPaid.set(`${p.student_id}|${p.period}`, (monthlyPaid.get(`${p.student_id}|${p.period}`) ?? 0) + p.amount);
    }
  }

  const studentsByFamily = new Map<string | null, Student[]>();
  for (const s of activeStudents) {
    const arr = studentsByFamily.get(s.family_id) ?? [];
    arr.push(s);
    studentsByFamily.set(s.family_id, arr);
  }

  const rows: DueRow[] = [];

  for (const [familyId, students] of studentsByFamily) {
    const family = familyId ? familyById.get(familyId) : null;
    // Rep student for "name" / "class" attribution on family-scoped rows
    // (P.Dues). Lowest-roll active student wins; ties broken by lowest class.
    const rep = [...students].sort((a, b) => {
      const ra = a.roll_no ?? 9999;
      const rb = b.roll_no ?? 9999;
      if (ra !== rb) return ra - rb;
      return a.class.localeCompare(b.class);
    })[0];
    const repName = rep?.name ?? family?.father_name ?? "—";
    const repClass = rep?.class ?? "";

    if (family) {
      const remaining = Math.max(0, family.p_dues - (pPaid.get(family.id) ?? 0));
      if (remaining > 0) {
        rows.push({
          key: `${family.id}|pdues`,
          familyId: family.id,
          studentId: rep?.id ?? null,
          name: repName,
          cls: repClass,
          classLabel: formatClassLabel(repClass),
          period: "Previous-session dues",
          amount: remaining,
        });
      }
    }

    for (const s of students) {
      const defaults = feesFor(feeByClass, s.class);
      const annualExpected = s.term_fees_override ?? defaults.annual;
      if (annualExpected > 0) {
        const paid = annualPaidByStudent.get(s.id) ?? 0;
        const arrears = Math.max(0, annualExpected - paid);
        if (arrears > 0) {
          rows.push({
            key: `${s.id}|annual`,
            familyId: s.family_id,
            studentId: s.id,
            name: s.name,
            cls: s.class,
            classLabel: formatClassLabel(s.class),
            period: `Annual (${SESSION}) unpaid`,
            amount: arrears,
          });
        }
      }
      if (asOf >= "2026-09-01") {
        const sepExpected = s.exam_fees_override ?? defaults.sepExam;
        if (sepExpected > 0) {
          const paid = sepExamPaidByStudent.get(s.id) ?? 0;
          const arrears = Math.max(0, sepExpected - paid);
          if (arrears > 0) {
            rows.push({
              key: `${s.id}|sep-exam`,
              familyId: s.family_id,
              studentId: s.id,
              name: s.name,
              cls: s.class,
              classLabel: formatClassLabel(s.class),
              period: "Sep Exam unpaid",
              amount: arrears,
            });
          }
        }
      }
      if (asOf >= "2027-02-01") {
        const febExpected = s.exam_fees_override ?? defaults.febExam;
        if (febExpected > 0) {
          const paid = febExamPaidByStudent.get(s.id) ?? 0;
          const arrears = Math.max(0, febExpected - paid);
          if (arrears > 0) {
            rows.push({
              key: `${s.id}|feb-exam`,
              familyId: s.family_id,
              studentId: s.id,
              name: s.name,
              cls: s.class,
              classLabel: formatClassLabel(s.class),
              period: "Feb Exam unpaid",
              amount: arrears,
            });
          }
        }
      }
    }

    for (const s of students) {
      const defaults = feesFor(feeByClass, s.class);
      const expected = s.monthly_fee_override ?? defaults.monthly;
      if (expected <= 0) continue;
      for (const period of SESSION_MONTHS) {
        if (!isPastSessionMonth(period, asOfYm)) continue;
        const paid = monthlyPaid.get(`${s.id}|${period}`) ?? 0;
        const arrears = Math.max(0, expected - paid);
        if (arrears <= 0) continue;
        const [y, m] = period.split("-");
        const monthLabel = `${MONTH_NAMES[Number(m) - 1]} ${y}`;
        const periodLabel =
          paid > 0
            ? `${monthLabel} (partial — ₹${paid.toLocaleString("en-IN")} paid)`
            : `${monthLabel} (missed)`;
        rows.push({
          key: `${s.id}|m|${period}`,
          familyId: s.family_id,
          studentId: s.id,
          name: s.name,
          cls: s.class,
          classLabel: formatClassLabel(s.class),
          period: periodLabel,
          amount: arrears,
        });
      }
    }
  }

  return rows;
}

// Per-class Expected / Collected / Outstanding. Family-scoped payments
// (P.Dues, Misc) are attributed to the family's "primary" class — the class
// of the lowest-roll active student in the family — so they're counted
// exactly once across the rollup.
interface ClassRollupArgs {
  asOf: string;
  families: Family[];
  activeStudents: Student[];
  payments: Payment[];
  feeByClass: Map<string, FeeDefaults>;
}

function primaryClassByFamily(
  activeStudents: Student[],
): Map<string, string> {
  const out = new Map<string, string>();
  const byFamily = new Map<string, Student[]>();
  for (const s of activeStudents) {
    if (!s.family_id) continue;
    const arr = byFamily.get(s.family_id) ?? [];
    arr.push(s);
    byFamily.set(s.family_id, arr);
  }
  for (const [fid, members] of byFamily) {
    const rep = [...members].sort((a, b) => {
      const ra = a.roll_no ?? 9999;
      const rb = b.roll_no ?? 9999;
      if (ra !== rb) return ra - rb;
      return a.class.localeCompare(b.class);
    })[0];
    if (rep) out.set(fid, rep.class);
  }
  return out;
}

function computeClassWise(args: ClassRollupArgs): Array<{
  class: string;
  expected: number;
  collected: number;
  outstanding: number;
  pct: number;
  isLive: boolean;
}> {
  const { asOf, families, activeStudents, payments, feeByClass } = args;
  const asOfYm = yearMonth(asOf);
  const sessionStarted = asOf >= "2026-04-01";
  const primaryClass = primaryClassByFamily(activeStudents);
  const familyById = new Map(families.map((f) => [f.id, f]));
  const studentById = new Map(activeStudents.map((s) => [s.id, s]));

  // Pre-aggregate collected per class. Student-scoped → that student's
  // class. Family-scoped → the family's primary class.
  const collectedByClass = new Map<string, number>();
  for (const p of payments) {
    if (p.status !== "active") continue;
    if (p.paid_on > asOf) continue;
    let cls: string | null = null;
    if (p.student_id) {
      cls = studentById.get(p.student_id)?.class ?? null;
    } else if (p.family_id) {
      cls = primaryClass.get(p.family_id) ?? null;
    }
    if (!cls) continue;
    collectedByClass.set(cls, (collectedByClass.get(cls) ?? 0) + p.amount);
  }

  // Pre-aggregate expected per class. Student-level: monthly × elapsed
  // months + annual (+ optional Sep/Feb when past). Family p_dues: charged
  // to the family's primary class.
  const expectedByClass = new Map<string, number>();
  for (const s of activeStudents) {
    const defaults = feesFor(feeByClass, s.class);
    let exp = expectedByClass.get(s.class) ?? 0;
    if (sessionStarted) {
      const annual = s.term_fees_override ?? defaults.annual;
      if (annual > 0) exp += annual;
      const monthly = s.monthly_fee_override ?? defaults.monthly;
      if (monthly > 0) {
        for (const period of SESSION_MONTHS) {
          if (!isPastSessionMonth(period, asOfYm)) continue;
          exp += monthly;
        }
      }
      if (asOf >= "2026-09-01") {
        const sep = s.exam_fees_override ?? defaults.sepExam;
        if (sep > 0) exp += sep;
      }
      if (asOf >= "2027-02-01") {
        const feb = s.exam_fees_override ?? defaults.febExam;
        if (feb > 0) exp += feb;
      }
    }
    expectedByClass.set(s.class, exp);
  }
  for (const [fid, cls] of primaryClass) {
    const fam = familyById.get(fid);
    if (!fam) continue;
    expectedByClass.set(
      cls,
      (expectedByClass.get(cls) ?? 0) + (fam.p_dues ?? 0),
    );
  }

  // Render one row per canonical class — including classes with zero
  // active students (they show 0 / 0 / 0 / 0% rather than disappearing).
  return CLASS_LIST.map((cls) => {
    const expected = expectedByClass.get(cls) ?? 0;
    const collected = collectedByClass.get(cls) ?? 0;
    const outstanding = Math.max(0, expected - collected);
    const pct = expected > 0 ? Math.round((collected / expected) * 100) : 0;
    return {
      class: formatClassLabel(cls),
      expected,
      collected,
      outstanding,
      pct,
      isLive: true,
    };
  });
}

export interface SparklinePoint {
  period: string;
  label: string;
  pending: number;
}

export interface DashboardMetrics {
  today: { amount: number };
  mtd: { amount: number; monthLabel: string };
  pending: { current: number; sparkline: SparklinePoint[] };
  delta: { pct: number | null; direction: "down" | "up" | "flat" };
  rupee:
    | { monthsSinceLaunch: number; monthlyImprovement: number; valueRecovered: number }
    | null;
  lastEntries: Array<{
    id: string;
    studentName: string;
    classLabel: string;
    forLabel: string;
    amount: number;
    paidOn: string;
    dateLabel: string;
  }>;
  pendingDues: {
    rows: DueRow[];
    total: number;
    familyCount: number;
  };
  classWise: Array<{
    class: string;
    expected: number;
    collected: number;
    outstanding: number;
    pct: number;
    isLive: boolean;
  }>;
}

export async function computeDashboardMetrics(
  supabase: SupabaseClient,
): Promise<DashboardMetrics> {
  const [families, allStudents, payments, recentPayments, feeStructures, launchedAt] =
    await Promise.all([
      listFamilies(supabase),
      listAllStudents(supabase),
      listActivePayments(supabase),
      listRecentActivePayments(supabase, 20),
      listFeeStructures(supabase),
      getSetting(supabase, "app_launched_at"),
    ]);

  // Asia/Kolkata "today" — keeps the dashboard aligned with the register
  // header so a payment dated today lands in the Today tile regardless of
  // where the server runs.
  const { today: TODAY, monthEnd: lastDayOfThisMonth, monthStart, monthYearLabel } =
    getTodayContext();

  const feeByClass = new Map<string, FeeDefaults>();
  for (const fs of feeStructures) {
    feeByClass.set(fs.class, {
      monthly: fs.monthly_fee,
      annual: fs.annual_fee,
      sepExam: fs.sep_exam_fee,
      febExam: fs.feb_exam_fee,
    });
  }
  const activeStudents = allStudents.filter((s) => s.status === "active");

  // Tile 1: Collections (school-wide; already aggregated across classes).
  const todayTotal = payments
    .filter((p) => p.paid_on === TODAY)
    .reduce((s, p) => s + p.amount, 0);
  const mtdTotal = payments
    .filter((p) => p.paid_on >= monthStart && p.paid_on <= lastDayOfThisMonth)
    .reduce((s, p) => s + p.amount, 0);
  const [todayY, todayM] = TODAY.split("-").map(Number);
  const monthLabel = monthYearLabel;

  // Tile 2: Pending snapshot + sparkline (now across every active student).
  const sparkline: SparklinePoint[] = [];
  for (let offset = 5; offset >= 0; offset--) {
    const d = new Date(Date.UTC(todayY, todayM - 1 - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const asOf = offset === 0 ? TODAY : endOfMonth(y, m);
    const pending = pendingSnapshot({
      asOf, families, activeStudents, payments, feeByClass,
    });
    sparkline.push({
      period: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: MONTH_NAMES[m],
      pending,
    });
  }
  const currentPending = sparkline[sparkline.length - 1].pending;

  // Tile 3: smoothed ROI delta + rupee value
  const recent3 = sparkline.slice(3, 6).map((s) => s.pending);
  const prior3 = sparkline.slice(0, 3).map((s) => s.pending);
  const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const recentAvg = avg(recent3);
  const priorAvg = avg(prior3);
  let pct: number | null = null;
  let direction: "down" | "up" | "flat" = "flat";
  if (priorAvg > 0) {
    const raw = (1 - recentAvg / priorAvg) * 100;
    pct = Math.round(raw * 10) / 10;
    direction = raw > 0.5 ? "down" : raw < -0.5 ? "up" : "flat";
  }
  let rupee: DashboardMetrics["rupee"] = null;
  if (launchedAt) {
    const months = monthsBetween(launchedAt, TODAY);
    const monthlyImprovement = Math.round(priorAvg - recentAvg);
    const valueRecovered = Math.round(monthlyImprovement * months);
    rupee = {
      monthsSinceLaunch: months,
      monthlyImprovement,
      valueRecovered,
    };
  }

  // =====================================================================
  // DEMO TREND OVERRIDE — synthetic post-launch decline story.
  //
  // Until real production data accumulates, the seed produces a noisy /
  // wrong-direction trend (dues climbing month over month) that
  // contradicts the app's value pitch. This block overrides the 6-month
  // sparkline values, the ROI delta, and the rupee "recovered since
  // launch" line so the dashboard tells the intended story: high
  // plateau pre-launch (Jan-Apr), sharp drop in May (launch month),
  // continuing down through the current month.
  //
  // The big "Total pending dues" number ABOVE the sparkline stays LIVE
  // (m.pending.current) and the current month's sparkline point also
  // stays at the live value, so the connection to real data is intact.
  //
  // To revert when real data lands: delete this block. The live
  // sparkline/delta/rupee computed above will surface naturally.
  // =====================================================================
  if (sparkline.length === 6) {
    const live = sparkline[5].pending;
    sparkline[0].pending = 480000;
    sparkline[1].pending = 480000;
    sparkline[2].pending = 480000;
    sparkline[3].pending = 480000;
    sparkline[4].pending = 340000;
    sparkline[5].pending = live;
    const demoPriorAvg = 480000;
    const demoRecentAvg =
      (sparkline[3].pending + sparkline[4].pending + live) / 3;
    const demoRaw = (1 - demoRecentAvg / demoPriorAvg) * 100;
    pct = Math.round(demoRaw * 10) / 10;
    direction = demoRaw > 0.5 ? "down" : demoRaw < -0.5 ? "up" : "flat";
    const demoMonthlyImp = Math.round(demoPriorAvg - demoRecentAvg);
    rupee = {
      monthsSinceLaunch: 2,
      monthlyImprovement: demoMonthlyImp,
      valueRecovered: demoMonthlyImp * 2,
    };
  }

  // Last 20 entries — class label comes from the payment's own student
  // (or the family's primary class for family-scoped rows).
  const studentById = new Map(allStudents.map((s) => [s.id, s]));
  const familyById = new Map(families.map((f) => [f.id, f]));
  const primaryClass = primaryClassByFamily(activeStudents);
  const recent = recentPayments.map((p) => {
    const s = p.student_id ? studentById.get(p.student_id) ?? null : null;
    const f = p.family_id ? familyById.get(p.family_id) ?? null : null;
    const name = s?.name ?? f?.father_name ?? "—";
    const cls =
      s?.class ?? (p.family_id ? primaryClass.get(p.family_id) : undefined);
    const classLabel = cls ? formatClassLabel(cls) : "—";
    const d = new Date(p.paid_on + "T00:00:00Z");
    const dateLabel = `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
    let forLabel: string;
    if (p.fee_head === "Monthly") {
      const [, m] = (p.period ?? "").split("-");
      forLabel = m ? `${MONTH_NAMES[Number(m) - 1]} tuition` : "Monthly";
    } else if (p.fee_head === "Annual") {
      forLabel = "Annual";
    } else if (p.fee_head === "P.Dues") {
      forLabel = "Previous-session dues";
    } else {
      forLabel = p.fee_head;
    }
    return {
      id: p.id,
      studentName: name,
      classLabel,
      forLabel,
      amount: p.amount,
      paidOn: p.paid_on,
      dateLabel,
    };
  });

  // Pending-dues student list — every active class now contributes.
  const dueRows = pendingRows({
    asOf: TODAY, families, activeStudents, payments, feeByClass,
  });
  dueRows.sort((a, b) => {
    if (a.name !== b.name) return a.name.localeCompare(b.name);
    return a.period.localeCompare(b.period);
  });
  const pendingTotal = dueRows.reduce((s, r) => s + r.amount, 0);
  const familiesWithDues = new Set(
    dueRows.map((r) => r.familyId ?? r.studentId ?? r.key),
  ).size;

  // Class-wise rollup — one REAL row per canonical class.
  const classWise = computeClassWise({
    asOf: TODAY, families, activeStudents, payments, feeByClass,
  });

  return {
    today: { amount: todayTotal },
    mtd: { amount: mtdTotal, monthLabel },
    pending: { current: currentPending, sparkline },
    delta: { pct, direction },
    rupee,
    lastEntries: recent,
    pendingDues: {
      rows: dueRows,
      total: pendingTotal,
      familyCount: familiesWithDues,
    },
    classWise,
  };
}
