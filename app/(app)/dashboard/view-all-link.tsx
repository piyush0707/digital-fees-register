"use client";

import Link from "next/link";

// Lives inside <summary>; clicks must not toggle the parent <details>.
export function ViewAllLink() {
  return (
    <Link
      href="/transactions"
      className="view-all-tx-btn"
      title="Open Total Transactions"
      onClick={(e) => e.stopPropagation()}
    >
      View all transactions
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 17 17 7" />
        <path d="M7 7h10v10" />
      </svg>
    </Link>
  );
}
