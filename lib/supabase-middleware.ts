import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Day 7 perf pass: middleware no longer hits the Supabase Auth network on
// every navigation. We use `getClaims()` which validates the JWT locally
// against the project's JWKS (cached in-process after the first call) so
// the per-request cost drops from ~350-500ms (Mumbai round-trip) to
// effectively zero. Route protection is unchanged — RLS still validates
// every data query at the database layer, and any write that needs the
// freshest user state can still call `auth.getUser()` directly.
//
// `getSession()` is explicitly NOT used here because the SSR docs warn it
// returns unverified data; `getClaims()` is the documented swap-in.

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY",
    );
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const t0 = performance.now();
  const { data: claimsData } = await supabase.auth.getClaims();
  const dt = performance.now() - t0;
  if (process.env.MIDDLEWARE_TIMING === "1") {
    console.log(
      `[mw] getClaims pathname=${request.nextUrl.pathname} dt=${dt.toFixed(0)}ms claims=${claimsData?.claims ? "yes" : "no"}`,
    );
  }

  const hasValidSession = Boolean(claimsData?.claims);

  if (!hasValidSession && request.nextUrl.pathname !== "/login") {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
