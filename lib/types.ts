export type FamilyStatus = "active" | "withdrawn";
export type StudentStatus = "active" | "graduated" | "withdrawn";
export type PaymentStatus = "active" | "void";

export type FeeHead =
  | "Monthly"
  | "Annual"
  | "Sep Exam"
  | "Feb Exam"
  | "P.Dues"
  | "Misc";

export type PaymentMode = "Cash" | "Cheque" | "UPI" | "Bank Transfer";

export interface Family {
  id: string;
  father_name: string | null;
  mother_name: string | null;
  phone: string | null;
  address: string | null;
  p_dues: number;
  status: FamilyStatus;
  created_at: string;
  updated_at: string;
}

export interface Student {
  id: string;
  // Nullable post-migration 0002 so §22 Unlink can detach a student from
  // its family. A null here means the profile renders the cyan
  // "Already in the system?" search bar instead of the green banner.
  family_id: string | null;
  name: string;
  class: string;
  roll_no: number | null;
  dob: string | null;
  date_of_admission: string | null;
  aadhaar_no: string | null;
  pen: string | null;
  monthly_fee_override: number | null;
  term_fees_override: number | null;
  exam_fees_override: number | null;
  concession_reason: string | null;
  status: StudentStatus;
  created_at: string;
  updated_at: string;
}

export interface FeeStructure {
  id: string;
  class: string;
  monthly_fee: number;
  annual_fee: number;
  sep_exam_fee: number;
  feb_exam_fee: number;
  misc_fee: number;
  effective_from: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  // Nullable post-migration 0004 so orphan-student payments are allowed.
  family_id: string | null;
  student_id: string | null;
  fee_head: FeeHead;
  period: string | null;
  amount: number;
  paid_on: string;
  payment_mode: PaymentMode;
  reference_no: string | null;
  notes: string | null;
  status: PaymentStatus;
  created_at: string;
  updated_at: string;
}
