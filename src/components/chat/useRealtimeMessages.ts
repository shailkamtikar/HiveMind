"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MessageType, ServerMessage } from "@/lib/chat/types";

export type RealtimeStatus = "connecting" | "connected" | "reconnecting";

type Row = {
  id: string;
  seq: number;
  group_id: string;
  sender_id: string | null;
  type: MessageType;
  content: string;
  created_at: string;
};

/**
 * Subscribes to new messages in one group. Events are only a notification: the database is the
 * source of truth, so callers must tolerate duplicates and out-of-order delivery.
 */
export function useRealtimeMessages(
  groupId: string,
  handlers: {
    onMessage: (message: ServerMessage) => void;
    onStatus?: (status: RealtimeStatus) => void;
  },
) {
  // Keep the latest callbacks without resubscribing every render.
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function start() {
      // The realtime socket must authenticate as the signed-in user, otherwise row-level security
      // treats it as anonymous and no events are delivered.
      const { data } = await supabase.auth.getSession();
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      if (cancelled) return;

      channel = supabase
        .channel(`group-messages:${groupId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "messages", filter: `group_id=eq.${groupId}` },
          (payload) => {
            const row = payload.new as Row;
            ref.current.onMessage({
              id: row.id,
              seq: row.seq,
              group_id: row.group_id,
              sender_id: row.sender_id,
              type: row.type,
              content: row.content,
              created_at: row.created_at,
              sender_name: null,
            });
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") ref.current.onStatus?.("connected");
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            ref.current.onStatus?.("reconnecting");
          }
        });
    }
    void start();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [groupId]);
}
