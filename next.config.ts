import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // Tests run a second server with its own build folder so it never clashes with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  // Invitation tokens live in these URLs, so other sites must never receive them as a Referer.
  async headers() {
    return [
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
