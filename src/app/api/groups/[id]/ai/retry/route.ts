import { after, type NextRequest } from "next/server";
import { authorizeGroup, json } from "@/lib/api/group";
import { processGroup } from "@/lib/ai/processor";
import { checkRateLimit, tooManyRequests } from "@/lib/rateLimit";
import { isUuid } from "@/lib/validation/group";

export const maxDuration = 120;

/**
 * Re-queues one failed AI job (at most 3 attempts per job). Any member of the group may do it.
 * The database does the checking under a row lock, so a double click or a race can queue it only once,
 * and the unique-reply rule means even a slow original attempt cannot add a second answer.
 */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/groups/[id]/ai/retry">) {
  const { id } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const jobId = (body as { jobId?: unknown } | null)?.jobId;
  if (typeof jobId !== "string" || !isUuid(jobId)) return json({ error: "A job id is required" }, 400);

  // The job must belong to this group (RLS also hides other groups' jobs from non-members).
  const { data: job } = await auth.supabase.from("ai_jobs").select("id").eq("id", jobId).eq("group_id", id).maybeSingle();
  if (!job) return json({ error: "Job not found" }, 404);

  // Counted only for well-formed requests that reach the database.
  const limit = await checkRateLimit(auth.user.id, "ai");
  if (!limit.allowed) return tooManyRequests(limit.retryAfter);

  const { data, error } = await auth.supabase.rpc("retry_job", { p_job_id: jobId });
  if (error) return json({ error: "Could not retry" }, 500);

  switch (data) {
    case "queued":
      after(() => processGroup(id).catch(() => undefined));
      return json({ status: "queued" });
    case "not_failed":
      return json({ error: "That message is not waiting for a retry", status: "not_failed" }, 409);
    case "limit":
      return json({ error: "This message has been retried too many times", status: "limit" }, 409);
    default:
      return json({ error: "Job not found" }, 404);
  }
}
