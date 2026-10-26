import { describe, expect, it } from "vitest";
import { aiMode } from "./mode";

describe("aiMode", () => {
  it("defaults to live", () => {
    expect(aiMode({})).toBe("live");
    expect(aiMode({ AI_MODE: "whatever" })).toBe("live");
  });
  it("honours mock and off outside production", () => {
    expect(aiMode({ AI_MODE: "mock", NODE_ENV: "development" })).toBe("mock");
    expect(aiMode({ AI_MODE: "off" })).toBe("off");
  });
  it("T4.5-6 ignores mock in production", () => {
    expect(aiMode({ AI_MODE: "mock", NODE_ENV: "production" })).toBe("live");
  });
  it("still allows the off switch in production", () => {
    expect(aiMode({ AI_MODE: "off", NODE_ENV: "production" })).toBe("off");
  });
});
