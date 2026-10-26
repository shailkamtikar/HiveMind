import "server-only";
import { getConfig } from "@/lib/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateReply, type AiTurn } from "./gemini";

const FAILURE_NOTICE = "HiveMind couldn't reply just now. Send another message to try again.";

/**
 * Replies to the message at `triggerSeq`, using the last N messages up to it as context.
 * Interim version: Phase 4 replaces this with a durable one-at-a-time queue (ai_jobs).
 * A failure is recorded as a visible system notice instead of leaving the chat silent.
 */
export async function replyToMessage(groupId: string, triggerSeq: number) {
  const db = createAdminClient();
  const write = (type: "assistant" | "system", content: string) =>
    db.from("messages").insert({ group_id: groupId, sender_id: null, type, content: content.slice(0, 4000) });

  try {
    const { data, error } = await db
      .from("messages")
      .select("seq, sender_id, type, content")
      .eq("group_id", groupId)
      .lte("seq", triggerSeq)
      .neq("type", "system")
      .order("seq", { ascending: false })
      .limit(getConfig().aiContextMessages);
    if (error || !data?.length) throw new Error("context unavailable");

    const ids = [...new Set(data.map((m) => m.sender_id).filter((id): id is string => !!id))];
    const { data: profiles } = await db.from("profiles").select("id, display_name").in("id", ids);
    const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name as string]));

    const turns: AiTurn[] = data.reverse().map((m) =>
      m.type === "assistant"
        ? { role: "model", text: m.content }
        : { role: "user", text: `${(m.sender_id && names.get(m.sender_id)) || "Member"}: ${m.content}` },
    );
    await write("assistant", await generateReply(turns));
  } catch {
    await write("system", FAILURE_NOTICE);
  }
}
