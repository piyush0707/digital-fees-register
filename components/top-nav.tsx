"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { SyncBadge } from "@/components/sync-badge";

// Single shared top nav (lifted verbatim from #screen-register / #screen-dashboard
// / #screen-total-tx in Docs/Mockup/Digital_Fees_Register_UI_Mockup.html). Sticky
// to the top of the viewport; the page content scrolls under it.
//
// Structure:
//   LEFT  — emerald→green grad-cap mark + "School" / "Session 2026–27".
//           Text hides below the sm breakpoint (mobile-first PWA).
//   MID   — Register · Dashboard · Transactions tabs. Active tab is the green
//           pill (bg-emerald-50 / text-emerald-700). Inactive tabs are slate
//           with a hover wash. Horizontally scrollable on narrow viewports.
//   RIGHT — Sign out (always). On /dashboard, a compact ↻ Refresh icon-button
//           sits immediately to its left, preserving §D1 refresh behaviour.

const TABS = [
  { href: "/register", label: "Register" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/transactions", label: "Transactions" },
];

export function TopNav() {
  const pathname = usePathname() ?? "";
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const onDashboard = pathname.startsWith("/dashboard");

  async function onSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  function onRefresh() {
    setSpinning(true);
    router.refresh();
    toast.success("Dashboard refreshed");
    window.setTimeout(() => setSpinning(false), 600);
  }

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-9 h-9 bg-gradient-to-br from-emerald-500 to-green-700 rounded-lg flex items-center justify-center">
            <svg
              className="w-5 h-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3.2 1.8 8 12 12.8 22.2 8 12 3.2Z" />
              <path d="M5.6 10.2v4.4c0 1.7 2.9 3.1 6.4 3.1s6.4-1.4 6.4-3.1v-4.4" />
              <path d="M22.2 8v5" />
            </svg>
          </div>
          <div className="leading-tight hidden sm:block">
            <p className="font-semibold text-slate-900 text-sm">School</p>
            <p className="text-[11px] text-slate-500">Session 2026–27</p>
          </div>
        </div>

        <nav className="flex items-center gap-1 overflow-x-auto">
          {TABS.map((tab) => {
            const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={
                  "px-3 py-1.5 rounded-md text-sm whitespace-nowrap " +
                  (active
                    ? "font-semibold bg-emerald-50 text-emerald-700"
                    : "font-medium text-slate-600 hover:bg-slate-100")
                }
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-1.5 shrink-0">
          <SyncBadge />
          {onDashboard && (
            <button
              type="button"
              onClick={onRefresh}
              title="Refresh"
              className="w-8 h-8 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 text-base"
            >
              <span
                className="inline-block"
                style={{
                  transition: "transform 0.6s ease",
                  transform: spinning ? "rotate(360deg)" : "rotate(0)",
                }}
              >
                ↻
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            disabled={signingOut}
            className="text-xs px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-md text-slate-700 disabled:opacity-60"
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </div>
    </header>
  );
}
