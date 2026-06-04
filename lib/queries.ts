import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Family,
  Student,
  Payment,
  FeeStructure,
  FeeHead,
  PaymentMode,
} from "./types";

// Every query takes the SupabaseClient as its first argument so callers can
// pass either the browser singleton (lib/supabase.ts) or a cookie-bound
// server client (lib/supabase-server.ts) without forking the implementation.

export async function listFamilies(client: SupabaseClient): Promise<Family[]> {
  const { data, error } = await client.from("families").select("*");
  if (error) throw error;
  return data ?? [];
}

export async function listAllStudents(client: SupabaseClient): Promise<Student[]> {
  const { data, error } = await client
    .from("students")
    .select("*")
    .order("class", { ascending: true })
    .order("roll_no", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

// Single-round-trip Register payload — calls the `register_payload` Postgres
// function (migration 0005). Replaces the previous two-stage waterfall
// (Phase 1 students+fee → Phase 2 families+siblings+payments) so /register
// now pays one PostgREST RTT instead of two.
export interface RegisterPayload {
  students: Student[];
  families: Family[];
  siblings: Student[];
  payments: Payment[];
  fee_structure: FeeStructure | null;
}

export async function getRegisterPayload(
  client: SupabaseClient,
  cls: string,
): Promise<RegisterPayload> {
  const { data, error } = await client.rpc("register_payload", {
    p_class: cls,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<RegisterPayload>;
  return {
    students: raw.students ?? [],
    families: raw.families ?? [],
    siblings: raw.siblings ?? [],
    payments: raw.payments ?? [],
    fee_structure: raw.fee_structure ?? null,
  };
}

export async function getStudent(
  client: SupabaseClient,
  id: string,
): Promise<Student | null> {
  const { data, error } = await client
    .from("students")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Siblings are resolved by family_id join only — never derived from rendered
// chip text. See §22 of Docs/Mockup/Mockup_User_Functionality.md (the
// chip-text-derived sibling list caused a duplication bug in the prototype).
//
// A student with NO family link has NO siblings. PostgREST's `eq` against
// a null value would otherwise match every other family-less row, so an
// orphan would appear as everyone else's sibling.
export async function siblingsOf(
  client: SupabaseClient,
  studentId: string,
): Promise<Student[]> {
  const student = await getStudent(client, studentId);
  if (!student || !student.family_id) return [];
  const { data, error } = await client
    .from("students")
    .select("*")
    .eq("family_id", student.family_id)
    .neq("id", studentId)
    .order("class", { ascending: true })
    .order("roll_no", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

// Returns the lowest positive integer not currently held by any roll_no
// in the class — including withdrawn students, whose rows stay on the
// register and keep occupying their roll. Only hard-deleted (typo-delete)
// or never-assigned slots become available, so a gap left by typo-deleting
// rolls 10 + 11 gets refilled in order on the next "+ New entry".
export async function nextRollFor(
  client: SupabaseClient,
  cls: string,
): Promise<number> {
  const { data, error } = await client
    .from("students")
    .select("roll_no")
    .eq("class", cls)
    .not("roll_no", "is", null);
  if (error) throw error;
  const taken = new Set<number>(
    (data ?? [])
      .map((r) => r.roll_no as number | null)
      .filter((n): n is number => typeof n === "number"),
  );
  let n = 1;
  while (taken.has(n)) n++;
  return n;
}

export async function searchFamilies(
  client: SupabaseClient,
  query: string,
): Promise<Family[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const escaped = q.replace(/([\\%_,])/g, "\\$1");
  const pattern = `%${escaped}%`;
  const { data, error } = await client
    .from("families")
    .select("*")
    .or(
      `father_name.ilike.${pattern},mother_name.ilike.${pattern},phone.ilike.${pattern}`,
    );
  if (error) throw error;
  return data ?? [];
}

export async function listActivePayments(
  client: SupabaseClient,
): Promise<Payment[]> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("status", "active");
  if (error) throw error;
  return data ?? [];
}

export async function getFeeStructure(
  client: SupabaseClient,
  cls: string,
): Promise<FeeStructure | null> {
  const { data, error } = await client
    .from("fee_structures")
    .select("*")
    .eq("class", cls)
    .maybeSingle();
  if (error) throw error;
  return data;
}

// Multi-class dashboard rollup needs every class's defaults at once.
export async function listFeeStructures(
  client: SupabaseClient,
): Promise<FeeStructure[]> {
  const { data, error } = await client.from("fee_structures").select("*");
  if (error) throw error;
  return data ?? [];
}

export interface FeeStructureInput {
  class: string;
  monthly_fee: number;
  annual_fee: number;
  sep_exam_fee: number;
  feb_exam_fee: number;
  misc_fee: number;
  effective_from?: string;
}

// Day 6 — upsert keyed on `class` (UNIQUE constraint from migration 0001).
// Past `payments` rows are unchanged (the spec is explicit: history is
// preserved on the ledger). The new defaults take effect on every
// non-override student's next expected/pending recompute.
export async function upsertFeeStructure(
  client: SupabaseClient,
  input: FeeStructureInput,
): Promise<FeeStructure> {
  const payload = {
    class: input.class,
    monthly_fee: input.monthly_fee,
    annual_fee: input.annual_fee,
    sep_exam_fee: input.sep_exam_fee,
    feb_exam_fee: input.feb_exam_fee,
    misc_fee: input.misc_fee,
    effective_from: input.effective_from ?? new Date().toISOString().slice(0, 10),
  };
  const { data, error } = await client
    .from("fee_structures")
    .upsert(payload, { onConflict: "class" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Dashboard helpers — Day 4. Settings is a key/value table seeded with
// `app_launched_at` (migration 0002) so the ROI tile has a date anchor.
export async function getSetting(
  client: SupabaseClient,
  key: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return data?.value ?? null;
}

export async function listRecentActivePayments(
  client: SupabaseClient,
  limit: number,
): Promise<Payment[]> {
  const { data, error } = await client
    .from("payments")
    .select("*")
    .eq("status", "active")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

// /transactions — windowed active-payments fetch. Date range is applied at
// the DB level (efficient); class / fee-head / name filters are composed
// client-side because the v1 dataset is small and filtering live keeps the
// chip-toggle UX instant. Sorted by paid_on desc so the client doesn't
// have to re-sort. `fromDate` / `toDate` are ISO YYYY-MM-DD strings.
export async function listActivePaymentsBetween(
  client: SupabaseClient,
  fromDate: string | null,
  toDate: string | null,
): Promise<Payment[]> {
  let query = client
    .from("payments")
    .select("*")
    .eq("status", "active")
    .order("paid_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (fromDate) query = query.gte("paid_on", fromDate);
  if (toDate) query = query.lte("paid_on", toDate);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// =============================================================================
// Write functions (Day 3 dialogs — PaymentModal + StudentProfileDialog).
// =============================================================================

export interface FamilyInput {
  father_name: string | null;
  mother_name: string | null;
  phone: string | null;
  address: string | null;
  p_dues?: number;
}

export async function createFamily(
  client: SupabaseClient,
  input: FamilyInput,
): Promise<Family> {
  const { data, error } = await client
    .from("families")
    .insert({
      father_name: input.father_name,
      mother_name: input.mother_name,
      phone: input.phone,
      address: input.address,
      p_dues: input.p_dues ?? 0,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateFamily(
  client: SupabaseClient,
  id: string,
  patch: Partial<FamilyInput>,
): Promise<Family> {
  const { data, error } = await client
    .from("families")
    .update(patch)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export interface StudentInput {
  family_id: string | null;
  name: string;
  class: string;
  roll_no?: number | null;
  dob?: string | null;
  date_of_admission?: string | null;
  aadhaar_no?: string | null;
  pen?: string | null;
  monthly_fee_override?: number | null;
  term_fees_override?: number | null;
  exam_fees_override?: number | null;
  concession_reason?: string | null;
}

// `name` is auto-uppercased to satisfy the students_name_upper_chk CHECK
// constraint (§3 of the tech spec). Callers shouldn't have to remember.
export async function createStudent(
  client: SupabaseClient,
  input: StudentInput,
): Promise<Student> {
  const roll =
    input.roll_no === undefined
      ? await nextRollFor(client, input.class)
      : input.roll_no;
  const { data, error } = await client
    .from("students")
    .insert({
      family_id: input.family_id,
      name: input.name.trim().toUpperCase(),
      class: input.class,
      roll_no: roll,
      dob: input.dob ?? null,
      date_of_admission: input.date_of_admission ?? null,
      aadhaar_no: input.aadhaar_no ?? null,
      pen: input.pen ?? null,
      monthly_fee_override: input.monthly_fee_override ?? null,
      term_fees_override: input.term_fees_override ?? null,
      exam_fees_override: input.exam_fees_override ?? null,
      concession_reason: input.concession_reason ?? null,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function updateStudent(
  client: SupabaseClient,
  id: string,
  patch: Partial<StudentInput>,
): Promise<Student> {
  const normalised =
    patch.name === undefined
      ? patch
      : { ...patch, name: patch.name.trim().toUpperCase() };
  const { data, error } = await client
    .from("students")
    .update(normalised)
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function linkStudentToFamily(
  client: SupabaseClient,
  studentId: string,
  familyId: string,
): Promise<void> {
  const { error } = await client
    .from("students")
    .update({ family_id: familyId })
    .eq("id", studentId);
  if (error) throw error;
}

// §22 — sets students.family_id to null so the profile re-shows the
// cyan search bar. The migration 0002_relax_family_id.sql relaxed the
// NOT NULL constraint to make this possible.
export async function unlinkStudent(
  client: SupabaseClient,
  studentId: string,
): Promise<void> {
  const { error } = await client
    .from("students")
    .update({ family_id: null })
    .eq("id", studentId);
  if (error) throw error;
}

export interface ConcessionInput {
  monthly_fee_override: number | null;
  term_fees_override: number | null;
  exam_fees_override: number | null;
  concession_reason: string | null;
}

// FB#7 / §11 — per-student override of monthly / term / exam fees, plus
// a free-text reason. `null` for an override means "use the class default".
export async function applyConcession(
  client: SupabaseClient,
  studentId: string,
  patch: ConcessionInput,
): Promise<void> {
  const { error } = await client
    .from("students")
    .update({
      monthly_fee_override: patch.monthly_fee_override,
      term_fees_override: patch.term_fees_override,
      exam_fees_override: patch.exam_fees_override,
      concession_reason: patch.concession_reason,
    })
    .eq("id", studentId);
  if (error) throw error;
}

export interface PaymentInput {
  family_id: string | null;
  student_id: string | null;
  fee_head: FeeHead;
  period: string | null;
  amount: number;
  paid_on: string;
  payment_mode: PaymentMode;
  notes?: string | null;
}

// Inserts an active payments row. Callers that target a term head
// (Annual / Sep Exam / Feb Exam) must void any existing active row for
// that (student_id, fee_head, period) tuple BEFORE calling this — the
// payments_term_head_per_student_unique_idx partial UNIQUE will otherwise
// reject the insert. family_id is nullable for orphan-student payments
// (payments.family_id was relaxed in migration 0004).
export async function createPayment(
  client: SupabaseClient,
  input: PaymentInput,
): Promise<Payment> {
  const { data, error } = await client
    .from("payments")
    .insert({
      family_id: input.family_id,
      student_id: input.student_id,
      fee_head: input.fee_head,
      period: input.period,
      amount: input.amount,
      paid_on: input.paid_on,
      payment_mode: input.payment_mode,
      notes: input.notes ?? null,
      status: "active",
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

// Voids every active payments row matching the (family, fee_head, period)
// triple — used before inserting a replacement for term heads where the
// partial UNIQUE index forbids two active rows.
//
// Annual / Sep Exam / Feb Exam moved to per-student post-migration 0004 so
// the partial UNIQUE is now keyed on student_id. Callers MUST pass
// student_id for those heads; family_id is still accepted for P.Dues /
// Misc cleanups.
export async function voidActivePayments(
  client: SupabaseClient,
  args: {
    family_id?: string | null;
    student_id?: string | null;
    fee_head: FeeHead;
    period: string | null;
  },
): Promise<void> {
  let query = client
    .from("payments")
    .update({ status: "void" })
    .eq("fee_head", args.fee_head)
    .eq("status", "active");
  if (args.student_id) query = query.eq("student_id", args.student_id);
  if (args.family_id) query = query.eq("family_id", args.family_id);
  if (args.period === null) {
    query = query.is("period", null);
  } else {
    query = query.eq("period", args.period);
  }
  const { error } = await query;
  if (error) throw error;
}
