"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CLASS_LIST, formatClassLabel } from "@/lib/classes";

// Single-class pill + dropdown of all 13 classes (§9 of the mockup
// functionality doc). The demo build activates EVERY class — selecting one
// navigates to /register?class=<id> and the server page re-renders that
// class's roster. Same pill + dropdown markup the mockup ships; only the
// "v2" disabled state from the original v1 scope is gone.

export function ClassPicker({ currentClass }: { currentClass: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      document.body.classList.remove("dropdown-open");
      return;
    }

    document.body.classList.add("dropdown-open");

    const btn = buttonRef.current;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      setMenuPos({ top: rect.bottom + 4, left: rect.left });
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    document.addEventListener("keydown", handleKey);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.body.classList.remove("dropdown-open");
      document.removeEventListener("keydown", handleKey);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  function handleSelect(cls: string) {
    setOpen(false);
    if (cls === currentClass) return;
    // Preserve other query params (e.g. ?highlight=<id> from §D3); only
    // swap the class slot. router.push pushes a new history entry so the
    // browser back button still walks classes.
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("class", cls);
    router.push(`/register?${params.toString()}`);
  }

  return (
    <div className="class-picker">
      <button
        ref={buttonRef}
        type="button"
        className={"class-picker-btn" + (open ? " is-open" : "")}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{formatClassLabel(currentClass)}</span>
        <svg
          className="w-3 h-3 text-white"
          viewBox="0 0 12 8"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M1 1l5 5 5-5"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && menuPos && (
        <div
          ref={menuRef}
          className="class-picker-menu"
          role="listbox"
          style={{ top: menuPos.top, left: menuPos.left }}
        >
          {CLASS_LIST.map((cls) => (
            <button
              key={cls}
              type="button"
              role="option"
              aria-selected={cls === currentClass}
              className={
                "class-picker-menu-item" +
                (cls === currentClass ? " is-active" : "")
              }
              onClick={() => handleSelect(cls)}
            >
              <span>{formatClassLabel(cls)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
