import { after, type NextRequest } from "next/server";
import { replyToMessage } from "@/lib/ai/reply";
import { authorizeGroup as authorize, json, notFound } from "@/lib/api/group";
import { getConfig } from "@/lib/config";
import { historyQuerySchema, sendMessageSchema } from "@/lib/validation/message";
import { fetchMessagesPage } from "@/lib/chat/queries";
import type { ServerMessage } from "@/lib/chat/types";

export async function GET(request: NextRequest, ctx: RouteContext<"/api/groups/[id]/messages">) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  const parsed = historyQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return json({ error: "Invalid query parameters" }, 400);

  try {
    return json(await fetchMessagesPage(auth.supabase, id, parsed.data));
  } catch {
    return json({ error: "Could not load messages" }, 500);
  }
}

export async function POST(request: NextRequest, ctx: RouteContext<"/api/groups/[id]/messages">) {
  const { id } = await ctx.params;
  const auth = await authorize(id);
  if ("error" in auth) return auth.error;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const parsed = sendMessageSchema(getConfig().maxMessageLength).safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid message" }, 400);
  }

  const { supabase, user } = auth;
  const row = {
    ...(parsed.data.id ? { id: parsed.data.id } : {}),
    group_id: id,
    sender_id: user.id,
    type: "user" as const,
    content: parsed.data.content,
  };

  const { data, error } = await supabase
    .from("messages")
    .insert(row)
    .select("id, seq, group_id, sender_id, type, content, created_at")
    .single();

  if (error) {
    // Same id sent twice (a retry): return the original message instead of creating a duplicate.
    if (error.code === "23505" && parsed.data.id) {
      const { data: existing } = await supabase
        .from("messages")
        .select("id, seq, group_id, sender_id, type, content, created_at")
        .eq("id", parsed.data.id)
        .eq("sender_id", user.id)
        .maybeSingle();
      if (existing) return json({ message: withName(existing, null) }, 200);
      // The id belongs to someone else's message: refuse without revealing anything about it.
      return json({ error: "That message id is already in use" }, 409);
    }
    if (error.code === "42501") return notFound();
    return json({ error: "Could not send message" }, 500);
  }

  // The AI answers every new message once, after the sender already has their response.
  if (process.env.AI_REPLIES !== "off") after(() => replyToMessage(id, data.seq));

  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  return json({ message: withName(data, profile?.display_name ?? null) }, 201);
}

function withName(m: Omit<ServerMessage, "sender_name">, name: string | null): ServerMessage {
  return { ...m, sender_name: name };
}
