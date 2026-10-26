import type { SupabaseClient } from "@supabase/supabase-js";
import type { ServerMessage } from "./types";

const COLUMNS = "id, seq, group_id, sender_id, type, content, created_at";

export type HistoryPage = { messages: ServerMessage[]; hasMore: boolean };

/**
 * Loads a page of history through the caller's own (RLS-protected) client.
 * - default: the newest `limit` messages
 * - before: the `limit` messages just older than that seq
 * - after: up to `limit` messages newer than that seq (used to fill gaps after a reconnect)
 * Messages are always returned oldest-first. `hasMore` means more exist beyond the page
 * in the direction that was requested (older for default/before, newer for after).
 */
export async function fetchMessagesPage(
  supabase: SupabaseClient,
  groupId: string,
  opts: { before?: number; after?: number; limit?: number } = {},
): Promise<HistoryPage> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 200);

  let query = supabase.from("messages").select(COLUMNS).eq("group_id", groupId);
  if (opts.after !== undefined) {
    query = query.gt("seq", opts.after).order("seq", { ascending: true });
  } else {
    if (opts.before !== undefined) query = query.lt("seq", opts.before);
    query = query.order("seq", { ascending: false });
  }
  // One extra row tells us whether another page exists.
  const { data, error } = await query.limit(limit + 1);
  if (error) throw new Error("Could not load messages");

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  if (opts.after === undefined) page.reverse();

  const senderIds = [...new Set(page.map((m) => m.sender_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (senderIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", senderIds);
    for (const p of profiles ?? []) names.set(p.id, p.display_name);
  }

  const messages: ServerMessage[] = page.map((m) => ({
    ...m,
    sender_name: m.sender_id ? (names.get(m.sender_id) ?? null) : null,
  }));
  return { messages, hasMore };
}
