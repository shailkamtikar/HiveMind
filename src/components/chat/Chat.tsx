"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { mergeMessages, sortMessages, toChatMessage } from "@/lib/chat/messages";
import type { ChatMessage, ServerMessage } from "@/lib/chat/types";
import { Composer } from "./Composer";
import { MessageItem } from "./MessageItem";

type Props = {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ServerMessage[];
  initialHasMore: boolean;
  maxLength: number;
};

export function Chat({ groupId, currentUserId, currentUserName, initialMessages, initialHasMore, maxLength }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map(toChatMessage));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Messages present at page load do not animate; only later arrivals do.
  const [initialIds] = useState(() => new Set(initialMessages.map((m) => m.id)));
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const prevHeight = useRef<number | null>(null);

  // Keep the view pinned to the newest message, or hold position when older messages are prepended.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (prevHeight.current !== null) {
      el.scrollTop += el.scrollHeight - prevHeight.current;
      prevHeight.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages]);

  function onScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  const post = useCallback(
    async (id: string, content: string) => {
      try {
        const res = await fetch(`/api/groups/${groupId}/messages`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, content }),
        });
        const body = await res.json().catch(() => ({}));
        if (res.ok && body.message) {
          setMessages((cur) => mergeMessages(cur, [body.message as ServerMessage]));
          return;
        }
        const text =
          res.status === 400 && typeof body.error === "string"
            ? body.error
            : res.status === 401
              ? "You were signed out. Sign in again to send."
              : "Couldn't send. Check your connection and retry.";
        setMessages((cur) =>
          cur.map((m) => (m.id === id ? { ...m, status: "failed" as const, errorText: text } : m)),
        );
      } catch {
        setMessages((cur) =>
          cur.map((m) =>
            m.id === id ? { ...m, status: "failed" as const, errorText: "Couldn't send. Check your connection and retry." } : m,
          ),
        );
      }
    },
    [groupId],
  );

  const send = useCallback(
    (content: string) => {
      const id = crypto.randomUUID();
      stickToBottom.current = true;
      setMessages((cur) =>
        sortMessages([
          ...cur,
          {
            id,
            seq: null,
            group_id: groupId,
            sender_id: currentUserId,
            type: "user",
            content,
            created_at: new Date().toISOString(),
            sender_name: currentUserName,
            status: "sending",
          },
        ]),
      );
      void post(id, content);
    },
    [groupId, currentUserId, currentUserName, post],
  );

  function retry(id: string) {
    const failed = messages.find((m) => m.id === id && m.status === "failed");
    if (!failed) return;
    setMessages((cur) =>
      cur.map((m) => (m.id === id ? { ...m, status: "sending" as const, errorText: undefined } : m)),
    );
    // The same id is reused, so a retry can never create a second copy.
    void post(id, failed.content);
  }

  async function loadOlder() {
    const oldest = messages.find((m) => m.seq !== null)?.seq;
    if (oldest == null || loadingOlder) return;
    setLoadingOlder(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/messages?before=${oldest}&limit=30`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { messages: ServerMessage[]; hasMore: boolean };
      prevHeight.current = listRef.current?.scrollHeight ?? null;
      stickToBottom.current = false;
      setMessages((cur) => mergeMessages(cur, body.messages));
      setHasMore(body.hasMore);
    } catch {
      setLoadError("Couldn't load earlier messages.");
    } finally {
      setLoadingOlder(false);
    }
  }

  return (
    <div className="flex h-[min(70dvh,40rem)] min-h-[24rem] flex-col rounded-[var(--radius)] border border-border bg-surface">
      <div ref={listRef} onScroll={onScroll} className="flex-1 overflow-y-auto p-4" data-testid="message-list">
        {hasMore && (
          <div className="mb-3 text-center">
            <button
              type="button"
              onClick={loadOlder}
              disabled={loadingOlder}
              className="font-mono text-[11px] uppercase tracking-wide text-muted underline-offset-4 hover:text-foreground hover:underline disabled:opacity-60"
            >
              {loadingOlder ? "Loading…" : "Load earlier messages"}
            </button>
          </div>
        )}
        {loadError && (
          <p role="alert" className="mb-3 text-center text-sm text-danger">
            {loadError}
          </p>
        )}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <p className="font-display text-2xl">No messages yet</p>
            <p className="text-sm text-muted">Say hello to start the conversation.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3" aria-label="Messages" aria-live="polite">
            {messages.map((m) => (
              <MessageItem
                key={m.id}
                message={m}
                isOwn={m.sender_id === currentUserId}
                animate={!initialIds.has(m.id)}
                onRetry={retry}
              />
            ))}
          </ul>
        )}
      </div>
      <Composer maxLength={maxLength} onSend={send} />
    </div>
  );
}
