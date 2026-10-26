import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser; // owner of G1
let b: TestUser; // member of G1
let c: TestUser; // owner of G2, not in G1
let g1: string;
let g2: string;

const send = (u: TestUser, group: string, content: string) =>
  u.client
    .from("messages")
    .insert({ group_id: group, sender_id: u.id, type: "user", content })
    .select("id, seq")
    .single();

const jobsFor = async (messageId: string) =>
  (await admin.from("ai_jobs").select("id, status, attempts, group_id, error_category").eq("trigger_message_id", messageId)).data!;

beforeAll(async () => {
  a = await createTestUser("ja");
  b = await createTestUser("jb");
  c = await createTestUser("jc");
  g1 = (await a.client.rpc("create_group", { p_name: "Jobs G1" })).data as string;
  g2 = (await c.client.rpc("create_group", { p_name: "Jobs G2" })).data as string;
  await admin.from("group_members").insert({ group_id: g1, user_id: b.id, role: "member" });
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("enqueueing", () => {
  it("T4.2-1 a member's message creates exactly one queued job", async () => {
    const { data } = await send(a, g1, "hello");
    const jobs = await jobsFor(data!.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]).toMatchObject({ status: "queued", attempts: 0, group_id: g1, error_category: null });
  });

  it("T4.2-2 a rejected message leaves no job behind", async () => {
    const before = (await admin.from("ai_jobs").select("id", { count: "exact", head: true }).eq("group_id", g1)).count;
    const bad = await a.client.from("messages").insert({ group_id: g1, sender_id: a.id, type: "user", content: "" });
    expect(bad.error).not.toBeNull();
    const forged = await b.client.from("messages").insert({ group_id: g1, sender_id: a.id, type: "user", content: "spoof" });
    expect(forged.error).not.toBeNull();
    const after = (await admin.from("ai_jobs").select("id", { count: "exact", head: true }).eq("group_id", g1)).count;
    expect(after).toBe(before);
  });

  it("T4.2-3 assistant and system messages never create jobs", async () => {
    for (const type of ["assistant", "system"]) {
      const { data } = await admin
        .from("messages")
        .insert({ group_id: g1, sender_id: null, type, content: `${type} note` })
        .select("id")
        .single();
      expect(await jobsFor(data!.id), type).toHaveLength(0);
    }
  });

  it("T4.2-4 a second job for the same message is refused", async () => {
    const { data } = await send(a, g1, "only one job please");
    const dup = await admin.from("ai_jobs").insert({ group_id: g1, trigger_message_id: data!.id });
    expect(dup.error?.code).toBe("23505");
    expect(await jobsFor(data!.id)).toHaveLength(1);
  });

  it("deleting a group removes its jobs", async () => {
    const o = await createTestUser("jdel");
    const g = (await o.client.rpc("create_group", { p_name: "Doomed jobs" })).data as string;
    const { data } = await send(o, g, "bye");
    expect(await jobsFor(data!.id)).toHaveLength(1);
    await o.client.from("groups").delete().eq("id", g);
    expect(await jobsFor(data!.id)).toHaveLength(0);
  });
});

describe("reading", () => {
  it("T4.2-5 / T4.2-6 members see their own group's jobs; outsiders and anonymous see none", async () => {
    const m1 = (await send(a, g1, "in g1")).data!;
    const m2 = (await send(c, g2, "in g2")).data!;
    const mine = await b.client.from("ai_jobs").select("trigger_message_id, group_id");
    expect(mine.error).toBeNull();
    expect(new Set(mine.data!.map((j) => j.group_id))).toEqual(new Set([g1]));
    expect(mine.data!.some((j) => j.trigger_message_id === m1.id)).toBe(true);
    expect(mine.data!.some((j) => j.trigger_message_id === m2.id)).toBe(false);

    expect((await c.client.from("ai_jobs").select("id").eq("group_id", g1)).data).toHaveLength(0);
    expect((await anonClient().from("ai_jobs").select("id")).data ?? []).toHaveLength(0);
  });

  it("members cannot read the lock timestamp", async () => {
    expect((await b.client.from("ai_jobs").select("locked_at")).error).not.toBeNull();
  });
});

describe("writing", () => {
  it("T4.2-7 members cannot create, change or delete jobs", async () => {
    const { data } = await send(a, g1, "protect my job");
    const [job] = await jobsFor(data!.id);

    const upd = await a.client.from("ai_jobs").update({ status: "succeeded" }).eq("id", job.id).select();
    expect(upd.error !== null || (upd.data ?? []).length === 0).toBe(true);
    const del = await a.client.from("ai_jobs").delete().eq("id", job.id).select();
    expect(del.error !== null || (del.data ?? []).length === 0).toBe(true);
    const ins = await a.client.from("ai_jobs").insert({ group_id: g1, trigger_message_id: randomUUID() });
    expect(ins.error).not.toBeNull();
    expect((await jobsFor(data!.id))[0].status).toBe("queued");
  });
});

describe("one reply per job", () => {
  it("T4.2-8 a second assistant message for the same job is rejected", async () => {
    const { data } = await send(a, g1, "reply once");
    const [job] = await jobsFor(data!.id);
    const reply = (n: number) =>
      admin.from("messages").insert({ group_id: g1, sender_id: null, type: "assistant", content: `answer ${n}`, job_id: job.id });
    expect((await reply(1)).error).toBeNull();
    expect((await reply(2)).error?.code).toBe("23505");
    const { data: rows } = await admin.from("messages").select("id").eq("job_id", job.id);
    expect(rows).toHaveLength(1);
  });

  it("members still cannot forge a reply or set job_id themselves", async () => {
    const { data } = await send(a, g1, "forgery attempt");
    const [job] = await jobsFor(data!.id);
    const forged = await a.client
      .from("messages")
      .insert({ group_id: g1, sender_id: a.id, type: "user", content: "x", job_id: job.id });
    expect(forged.error).not.toBeNull();
  });
});
