export type AiMode = "live" | "mock" | "off";

/**
 * How AI replies are produced:
 *  - live (default): the real Gemini API
 *  - mock: deterministic canned replies, for automated tests only; ignored when NODE_ENV=production
 *  - off: no processing at all (jobs stay queued); also usable as a kill switch
 */
export function aiMode(env: Record<string, string | undefined> = process.env): AiMode {
  if (env.AI_MODE === "off") return "off";
  if (env.AI_MODE === "mock" && env.NODE_ENV !== "production") return "mock";
  return "live";
}
