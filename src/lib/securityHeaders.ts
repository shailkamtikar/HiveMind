/** Security headers for every response. Pure, so it can be unit tested and read by next.config.ts. */

export function contentSecurityPolicy({ isDev, supabaseUrl }: { isDev: boolean; supabaseUrl?: string }) {
  let supabaseHttp = "";
  let supabaseWs = "";
  try {
    if (supabaseUrl) {
      const u = new URL(supabaseUrl);
      supabaseHttp = u.origin;
      supabaseWs = `${u.protocol === "https:" ? "wss:" : "ws:"}//${u.host}`;
    }
  } catch {
    // An invalid URL simply leaves Supabase out of connect-src; the app would not work without it anyway.
  }

  const directives: Record<string, string[]> = {
    "default-src": ["'self'"],
    // Next.js adds small inline bootstrap scripts, so 'unsafe-inline' is needed until a nonce-based CSP is added.
    // Development also needs eval for hot reloading.
    "script-src": ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", supabaseHttp, supabaseWs, ...(isDev ? ["ws://localhost:*", "http://localhost:*"] : [])].filter(Boolean),
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "object-src": ["'none'"],
  };
  return Object.entries(directives)
    .map(([k, v]) => `${k} ${v.join(" ")}`)
    .join("; ");
}

export function securityHeaders(opts: { isDev: boolean; supabaseUrl?: string }) {
  return [
    // Not applied in development: the dev server's hot reloading depends on eval and its own websocket, and a
    // policy loose enough for that would test nothing. The real policy is exercised by the production-build
    // smoke test (tests/e2e/csp.spec.ts).
    ...(opts.isDev ? [] : [{ key: "Content-Security-Policy", value: contentSecurityPolicy(opts) }]),
    { key: "X-Content-Type-Options", value: "nosniff" },
    // Also production-only: the Next.js dev server renders pages in a frame to validate navigations, and a
    // frame-blocking header made it fall into a reload loop.
    ...(opts.isDev ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
    ...(opts.isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
