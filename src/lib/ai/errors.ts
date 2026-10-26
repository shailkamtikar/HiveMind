/** The only failure kinds the rest of the app ever sees; nothing provider-specific leaks past the adapter. */
export const AI_ERROR_CATEGORIES = ["quota", "timeout", "provider", "safety", "internal"] as const;
export type AiErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];

export class AiError extends Error {
  constructor(
    readonly category: AiErrorCategory,
    message?: string,
  ) {
    super(message ?? category);
    this.name = "AiError";
  }
}

/** Maps anything thrown while calling the provider onto one of the closed categories. */
export function toAiError(e: unknown): AiError {
  if (e instanceof AiError) return e;
  const err = e as { name?: string; status?: unknown; code?: unknown } | null;
  if (err?.name === "AbortError" || err?.name === "TimeoutError") return new AiError("timeout");
  const status = typeof err?.status === "number" ? err.status : typeof err?.code === "number" ? err.code : null;
  if (status === 429) return new AiError("quota");
  if (status === 408 || status === 504) return new AiError("timeout");
  if (status !== null) return new AiError("provider", `provider status ${status}`);
  return new AiError("internal");
}
