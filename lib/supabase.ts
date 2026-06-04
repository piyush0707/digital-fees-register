import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
  );
}

declare global {
  var __dfr_supabase: SupabaseClient | undefined;
}

export const supabase: SupabaseClient =
  globalThis.__dfr_supabase ?? createBrowserClient(url, anonKey);

if (process.env.NODE_ENV !== "production") {
  globalThis.__dfr_supabase = supabase;
}
