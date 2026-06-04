"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LastSyncIndicator } from "./last-sync-indicator";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@school.com");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }
    router.push("/register");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-16 bg-gradient-to-br from-slate-50 to-indigo-50">
      <div className="bg-white shadow-xl rounded-2xl p-8 w-full max-w-sm border border-slate-200">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto bg-gradient-to-br from-emerald-500 to-green-700 rounded-2xl flex items-center justify-center mb-3 shadow-lg">
            <svg
              className="w-9 h-9 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3.2 1.8 8 12 12.8 22.2 8 12 3.2Z" />
              <path d="M5.6 10.2v4.4c0 1.7 2.9 3.1 6.4 3.1s6.4-1.4 6.4-3.1v-4.4" />
              <path d="M22.2 8v5" />
              <circle
                cx="22.2"
                cy="14"
                r="0.9"
                fill="currentColor"
                stroke="none"
              />
            </svg>
          </div>
          <h3 className="font-semibold text-slate-900">Digital Fees Register</h3>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <Label
            htmlFor="email"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-10 mb-3 px-3 py-2.5 text-sm rounded-lg border-slate-300 bg-white focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200"
          />

          <Label
            htmlFor="password"
            className="block text-sm font-medium text-slate-700 mb-1.5"
          >
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-10 mb-5 px-3 py-2.5 text-sm rounded-lg border-slate-300 bg-white focus-visible:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-200"
          />

          {error && (
            <p
              role="alert"
              className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full h-10 py-2.5 rounded-lg font-medium text-sm shadow-sm text-white bg-gradient-to-br from-emerald-500 to-green-700 hover:from-emerald-600 hover:to-green-800"
          >
            {loading ? "Signing in…" : "Sign in"}
          </Button>
        </form>

        <div className="mt-5 pt-5 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            Online
          </span>
          <LastSyncIndicator />
        </div>
      </div>
    </main>
  );
}
