import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/securityHeaders";

const nextConfig: NextConfig = {
  /* config options here */
  // Tests run a second server with its own build folder so it never clashes with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Development only: do not auto-validate every page for "instant navigation". The signed-in pages are
  // inherently dynamic (they redirect or 404 based on the session), and the automatic validation renders
  // them without one, which logged errors and made fresh dev servers reload pages repeatedly.
  experimental: { instantInsights: { validationLevel: "manual-warning" } },
  // Invitation tokens live in these URLs, so other sites must never receive them as a Referer.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          isDev: process.env.NODE_ENV !== "production",
          supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        }),
      },
      // These come after the general rule so they win for the same header.
      { source: "/join/:path*", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/login", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
