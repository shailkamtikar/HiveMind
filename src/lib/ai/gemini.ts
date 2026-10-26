import "server-only";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { AiError, toAiError, type AiErrorCategory } from "./errors";
import { aiMode } from "./mode";
import { SYSTEM_PROMPT, type AiTurn } from "./prompt";

export const MAX_REPLY_CHARS = 4000;
const DEFAULT_TIMEOUT_MS = 25_000;

type Options = { timeoutMs?: number; signal?: AbortSignal };

/** Messages already seen by a "[fail-once:...]" request, so the second attempt can succeed. */
const failedOnce = new Set<string>();

/** Deterministic stand-in for Gemini, used only when AI_MODE=mock (never in production). */
async function mockReply(turns: AiTurn[], signal: AbortSignal): Promise<string> {
  const last = [...turns].reverse().find((t) => t.role === "user")?.text ?? "";
  const body = last.replace(/^[^:]*:\s*/, "");
  const failure = /\[fail:(quota|timeout|provider|safety|internal)\]/.exec(body);
  const delay = Number(process.env.AI_MOCK_DELAY_MS ?? 0);
  if (delay > 0) {
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, delay);
      signal.addEventListener("abort", () => {
        clearTimeout(t);
        reject(new AiError("timeout"));
      });
    });
  }
  if (failure) throw new AiError(failure[1] as AiErrorCategory);
  const once = /\[fail-once:(quota|timeout|provider|safety|internal)\]/.exec(body);
  if (once && !failedOnce.has(body)) {
    failedOnce.add(body);
    throw new AiError(once[1] as AiErrorCategory);
  }
  return `Mock reply to: ${body}`;
}

/**
 * Asks Gemini for the next reply. Every failure is thrown as an AiError with a closed category.
 * Server-only: the API key never reaches the browser bundle.
 */
export async function generateReply(turns: AiTurn[], opts: Options = {}): Promise<string> {
  const signal = opts.signal ?? AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  if (aiMode() === "mock") return clamp(await mockReply(turns, signal));

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) throw new AiError("internal", "Gemini is not configured");
  if (!turns.length) throw new AiError("internal", "nothing to reply to");

  const ai = new GoogleGenAI({ apiKey });
  const call = () =>
    ai.models.generateContent({
      model,
      contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
      config: {
        systemInstruction: SYSTEM_PROMPT,
        maxOutputTokens: 800,
        temperature: 0.8,
        // Minimal thinking keeps replies to a second or two; the default can take 30 s or more.
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        abortSignal: signal,
      },
    });

  let response;
  try {
    try {
      response = await call();
    } catch (e) {
      // One immediate retry for the provider's brief "high demand" 503s; quota and timeouts never retry.
      const status = (e as { status?: unknown } | null)?.status;
      if (typeof status !== "number" || status < 500 || status === 504 || signal.aborted) throw e;
      response = await call();
    }
  } catch (e) {
    throw toAiError(e);
  }

  if (response.promptFeedback?.blockReason) throw new AiError("safety");
  const candidate = response.candidates?.[0];
  if (candidate?.finishReason && /SAFETY|PROHIBITED|BLOCKLIST|SPII|RECITATION/i.test(String(candidate.finishReason))) {
    throw new AiError("safety");
  }
  const text = (candidate?.content?.parts ?? [])
    .map((p) => p.text ?? "")
    .join("")
    .trim();
  if (!text) throw new AiError("provider", "empty reply");
  return clamp(text);
}

function clamp(text: string) {
  return text.length > MAX_REPLY_CHARS ? text.slice(0, MAX_REPLY_CHARS - 1) + "…" : text;
}
