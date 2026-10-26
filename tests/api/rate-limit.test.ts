import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

// Uses the default limits on the test server: 20 messages per minute, 6 AI calls per minute, per user.
let a: TestUser;
let b: TestUser;
let g: string;
let aApi: ReturnType<typeof api>;
let bApi: ReturnType<typeof api>;

// Windows are aligned to the clock minute; start a burst early in a minute so it cannot straddle two windows.
async function startOfMinute(maxSecondsIn: number) {
  const s = new Date().getSeconds();
  if (s > maxSecondsIn) await new Promise((r) => setTimeout(r, (61 - s) * 1000));
}

beforeAll(async () => {
  a = await createTestUser("rma");
  b = await createTestUser("rmb");
  g = (await a.client.rpc("create_group", { p_name: "Rate limits" })).data as string;
  await admin.from("group_members").insert({ group_id: g, user_id: b.id, role: "member" });
  aApi = api(await sessionCookie(a));
  bApi = api(await sessionCookie(b));
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("message sending", () => {
  it("T5.3-2 the 21st message in a minute gets 429 with Retry-After, and nothing is stored", async () => {
    await startOfMinute(25);
    // A burst: all 25 at once, so it cannot straddle two windows. Exactly 20 may pass, whatever the order.
    const responses = await Promise.all(
      Array.from({ length: 25 }, (_, i) => aApi.post(`/api/groups/${g}/messages`, { content: `burst ${i + 1}` })),
    );
    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(20);
    expect(statuses.filter((s) => s === 429)).toHaveLength(5);
    const last = responses.find((r) => r.status === 429)!;
    const retry = Number(last.headers.get("retry-after"));
    expect(retry).toBeGreaterThanOrEqual(1);
    expect(retry).toBeLessThanOrEqual(60);
    expect((await last.json()).error).toMatch(/too many/i);
    const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("group_id", g);
    expect(count).toBe(20);
  });

  it("T5.3-4 another member is not affected by someone else being throttled", async () => {
    expect((await bApi.post(`/api/groups/${g}/messages`, { content: "I can still talk" })).status).toBe(201);
  });

  it("reading history is never rate limited by this", async () => {
    expect((await aApi.get(`/api/groups/${g}/messages`)).status).toBe(200);
  });
});

describe("AI endpoints", () => {
  it("T5.3-5 the 7th process call in a minute gets 429", async () => {
    await startOfMinute(45);
    const statuses = (await Promise.all(Array.from({ length: 9 }, () => bApi.post(`/api/groups/${g}/ai/process`, {})))).map((r) => r.status);
    expect(statuses.filter((s) => s === 200)).toHaveLength(6);
    expect(statuses.filter((s) => s === 429)).toHaveLength(3);
  });
});
