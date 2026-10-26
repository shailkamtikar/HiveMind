import type { NextRequest } from "next/server";
import { authorizeGroup, json } from "@/lib/api/group";
import { processGroup } from "@/lib/ai/processor";
import { checkRateLimit, tooManyRequests } from "@/lib/rateLimit";

// A pass can run several jobs; Vercel Hobby allows up to 300 s (docs/decisions/0001-ai-orchestration.md).
export const maxDuration = 120;

/**
 * Starts (or continues) processing this group's AI queue. Any member's browser may call it, which is how
 * a dropped request is recovered. Membership is checked with the caller's own session before the
 * server-side admin client is touched, and the admin client is scoped to this verified group only.
 */
export async function POST(_request: NextRequest, ctx: RouteContext<"/api/groups/[id]/ai/process">) {
  const { id } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;

  const limit = await checkRateLimit(auth.user.id, "ai");
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  try {
    const { processed, failed, more } = await processGroup(id);
    return json({ processed, failed, more });
  } catch {
    return json({ error: "Could not process the queue" }, 500);
  }
}
