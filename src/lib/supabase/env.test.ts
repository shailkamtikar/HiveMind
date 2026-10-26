import { afterEach, describe, expect, it, vi } from "vitest";
import { getSupabasePublicEnv } from "./env";

describe("getSupabasePublicEnv", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws when the URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "k");
    expect(() => getSupabasePublicEnv()).toThrow();
  });
  it("throws when the key is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    expect(() => getSupabasePublicEnv()).toThrow();
  });
  it("returns both when set", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "k");
    expect(getSupabasePublicEnv()).toEqual({ url: "https://x.supabase.co", anonKey: "k" });
  });
});
