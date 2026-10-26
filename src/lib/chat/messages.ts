import type { ChatMessage, ServerMessage } from "./types";

/**
 * Merges server messages into the current list.
 * - Deduplicates by id (a realtime event, a history fetch and a send response can all carry the same message).
 * - A server copy replaces a pending/failed local copy with the same id.
 * - Confirmed messages are ordered by seq; pending ones sit after them in the order they were created.
 */
export function mergeMessages(current: ChatMessage[], incoming: ServerMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const m of current) byId.set(m.id, m);
  for (const m of incoming) {
    const existing = byId.get(m.id);
    byId.set(m.id, {
      ...m,
      sender_name: m.sender_name ?? existing?.sender_name ?? null,
      status: "sent",
    });
  }
  return sortMessages([...byId.values()]);
}

export function sortMessages(list: ChatMessage[]): ChatMessage[] {
  const sent = list.filter((m) => m.seq !== null).sort((a, b) => a.seq! - b.seq!);
  const pending = list
    .filter((m) => m.seq === null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return [...sent, ...pending];
}

export function toChatMessage(m: ServerMessage): ChatMessage {
  return { ...m, status: "sent" };
}

/** Highest confirmed seq in the list, or 0 when there is none. */
export function lastSeq(list: ChatMessage[]): number {
  let max = 0;
  for (const m of list) if (m.seq !== null && m.seq > max) max = m.seq;
  return max;
}
