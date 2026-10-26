import { describe, expect, it } from "vitest";
import { AiError, toAiError } from "./errors";

describe("toAiError", () => {
  it("T4.3-4 maps 429 to quota", () => {
    expect(toAiError({ status: 429 }).category).toBe("quota");
  });
  it("maps aborts and 408/504 to timeout", () => {
    expect(toAiError(Object.assign(new Error("x"), { name: "AbortError" })).category).toBe("timeout");
    expect(toAiError(Object.assign(new Error("x"), { name: "TimeoutError" })).category).toBe("timeout");
    expect(toAiError({ status: 504 }).category).toBe("timeout");
  });
  it("maps other HTTP failures to provider and unknown errors to internal", () => {
    expect(toAiError({ status: 503 }).category).toBe("provider");
    expect(toAiError({ status: 400 }).category).toBe("provider");
    expect(toAiError(new Error("boom")).category).toBe("internal");
    expect(toAiError(null).category).toBe("internal");
  });
  it("keeps an AiError as it is", () => {
    const e = new AiError("safety");
    expect(toAiError(e)).toBe(e);
  });
  it("never carries provider text in the message", () => {
    expect(toAiError({ status: 503, message: "secret prompt text" }).message).not.toContain("secret");
  });
});
