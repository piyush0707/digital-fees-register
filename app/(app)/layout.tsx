import { TopNav } from "@/components/top-nav";
import { RecordSync } from "@/components/record-sync";
import { AutoRefresh } from "@/components/auto-refresh";

// Route group layout. Wraps every authenticated screen (Register, Dashboard,
// Transactions, and Fee-structure when it lands on Day 6) with the shared
// sticky TopNav. /login lives outside this group so it stays nav-free.
//
// AutoRefresh (Day 7b) listens for the offline-sync worker's "synced one
// or more entries" signal and calls router.refresh() debounced — so an
// offline write reconciles with the server snapshot the moment the queue
// drains, without a manual browser refresh.

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopNav />
      <RecordSync />
      <AutoRefresh />
      {/* Single <main> landmark per page — assistive tech uses it to skip
          past the nav. Screens render their existing <section> inside. */}
      <main>{children}</main>
    </>
  );
}
