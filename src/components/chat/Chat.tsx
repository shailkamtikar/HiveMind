"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { lastSeq, mergeMessages, sortMessages, toChatMessage } from "@/lib/chat/messages";
import type { ChatMessage, ClientJob, ServerMessage } from "@/lib/chat/types";
import { AiFailedNotice } from "./AiFailedNotice";
import { Composer } from "./Composer";
import { ConnectionBanner, type ConnectionState } from "./ConnectionBanner";
import { MessageItem } from "./MessageItem";
import { useRealtimeMessages } from "./useRealtimeMessages";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

type Props = {
  groupId: string;
  currentUserId: string;
  currentUserName: string;
  initialMessages: ServerMessage[];
  initialHasMore: boolean;
  /** AI jobs that are queued, processing or failed when the page loaded. */
  initialJobs: ClientJob[];
  maxLength: number;
  /** user id -> display name for current members */
  memberNames: Record<string, string>;
};

export function Chat({
  groupId,
  currentUserId,
  currentUserName,
  initialMessages,
  initialHasMore,
  initialJobs,
  maxLength,
  memberNames,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map(toChatMessage));
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [socket, setSocket] = useState<"connecting" | "connected" | "reconnecting">("connecting");
  const online = useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
  const messagesRef = useRef(messages);
  const gap = useRef({ running: false, again: false });

  // Messages present at page load do not animate; only later arrivals do.
  const [initialIds] = useState(() => new Set(initialMessages.map((m) => m.id)));
  // AI job state per trigger message. Events and fetches only ever move a job forward, never back.
  const [jobs, setJobs] = useState<Map<string, ClientJob>>(() => new Map(initialJobs.map((j) => [j.trigger_message_id, j])));
  const activeJobs = [...jobs.values()].filter((j) => j.status === "queued" || j.status === "processing");
  const thinking = activeJobs.length > 0;
  const waitingCount = activeJobs.length;
  const kicking = useRef(false);
  const names = useRef(new Map(Object.entries({ ...memberNames, [currentUserId]: currentUserName })));
  // Sends go out one at a time so a member's own messages are stored in the order they typed them.
  const sendQueue = useRef<Promise<void>>(Promise.resolve());
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
  }, [messages, waitingCount]);

  function onScroll() {
    const el = listRef.current;
    if (el) stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  const mergeJobs = useCallback((incoming: ClientJob[]) => {
    setJobs((cur) => {
      const next = new Map(cur);
      for (const j of incoming) {
        const known = next.get(j.trigger_message_id);
        // A finished job is never reopened by a late, older event.
        if (known && (known.status === "succeeded" || known.status === "failed") && (j.status === "queued" || j.status === "processing")) continue;
        next.set(j.trigger_message_id, j);
      }
      return next;
    });
  }, []);

  // Asks the server to work on this group's queue. Any member may do this; the database makes sure only one
  // worker runs at a time, so extra kicks are harmless. This also recovers from a request that was dropped.
  const kick = useCallback(async () => {
    if (kicking.current) return;
    kicking.current = true;
    try {
      await fetch(`/api/groups/${groupId}/ai/process`, { method: "POST" });
    } catch {
      // Offline or failed: the next kick (page load, reconnect, or the recovery timer) tries again.
    } finally {
      kicking.current = false;
    }
  }, [groupId]);

  const refreshJobs = useCallback(async () => {
    const { data } = await createClient()
      .from("ai_jobs")
      .select("id, trigger_message_id, status, error_category")
      .eq("group_id", groupId)
      .in("status", ["queued", "processing", "failed"])
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) mergeJobs(data as ClientJob[]);
  }, [groupId, mergeJobs]);

  // Live delivery. Events can arrive twice or out of order; mergeMessages dedupes by id and sorts by seq.
  const resolveName = useCallback(async (userId: string) => {
    const { data } = await createClient().from("profiles").select("display_name").eq("id", userId).maybeSingle();
    const name = data?.display_name;
    if (!name) return;
    names.current.set(userId, name);
    setMessages((cur) => cur.map((m) => (m.sender_id === userId && !m.sender_name ? { ...m, sender_name: name } : m)));
  }, []);

  // Anything that happened while we were disconnected is fetched from the database, newest-known seq onwards.
  const fillGap = useCallback(async () => {
    if (gap.current.running) {
      gap.current.again = true;
      return;
    }
    gap.current.running = true;
    void refreshJobs();
    try {
      do {
        gap.current.again = false;
        let more = true;
        while (more) {
          const res = await fetch(`/api/groups/${groupId}/messages?after=${lastSeq(messagesRef.current)}&limit=200`);
          if (!res.ok) break;
          const body = (await res.json()) as { messages: ServerMessage[]; hasMore: boolean };
          if (body.messages.length) {
            setMessages((cur) => {
              const merged = mergeMessages(cur, body.messages);
              messagesRef.current = merged; // next page must start after what we just merged
              return merged;
            });
          }
          more = body.hasMore && body.messages.length > 0;
        }
      } while (gap.current.again);
    } catch {
      // Still offline or the request failed; the next reconnect/online/visible event tries again.
    } finally {
      gap.current.running = false;
    }
  }, [groupId, refreshJobs]);

  useRealtimeMessages(groupId, {
    onJob: (job) => mergeJobs([job]),
    onMessage: (m) => {
      const known = m.sender_id ? (names.current.get(m.sender_id) ?? null) : null;
      setMessages((cur) => mergeMessages(cur, [{ ...m, sender_name: known }]));
      if (m.sender_id && !known) void resolveName(m.sender_id);
    },
    onStatus: (status) => {
      setSocket(status === "connected" ? "connected" : "reconnecting");
      // (Re)subscribed: catch up on anything missed, including between page render and first subscribe.
      if (status === "connected") void fillGap();
    },
  });

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Work left over from before this page opened (or from a dropped request) is picked up here.
  useEffect(() => {
    if (initialJobs.some((j) => j.status === "queued" || j.status === "processing")) void kick();
  }, [initialJobs, kick]);

  // While anything is waiting, ask again every 20 s. It is cheap, and it rescues a job whose worker died.
  useEffect(() => {
    if (!thinking) return;
    const timer = setInterval(() => void kick(), 20_000);
    return () => clearInterval(timer);
  }, [thinking, kick]);

  // Catch up when the network returns or the tab becomes visible again.
  useEffect(() => {
    const refresh = () => void fillGap();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener("online", refresh);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", refresh);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fillGap]);

  const connection: ConnectionState = !online ? "offline" : socket;

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
          // The database has queued a job for this message; show it right away instead of waiting for the event.
          mergeJobs([{ id: `pending-${id}`, trigger_message_id: id, status: "queued", error_category: null }]);
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
    [groupId, mergeJobs],
  );

  const enqueue = useCallback(
    (id: string, content: string) => {
      sendQueue.current = sendQueue.current.then(() => post(id, content));
    },
    [post],
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
      enqueue(id, content);
    },
    [groupId, currentUserId, currentUserName, enqueue],
  );

  function retry(id: string) {
    const failed = messages.find((m) => m.id === id && m.status === "failed");
    if (!failed) return;
    setMessages((cur) =>
      cur.map((m) => (m.id === id ? { ...m, status: "sending" as const, errorText: undefined } : m)),
    );
    // The same id is reused, so a retry can never create a second copy.
    enqueue(id, failed.content);
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
    <div className="flex h-[min(70dvh,40rem)] min-h-[24rem] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
      <ConnectionBanner state={connection} />
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
              <Fragment key={m.id}>
                <MessageItem
                  message={m}
                  isOwn={m.sender_id === currentUserId}
                  animate={!initialIds.has(m.id)}
                  onRetry={retry}
                />
                {jobs.get(m.id)?.status === "failed" && <AiFailedNotice category={jobs.get(m.id)!.error_category} />}
              </Fragment>
            ))}
            {thinking && (
              <li className="message-in flex items-center gap-3 py-1 pl-3" data-testid="ai-thinking">
                <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground font-display text-lg leading-none text-background">
                  H
                </span>
                <span className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted">
                  <span className="shiny">HiveMind is thinking</span>
                  {waitingCount > 1 && (
                    <span data-testid="ai-waiting">· {waitingCount - 1} more waiting</span>
                  )}
                  <span aria-hidden="true" className="flex gap-1">
                    <i className="thinking-dot" />
                    <i className="thinking-dot" style={{ animationDelay: "150ms" }} />
                    <i className="thinking-dot" style={{ animationDelay: "300ms" }} />
                  </span>
                </span>
              </li>
            )}
          </ul>
        )}
      </div>
      <Composer
        maxLength={maxLength}
        onSend={send}
        blockedReason={online ? undefined : "You're offline. Reconnect to send. Your draft is kept."}
      />
    </div>
  );
}
