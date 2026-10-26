import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { cookieHeader } from "../helpers/http";

// Talks to the REAL Gemini API through the normal dev server (AI replies on), so it uses a little quota.
// Run it deliberately: RUN_LIVE_AI=1 npm run test:db -- tests/api/ai-live.test.ts   (needs `npm run dev` on :3000)
const LIVE = process.env.TEST_LIVE_URL ?? "http://localhost:3000";

let a: TestUser;
let group: string;
let cookie: string;

async function waitForReply(afterSeq: number, ms = 40_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const { data } = await admin
      .from("messages")
      .select("seq, type, sender_id, content")
      .eq("group_id", group)
      .gt("seq", afterSeq)
      .in("type", ["assistant", "system"])
      .order("seq");
    if (data?.length) return data[0];
    await new Promise((r) => setTimeout(r, 500));
  }
  return null;
}

describe.skipIf(!process.env.RUN_LIVE_AI)("live AI reply", () => {
  beforeAll(async () => {
    a = await createTestUser("live");
    await admin.from("profiles").update({ display_name: "Alice" }).eq("id", a.id);
    group = (await a.client.rpc("create_group", { p_name: "Live AI" })).data as string;
    const { data } = await admin.auth.admin.generateLink({ type: "magiclink", email: a.email });
    const res = await fetch(`${LIVE}/auth/callback?token_hash=${data!.properties!.hashed_token}&type=magiclink`, {
      redirect: "manual",
    });
    cookie = cookieHeader(res.headers.getSetCookie());
  });
  afterAll(async () => {
    await cleanupTestUsers();
  });

  it("answers a member's message with exactly one stored assistant message that knows who asked", async () => {
    const res = await fetch(`${LIVE}/api/groups/${group}/messages`, {
      method: "POST",
      headers: { cookie, "content-type": "application/json" },
      body: JSON.stringify({ content: "Reply with one short sentence that includes my name." }),
    });
    expect(res.status).toBe(201);
    const { message } = await res.json();

    const reply = await waitForReply(message.seq);
    expect(reply, "no reply arrived").not.toBeNull();
    expect(reply!.type).toBe("assistant");
    expect(reply!.sender_id).toBeNull();
    expect(reply!.content.length).toBeGreaterThan(0);
    expect(reply!.content).toMatch(/alice/i);

    await new Promise((r) => setTimeout(r, 4000));
    const { data } = await admin.from("messages").select("type").eq("group_id", group).eq("type", "assistant");
    expect(data).toHaveLength(1);
  });
});
