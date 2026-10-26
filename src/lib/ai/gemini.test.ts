import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const generateContent = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  ThinkingLevel: { MINIMAL: "MINIMAL" },
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { generateReply, MAX_REPLY_CHARS } from "./gemini";

const turns = [{ role: "user" as const, text: "Ann: hi" }];
const ok = (text: string) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: "STOP" }] });

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODEL", "test-model");
  vi.stubEnv("AI_MODE", "live");
  generateContent.mockReset();
});
afterEach(() => vi.unstubAllEnvs());

describe("generateReply (live, SDK mocked)", () => {
  it("returns trimmed text and sends the model, system prompt, history and minimal thinking", async () => {
    generateContent.mockResolvedValue(ok("  Hello!  "));
    expect(await generateReply(turns)).toBe("Hello!");
    const arg = generateContent.mock.calls[0][0];
    expect(arg.model).toBe("test-model");
    expect(arg.contents).toEqual([{ role: "user", parts: [{ text: "Ann: hi" }] }]);
    expect(arg.config.systemInstruction).toContain("HiveMind");
    expect(arg.config.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
  });

  it("T4.3-4 maps a 429 to quota and does not retry", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("rate"), { status: 429 }));
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "quota" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("T4.3-5 maps a slow call to timeout", async () => {
    generateContent.mockImplementation(
      ({ config }) =>
        new Promise((_, reject) => {
          config.abortSignal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    );
    await expect(generateReply(turns, { timeoutMs: 100 })).rejects.toMatchObject({ category: "timeout" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("T4.3-6 maps a blocked prompt or a safety stop to safety", async () => {
    generateContent.mockResolvedValue({ promptFeedback: { blockReason: "SAFETY" } });
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "safety" });
    generateContent.mockResolvedValue({ candidates: [{ finishReason: "SAFETY" }] });
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "safety" });
  });

  it("T4.3-7 treats an empty answer as a provider failure", async () => {
    generateContent.mockResolvedValue(ok("   "));
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "provider" });
    generateContent.mockResolvedValue({ candidates: [] });
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "provider" });
  });

  it("T4.3-8 truncates oversize output to the database limit", async () => {
    generateContent.mockResolvedValue(ok("x".repeat(10_000)));
    expect((await generateReply(turns)).length).toBeLessThanOrEqual(MAX_REPLY_CHARS);
  });

  it("retries once on a provider (5xx) error, then succeeds", async () => {
    generateContent.mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 503 })).mockResolvedValueOnce(ok("fine"));
    expect(await generateReply(turns)).toBe("fine");
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("gives up after the single retry", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("busy"), { status: 503 }));
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "provider" });
    expect(generateContent).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    generateContent.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "provider" });
    expect(generateContent).toHaveBeenCalledTimes(1);
  });

  it("refuses to run unconfigured, and never echoes the key in errors", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const err = await generateReply(turns).catch((e) => e);
    expect(err.category).toBe("internal");
    expect(String(err.message)).not.toContain("test-key");
  });
});

describe("generateReply (mock mode)", () => {
  beforeEach(() => vi.stubEnv("AI_MODE", "mock"));

  it("answers deterministically without touching the SDK", async () => {
    expect(await generateReply([{ role: "user", text: "Ann: ping" }])).toBe("Mock reply to: ping");
    expect(generateContent).not.toHaveBeenCalled();
  });

  it("can simulate each failure category from the message text", async () => {
    for (const c of ["quota", "timeout", "provider", "safety", "internal"]) {
      await expect(generateReply([{ role: "user", text: `Ann: please [fail:${c}]` }])).rejects.toMatchObject({ category: c });
    }
  });

  it("is ignored in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateReply(turns)).rejects.toMatchObject({ category: "internal" }); // fell through to live, unconfigured
  });
});
