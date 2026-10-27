import { afterEach, describe, expect, it, vi } from "vitest";
import { siteUrl } from "./siteUrl";

afterEach(() => vi.unstubAllEnvs());

describe("siteUrl", () => {
  it("uses APP_BASE_URL when it is set, without a trailing slash", () => {
    vi.stubEnv("APP_BASE_URL", "https://hivemind.example.com/");
    expect(siteUrl("http://localhost:3000")).toBe("https://hivemind.example.com");
  });

  it("falls back to the address the request came in on", () => {
    vi.stubEnv("APP_BASE_URL", "");
    expect(siteUrl("https://preview-1.vercel.app/")).toBe("https://preview-1.vercel.app");
  });

  it("keeps a localhost setting during local development", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    expect(siteUrl("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("ignores a leftover localhost setting in production when the request came from a real domain", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3000");
    expect(siteUrl("https://hivemind.example.com")).toBe("https://hivemind.example.com");
  });

  it("still allows localhost in a production build that is being tested on this machine", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("APP_BASE_URL", "http://localhost:3300");
    expect(siteUrl("http://localhost:3300")).toBe("http://localhost:3300");
  });
});
