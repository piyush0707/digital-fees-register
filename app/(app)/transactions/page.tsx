import { TransactionsClient } from "./transactions-client";

// Body only. The shared sticky top nav (Register / Dashboard / Transactions
// tabs + Sign out) is supplied by app/(app)/layout.tsx and inherits here,
// so this page renders KPI tiles → filter bar → table directly below the
// nav. No per-screen top bar, no back-to-dashboard button.
//
// All data + realtime live in TransactionsClient because the page is fully
// interactive (window chips, date range, class / fee-head / search filters,
// realtime subscription on `payments`). The browser Supabase client is
// authenticated via the session cookie that middleware refreshes, so RLS
// allows the SELECT.

export const dynamic = "force-dynamic";

export default function TransactionsPage() {
  return <TransactionsClient />;
}
