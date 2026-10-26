import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { toAiError } from "./errors";
import { generateReply } from "./gemini";
import { aiMode } from "./mode";
import { buildTurns, type AiTurn, type PromptMessage } from "./prompt";

export type ProcessResult = {
  processed: number;
  failed: number;
  /** True when queued work remained after the time budget ran out; the caller (or the next page load) continues. */
  more: boolean;
  skipped?: "off";
};

type Generate = (turns: AiTurn[]) => Promise<string>;

type Options = {
  /** Replaceable in tests. */
  generate?: Generate;
  db?: SupabaseClient;
  /** Stop starting new jobs after this long. A job already running may take up to the provider timeout more. */
  budgetMs?: number;
};

const DEFAULT_BUDGET_MS = 45_000;

/**
 * Works through one group's queue, one job at a time, oldest message first.
 * Safe to call from many places at once: the database hands a job to exactly one caller, and a reply
 * can only be stored once per job. Callers must already have verified the user may act on this group.
 * This and the admin client are the only code that uses the service-role key.
 */
export async function processGroup(groupId: string, opts: Options = {}): Promise<ProcessResult> {
  if (aiMode() === "off") return { processed: 0, failed: 0, more: false, skipped: "off" };

  const db = opts.db ?? createAdminClient();
  const generate = opts.generate ?? ((turns) => generateReply(turns));
  const budget = opts.budgetMs ?? DEFAULT_BUDGET_MS;
  const started = Date.now();
  const result: ProcessResult = { processed: 0, failed: 0, more: false };

  for (;;) {
    if (Date.now() - started >= budget) {
      const { count } = await db
        .from("ai_jobs")
        .select("id", { count: "exact", head: true })
        .eq("group_id", groupId)
        .eq("status", "queued");
      result.more = (count ?? 0) > 0;
      return result;
    }

    const { data, error } = await db.rpc("claim_next_job", { p_group_id: groupId });
    if (error) throw new Error("could not claim a job");
    const job = (Array.isArray(data) ? data[0] : data) as
      | { job_id: string; trigger_message_id: string; trigger_seq: number; attempts: number }
      | null
      | undefined;
    if (!job) return result; // nothing queued, or another worker is already on this group

    try {
      const reply = await generate(await promptFor(db, groupId, job.trigger_seq));
      const { data: stored, error: completeError } = await db.rpc("complete_job", {
        p_job_id: job.job_id,
        p_content: reply,
      });
      if (completeError) throw completeError;
      // false means someone else already finished this job; nothing was stored twice.
      if (stored) result.processed++;
    } catch (e) {
      const category = toAiError(e).category;
      // Categories only: prompts and replies never go to the log.
      console.warn("[ai] job failed", { category, attempt: job.attempts });
      await db.rpc("fail_job", { p_job_id: job.job_id, p_category: category });
      result.failed++;
    }
  }
}

async function promptFor(db: SupabaseClient, groupId: string, triggerSeq: number) {
  const limit = getConfig().aiContextMessages;
  const { data, error } = await db
    .from("messages")
    .select("seq, sender_id, type, content")
    .eq("group_id", groupId)
    .lte("seq", triggerSeq)
    .order("seq", { ascending: false })
    .limit(limit * 2); // headroom for system notices, which are not part of the model's view
  if (error || !data?.length) throw new Error("context unavailable");

  const ids = [...new Set(data.map((m) => m.sender_id).filter((id): id is string => !!id))];
  const { data: profiles } = ids.length
    ? await db.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as { id: string; display_name: string }[] };
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string]));

  return buildTurns(data as PromptMessage[], names, { triggerSeq, limit });
}
