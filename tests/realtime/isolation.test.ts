import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser; // owner of G1
let b: TestUser; // member of G1
let c: TestUser; // owner of G2, not in G1
let g1: string;
let g2: string;

type Received = { id: string; group_id: string; content: string };

/** Subscribes WITHOUT a group filter, the worst case: any leak across groups would show up here. */
async function listen(client: SupabaseClient) {
  const received: Received[] = [];
  // Make sure the realtime socket authenticates as this user (no session = anonymous caller).
  const { data: sessionData } = await client.auth.getSession();
  if (sessionData.session) await client.realtime.setAuth(sessionData.session.access_token);
  const channel: RealtimeChannel = client.channel(`iso-${Math.random().toString(36).slice(2)}`).on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages" },
    (payload) => received.push(payload.new as Received),
  );
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("subscribe timed out")), 15_000);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
      if (status === "CHANNEL_ERROR") {
        clearTimeout(timer);
        reject(new Error("channel error"));
      }
    });
  });
  return { received, stop: () => client.removeChannel(channel) };
}

const waitFor = async (cond: () => boolean, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return cond();
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  a = await createTestUser("rta");
  b = await createTestUser("rtb");
  c = await createTestUser("rtc");
  g1 = (await a.client.rpc("create_group", { p_name: "RT G1" })).data as string;
  g2 = (await c.client.rpc("create_group", { p_name: "RT G2" })).data as string;
  await admin.from("group_members").insert({ group_id: g1, user_id: b.id, role: "member" });
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("realtime authorization", () => {
  it("T2.3-3 members receive their group's messages; non-members receive nothing", async () => {
    const lb = await listen(b.client);
    const lc = await listen(c.client);
    try {
      const sent = await a.client
        .from("messages")
        .insert({ group_id: g1, sender_id: a.id, type: "user", content: "secret for G1" })
        .select("id")
        .single();
      expect(sent.error).toBeNull();

      expect(await waitFor(() => lb.received.some((m) => m.id === sent.data!.id))).toBe(true);
      // Give a leak every chance to show up before asserting absence.
      await sleep(3000);
      // A signed-in non-member gets no event at all for another group's message (not even an empty one).
      expect(lc.received.filter((m) => m.group_id === g1)).toHaveLength(0);
      expect(lc.received.some((m) => m.content === "secret for G1")).toBe(false);
      expect(lc.received).toHaveLength(0);

      // And the other way round.
      const reply = await c.client
        .from("messages")
        .insert({ group_id: g2, sender_id: c.id, type: "user", content: "secret for G2" })
        .select("id")
        .single();
      expect(await waitFor(() => lc.received.some((m) => m.id === reply.data!.id))).toBe(true);
      await sleep(3000);
      expect(lb.received.some((m) => m.group_id === g2)).toBe(false);
    } finally {
      await lb.stop();
      await lc.stop();
    }
  });

  // Known behaviour: Supabase Realtime may still deliver an *empty* event ({}) to a signed-out client.
  // It says only that some insert happened; it never carries an id, group, sender or text.
  it("an anonymous (signed-out) client never receives any message data", async () => {
    const { anonClient } = await import("../helpers/users");
    const anon = anonClient();
    let l: Awaited<ReturnType<typeof listen>> | null = null;
    try {
      l = await listen(anon);
    } catch {
      return; // refusing the subscription is also acceptable
    }
    try {
      await a.client.from("messages").insert({ group_id: g1, sender_id: a.id, type: "user", content: "for members only" });
      await sleep(3000);
      for (const event of l.received) expect(Object.keys(event)).toHaveLength(0);
    } finally {
      await l.stop();
    }
  });
});
