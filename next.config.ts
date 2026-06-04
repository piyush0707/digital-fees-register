import type { NextConfig } from "next";

// Baseline security headers applied to every response. Conservative set
// chosen pre-deploy so the demo doesn't ship hardening regressions:
//
//   Referrer-Policy             — strip referrer to origin on cross-origin,
//                                 keep full referrer same-origin.
//   X-Content-Type-Options      — disable MIME sniffing.
//   X-Frame-Options             — refuse to be iframed anywhere
//                                 (clickjacking).
//   Permissions-Policy          — explicitly deny camera/microphone/
//                                 geolocation; the register has no use for
//                                 them.
//
// NOT YET added (v1.1 hardening item):
//   Content-Security-Policy     — a strict CSP for a Next.js app needs
//                                 per-request nonces (next/script + the
//                                 framework's inline bootstrap) AND must
//                                 allowlist Supabase Realtime's
//                                 wss://*.supabase.co origin. Doing this
//                                 well takes a dedicated pass; doing it
//                                 badly breaks realtime payments + the
//                                 hydration script. Defer until after the
//                                 demo so we can test it end-to-end.

const SECURITY_HEADERS = [
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
