"use client";

import { toast } from "sonner";

// WhatsApp send is v2. v1 renders the affordances and toasts a stub.

interface NotifyControlsProps {
  variant: "row" | "all";
  familyName: string;
  count: number;
}

export function NotifyControls({ variant, familyName, count }: NotifyControlsProps) {
  if (variant === "row") {
    return (
      <button
        type="button"
        className="notify-btn"
        title={`Send WhatsApp reminder to ${familyName}`}
        onClick={(e) => {
          e.stopPropagation();
          toast.success(
            `WhatsApp reminder sent · ${familyName} (v2 wires the real send)`,
          );
        }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      className="notify-all-btn"
      title="Notify all families with pending dues (WhatsApp broadcast)"
      aria-label="Notify all"
      onClick={() => {
        toast.success(
          `WhatsApp reminders sent to ${count} families (v2 wires the real send)`,
        );
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="m3 11 18-5v12L3 14v-3z" />
        <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
      </svg>
    </button>
  );
}
