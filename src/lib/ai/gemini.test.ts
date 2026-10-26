import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateReply, toContents } from "./gemini";

describe("toContents", () => {
  it("merges consecutive turns from the same role so roles alternate", () => {
    const out = toContents([
      { role: "user", text: "Ann: hi" },
      { role: "user", text: "Bob: hello" },
      { role: "model", text: "Hey both" },
      { role: "user", text: "Ann: thanks" },
    ]);
    expect(out.map((c) => c.role)).toEqual(["user", "model", "user"]);
    expect(out[0].parts[0].text).toBe("Ann: hi\nBob: hello");
  });
});

describe("generateReply", () => {
  beforeEach(() => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_MODEL", "test-model");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the key in a header (never the URL) and returns the text", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ candidates: [{ content: { parts: [{ text: " Hi there " }] } }] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateReply([{ role: "user", text: "Ann: hi" }])).toBe("Hi there");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain("test-model:generateContent");
    expect(url).not.toContain("test-key");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe("test-key");
    expect(JSON.parse(init.body as string).generationConfig.thinkingConfig).toEqual({ thinkingLevel: "minimal" });
  });

  it("retries once on a transient provider error, then succeeds", async () => {
    const ok = () => Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response("{}", { status: 503 })).mockResolvedValueOnce(ok());
    vi.stubGlobal("fetch", fetchMock);
    expect(await generateReply([{ role: "user", text: "x" }])).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry client errors", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateReply([{ role: "user", text: "x" }])).rejects.toThrow("400");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("throws on provider errors and on empty answers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    await expect(generateReply([{ role: "user", text: "x" }])).rejects.toThrow("429");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ candidates: [] })));
    await expect(generateReply([{ role: "user", text: "x" }])).rejects.toThrow();
  });

  it("refuses to run when Gemini is not configured", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expect(generateReply([{ role: "user", text: "x" }])).rejects.toThrow("not configured");
  });
});
