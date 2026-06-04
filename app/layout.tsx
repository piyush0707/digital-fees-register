import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "Digital Fees Register",
  description: "Digital fees register",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        {/*
          Toast styling lifted from the mockup CSS: bottom-centered solid
          colored pill, white text, no icon, no close ×. Type-keyed colours:
            • default / success / info → #16a34a green
            • warning                  → #d97706 amber
            • error                    → #dc2626 red
          richColors is OFF and closeButton is OFF because the mockup
          toasts don't have either — they're a single-line pill that auto-
          dismisses. Per-toast `className` can still override (the row
          delete toast uses `mockup-toast-delete` for the red Undo pill).
        */}
        <Toaster
          position="bottom-center"
          toastOptions={{
            classNames: {
              toast: "mockup-toast",
              success: "mockup-toast-success",
              info: "mockup-toast-info",
              warning: "mockup-toast-warning",
              error: "mockup-toast-error",
              default: "mockup-toast-default",
            },
          }}
        />
      </body>
    </html>
  );
}
