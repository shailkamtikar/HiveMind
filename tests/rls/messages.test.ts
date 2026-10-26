import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser; // owner and member of G1
let b: TestUser; // owner of G2, not in G1
let c: TestUser; // member of G1 (added by admin)
let g1: string;
let g2: string;

const post = (u: TestUser, group: string, content: string, extra: Record<string, unknown> = {}) =>
  u.client
    .from("messages")
    .insert({ group_id: group, sender_id: u.id, type: "user", content, ...extra })
    .select("id, seq, created_at")
    .single();

beforeAll(async () => {
  a = await createTestUser("ma");
  b = await createTestUser("mb");
  c = await createTestUser("mc");
  g1 = (await a.client.rpc("create_group", { p_name: "G1" })).data as string;
  g2 = (await b.client.rpc("create_group", { p_name: "G2" })).data as string;
  await admin.from("group_members").insert({ group_id: g1, user_id: c.id, role: "member" });
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("inserting", () => {
  it("T2.1-1 a member can post and gets a server-assigned seq and timestamp", async () => {
    const { data, error } = await post(a, g1, "hello");
    expect(error).toBeNull();
    expect(typeof data!.seq).toBe("number");
    expect(new Date(data!.created_at).getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it("T2.1-2 a non-member cannot post into the group", async () => {
    const { error } = await post(b, g1, "let me in");
    expect(error).not.toBeNull();
  });

  it("T2.1-4 a sender cannot be spoofed", async () => {
    const { error } = await a.client
      .from("messages")
      .insert({ group_id: g1, sender_id: c.id, type: "user", content: "pretending" });
    expect(error).not.toBeNull();
  });

  it("T2.1-5 clients cannot forge assistant or system messages", async () => {
    for (const type of ["assistant", "system"]) {
      const { error } = await a.client
        .from("messages")
        .insert({ group_id: g1, sender_id: a.id, type, content: "forged" });
      expect(error, type).not.toBeNull();
      const none = await a.client.from("messages").insert({ group_id: g1, sender_id: null, type, content: "forged" });
      expect(none.error, `${type} without sender`).not.toBeNull();
    }
  });

  it("T2.1-6 empty and oversized content are rejected; 4000 characters is the cap", async () => {
    expect((await post(a, g1, "")).error).not.toBeNull();
    expect((await post(a, g1, "x".repeat(4001))).error).not.toBeNull();
    expect((await post(a, g1, "x".repeat(4000))).error).toBeNull();
  });

  it("clients cannot set server-controlled columns (seq, created_at, job_id)", async () => {
    for (const extra of [{ seq: 1 }, { created_at: "2000-01-01T00:00:00Z" }, { job_id: randomUUID() }]) {
      const { error } = await post(a, g1, "sneaky", extra);
      expect(error, JSON.stringify(extra)).not.toBeNull();
    }
  });

  it("a retried send with the same id cannot create a duplicate", async () => {
    const id = randomUUID();
    const first = await post(a, g1, "once", { id });
    expect(first.error).toBeNull();
    const second = await post(a, g1, "once", { id });
    expect(second.error).not.toBeNull();
    const { data } = await admin.from("messages").select("id").eq("id", id);
    expect(data).toHaveLength(1);
  });
});

describe("reading", () => {
  it("T2.1-3 a non-member sees no messages from the group", async () => {
    const { data } = await b.client.from("messages").select("id").eq("group_id", g1);
    expect(data).toHaveLength(0);
  });

  it("T2.1-9 groups are isolated from each other", async () => {
    await post(b, g2, "only in G2");
    const ra = await a.client.from("messages").select("group_id");
    const rb = await b.client.from("messages").select("group_id");
    expect(new Set(ra.data!.map((m) => m.group_id))).toEqual(new Set([g1]));
    expect(new Set(rb.data!.map((m) => m.group_id))).toEqual(new Set([g2]));
  });

  it("every member of a group sees the same messages, including earlier ones", async () => {
    const fromA = await a.client.from("messages").select("id").eq("group_id", g1).order("seq");
    const fromC = await c.client.from("messages").select("id").eq("group_id", g1).order("seq");
    expect(fromA.data!.length).toBeGreaterThan(0);
    expect(fromC.data).toEqual(fromA.data);
  });

  it("anonymous visitors see nothing and cannot post", async () => {
    const anon = anonClient();
    const { data } = await anon.from("messages").select("id");
    expect(data ?? []).toHaveLength(0);
    const { error } = await anon.from("messages").insert({ group_id: g1, type: "user", content: "hi" });
    expect(error).not.toBeNull();
  });
});

describe("history is append-only", () => {
  it("T2.1-8 messages cannot be edited or deleted from a client", async () => {
    const { data } = await post(a, g1, "keep me");
    const upd = await a.client.from("messages").update({ content: "changed" }).eq("id", data!.id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await a.client.from("messages").delete().eq("id", data!.id).select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const { data: still } = await admin.from("messages").select("content").eq("id", data!.id).single();
    expect(still!.content).toBe("keep me");
  });

  it("deleting a member's account keeps their messages (sender becomes null)", async () => {
    const d = await createTestUser("md");
    await admin.from("group_members").insert({ group_id: g1, user_id: d.id, role: "member" });
    const { data } = await post(d, g1, "from a leaver");
    await admin.auth.admin.deleteUser(d.id);
    const { data: row } = await admin.from("messages").select("sender_id, content").eq("id", data!.id).single();
    expect(row).toEqual({ sender_id: null, content: "from a leaver" });
  });
});

describe("ordering", () => {
  it("T2.1-7 concurrent posts from two members get unique, strictly increasing seq values", async () => {
    const group = g1;
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) => post(i % 2 === 0 ? a : c, group, `race ${i}`)),
    );
    for (const r of results) expect(r.error).toBeNull();

    const { data } = await a.client
      .from("messages")
      .select("seq, content")
      .eq("group_id", group)
      .like("content", "race %")
      .order("seq", { ascending: true });
    expect(data).toHaveLength(20);
    const seqs = data!.map((m) => m.seq);
    expect(new Set(seqs).size).toBe(20);
    for (let i = 1; i < seqs.length; i++) expect(seqs[i]).toBeGreaterThan(seqs[i - 1]);
  });
});
