import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

// Needs the app running on http://localhost:3000 (npm run dev).
let a: TestUser;
let b: TestUser;
let g1: string; // A's group
let g2: string; // B's group
let aApi: ReturnType<typeof api>;
let bApi: ReturnType<typeof api>;
const anon = api();

const url = (g: string) => `/api/groups/${g}/messages`;

beforeAll(async () => {
  a = await createTestUser("apiA");
  b = await createTestUser("apiB");
  g1 = (await a.client.rpc("create_group", { p_name: "API G1" })).data as string;
  g2 = (await b.client.rpc("create_group", { p_name: "API G2" })).data as string;
  aApi = api(await sessionCookie(a));
  bApi = api(await sessionCookie(b));
  await admin.from("profiles").update({ display_name: "Alice" }).eq("id", a.id);
});

afterAll(async () => {
  await cleanupTestUsers();
});

const countIn = async (group: string) =>
  (await admin.from("messages").select("id", { count: "exact", head: true }).eq("group_id", group)).count;

describe("authentication and authorization", () => {
  it("T2.2-5 signed-out callers get 401 on every method", async () => {
    expect((await anon.get(url(g1))).status).toBe(401);
    expect((await anon.post(url(g1), { content: "hi" })).status).toBe(401);
  });

  it("T2.2-4 a non-member gets 404 and nothing is stored", async () => {
    const before = await countIn(g1);
    const res = await bApi.post(url(g1), { content: "let me in" });
    expect(res.status).toBe(404);
    expect(await countIn(g1)).toBe(before);
    expect((await bApi.get(url(g1))).status).toBe(404);
  });

  it("unknown and malformed group ids give the same 404 as a forbidden group", async () => {
    const forbidden = await (await bApi.get(url(g1))).json();
    const unknown = await bApi.get(url(randomUUID()));
    const malformed = await bApi.get(url("not-a-uuid"));
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(await unknown.json()).toEqual(forbidden);
    expect(await malformed.json()).toEqual(forbidden);
  });
});

describe("sending", () => {
  it("T2.2-1 stores the message and returns it with seq, time and sender name", async () => {
    const res = await aApi.post(url(g1), { content: "  hello there  " });
    expect(res.status).toBe(201);
    const { message } = await res.json();
    expect(message).toMatchObject({
      group_id: g1,
      sender_id: a.id,
      type: "user",
      content: "hello there",
      sender_name: "Alice",
    });
    expect(typeof message.seq).toBe("number");

    const page = await (await aApi.get(url(g1))).json();
    expect(page.messages.map((m: { id: string }) => m.id)).toContain(message.id);
  });

  it("T2.2-2 rejects empty and whitespace-only content", async () => {
    for (const content of ["", "   ", "\n\t"]) {
      const res = await aApi.post(url(g1), { content });
      expect(res.status, JSON.stringify(content)).toBe(400);
    }
  });

  it("T2.2-3 enforces the length limit and says what it is", async () => {
    const over = await aApi.post(url(g1), { content: "x".repeat(1001) });
    expect(over.status).toBe(400);
    expect((await over.json()).error).toContain("1000");
    expect((await aApi.post(url(g1), { content: "x".repeat(1000) })).status).toBe(201);
  });

  it("T2.2-9 malformed bodies are 400 with no stack trace", async () => {
    for (const body of ["not json", "{", "null", JSON.stringify({ content: 5 }), JSON.stringify({ id: "x", content: "hi" })]) {
      const res = await aApi.post(url(g1), body);
      expect(res.status, body).toBe(400);
      const text = await res.text();
      expect(text).not.toMatch(/at .*\.(ts|js)/);
    }
  });

  it("T2.2-6 stores markup as plain text, unchanged", async () => {
    const xss = `<img src=x onerror=alert(1)><script>alert(2)</script>`;
    const { message } = await (await aApi.post(url(g1), { content: xss })).json();
    expect(message.content).toBe(xss);
  });

  it("a retry with the same id returns the original and stores one copy", async () => {
    const id = randomUUID();
    const first = await aApi.post(url(g1), { id, content: "exactly once" });
    const again = await aApi.post(url(g1), { id, content: "exactly once" });
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect((await again.json()).message.id).toBe(id);
    const { data } = await admin.from("messages").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });

  it("another user cannot take over an existing message id", async () => {
    const id = randomUUID();
    await aApi.post(url(g1), { id, content: "mine" });
    const res = await bApi.post(url(g2), { id, content: "stolen id" });
    expect(res.status).toBe(409);
    const { data } = await admin.from("messages").select("content, group_id").eq("id", id).single();
    expect(data).toEqual({ content: "mine", group_id: g1 });
  });
});

describe("history", () => {
  it("T2.2-8 pages through 75 messages with no gaps or duplicates", async () => {
    const group = (await a.client.rpc("create_group", { p_name: "Long chat" })).data as string;
    const rows = Array.from({ length: 75 }, (_, i) => ({
      group_id: group,
      sender_id: a.id,
      type: "user",
      content: `m${i + 1}`,
    }));
    const { error } = await admin.from("messages").insert(rows);
    expect(error).toBeNull();

    const p1 = await (await aApi.get(url(group))).json();
    expect(p1.messages).toHaveLength(30);
    expect(p1.hasMore).toBe(true);
    expect(p1.messages[0].content).toBe("m46");
    expect(p1.messages[29].content).toBe("m75");

    const p2 = await (await aApi.get(`${url(group)}?before=${p1.messages[0].seq}`)).json();
    expect(p2.messages).toHaveLength(30);
    expect(p2.hasMore).toBe(true);

    const p3 = await (await aApi.get(`${url(group)}?before=${p2.messages[0].seq}`)).json();
    expect(p3.messages).toHaveLength(15);
    expect(p3.hasMore).toBe(false);

    const all = [...p3.messages, ...p2.messages, ...p1.messages];
    expect(all).toHaveLength(75);
    expect(new Set(all.map((m: { id: string }) => m.id)).size).toBe(75);
    expect(all.map((m: { content: string }) => m.content)).toEqual(Array.from({ length: 75 }, (_, i) => `m${i + 1}`));
    const seqs = all.map((m: { seq: number }) => m.seq);
    expect([...seqs].sort((x, y) => x - y)).toEqual(seqs);
  });

  it("after= returns only newer messages, oldest first", async () => {
    const group = (await a.client.rpc("create_group", { p_name: "After chat" })).data as string;
    await admin.from("messages").insert(
      Array.from({ length: 10 }, (_, i) => ({ group_id: group, sender_id: a.id, type: "user", content: `n${i + 1}` })),
    );
    const all = (await (await aApi.get(`${url(group)}?limit=10`)).json()).messages;
    const res = await (await aApi.get(`${url(group)}?after=${all[6].seq}`)).json();
    expect(res.messages.map((m: { content: string }) => m.content)).toEqual(["n8", "n9", "n10"]);
    expect(res.hasMore).toBe(false);
    const limited = await (await aApi.get(`${url(group)}?after=${all[0].seq}&limit=4`)).json();
    expect(limited.messages).toHaveLength(4);
    expect(limited.hasMore).toBe(true);
  });

  it("rejects invalid history parameters", async () => {
    for (const q of ["before=abc", "limit=0", "limit=500", "before=1&after=2", "before=-5"]) {
      expect((await aApi.get(`${url(g1)}?${q}`)).status, q).toBe(400);
    }
  });

  it("an empty group returns an empty page", async () => {
    const group = (await a.client.rpc("create_group", { p_name: "Silent" })).data as string;
    expect(await (await aApi.get(url(group))).json()).toEqual({ messages: [], hasMore: false });
  });
});
