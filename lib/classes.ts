// Canonical class identifier set — used by the register URL param
// (?class=<id>), the class picker, fee-structure modal, student/sibling
// dialogs, and the `students.class` / `fee_structures.class` columns.
//
// Same string everywhere — no abbreviations, no casing variants. Demo
// seed must use these exact values.

export const CLASS_LIST: readonly string[] = [
  "Nursery",
  "LKG",
  "UKG",
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;

export const DEFAULT_CLASS = "10";

// "Nursery" / "LKG" / "UKG" already read as a class name on their own;
// numbered classes get the "Class N" prefix. Matches the convention the
// student-profile dialog has always used.
export function formatClassLabel(cls: string): string {
  return cls === "Nursery" || cls === "LKG" || cls === "UKG"
    ? cls
    : `Class ${cls}`;
}

// Sanitises an arbitrary string (e.g. searchParams) to a known class id.
// Returns DEFAULT_CLASS for anything off-list or missing.
export function resolveClassParam(raw: string | undefined | null): string {
  if (!raw) return DEFAULT_CLASS;
  return (CLASS_LIST as readonly string[]).includes(raw) ? raw : DEFAULT_CLASS;
}
