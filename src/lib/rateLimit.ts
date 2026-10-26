import "server-only";
import { json } from "@/lib/api/group";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";

export type RateBucket = "messages" | "ai";

/** Counts one request for this user. `user.id` must already be verified by the caller. */
export async function checkRateLimit(userId: string, bucket: RateBucket) {
  const cfg = getConfig();
  const max = bucket === "messages" ? cfg.messagesPerMinute : cfg.aiCallsPerMinute;
  const { data, error } = await createAdminClient().rpc("check_rate_limit", {
    p_user_id: userId,
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: 60,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    // The limiter is protection, not a feature: if it is unavailable, let the request through (and say so).
    console.warn("[rate-limit] unavailable, allowing request", { bucket });
    return { allowed: true as const, retryAfter: 0 };
  }
  return { allowed: row.allowed as boolean, retryAfter: row.retry_after as number };
}

/** Standard 429 answer, with Retry-After in seconds. */
export function tooManyRequests(retryAfter: number, what = "requests") {
  const res = json({ error: `Too many ${what}. Try again in ${retryAfter} seconds.`, retryAfter }, 429);
  res.headers.set("Retry-After", String(retryAfter));
  return res;
}
