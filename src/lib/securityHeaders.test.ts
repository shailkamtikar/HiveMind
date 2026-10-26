import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./securityHeaders";

const supabaseUrl = "https://abcd.supabase.co";

describe("contentSecurityPolicy", () => {
  const prod = contentSecurityPolicy({ isDev: false, supabaseUrl });
  const dev = contentSecurityPolicy({ isDev: true, supabaseUrl });

  it("only allows the app itself plus the Supabase project for connections", () => {
    expect(prod).toContain("default-src 'self'");
    expect(prod).toContain("connect-src 'self' https://abcd.supabase.co wss://abcd.supabase.co");
    expect(prod).not.toContain("localhost");
  });
  it("forbids framing, plugins and foreign form targets", () => {
    expect(prod).toContain("frame-ancestors 'none'");
    expect(prod).toContain("object-src 'none'");
    expect(prod).toContain("form-action 'self'");
    expect(prod).toContain("base-uri 'self'");
  });
  it("allows eval and local websockets only in development", () => {
    expect(prod).not.toContain("unsafe-eval");
    expect(dev).toContain("'unsafe-eval'");
    expect(dev).toContain("ws://localhost:*");
  });
  it("survives a missing or invalid Supabase URL", () => {
    expect(contentSecurityPolicy({ isDev: false })).toContain("connect-src 'self'");
    expect(contentSecurityPolicy({ isDev: false, supabaseUrl: "not a url" })).toContain("connect-src 'self'");
  });
});

describe("securityHeaders", () => {
  const names = (isDev: boolean) => securityHeaders({ isDev, supabaseUrl }).map((h) => h.key);
  it("T5.4-6 sets the standard set", () => {
    expect(names(false)).toEqual(
      expect.arrayContaining(["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Permissions-Policy"]),
    );
    expect(names(true)).toEqual(expect.arrayContaining(["X-Content-Type-Options", "Referrer-Policy"]));
  });
  it("applies the CSP and frame blocking only to production builds", () => {
    expect(names(false)).toContain("Content-Security-Policy");
    expect(names(true)).not.toContain("Content-Security-Policy");
    expect(names(false)).toContain("X-Frame-Options");
    expect(names(true)).not.toContain("X-Frame-Options");
    expect(names(true)).not.toContain("Permissions-Policy");
  });
  it("adds HSTS only outside development", () => {
    expect(names(false)).toContain("Strict-Transport-Security");
    expect(names(true)).not.toContain("Strict-Transport-Security");
  });
});
