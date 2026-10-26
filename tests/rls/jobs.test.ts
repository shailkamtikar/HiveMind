import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser;
let group: string;

type Claim = { job_id: string; trigger_message_id: string; trigger_seq: number; attempts: number };
const claim = async (g = group, stale = 90): Promise<Claim | null> => {
  const { data, error } = await admin.rpc("claim_next_job", { p_group_id: g, p_stale_after_seconds: stale });
  if (error) throw new Error(error.message);
  return ((Array.isArray(data) ? data[0] : data) ?? null) as Claim | null;
};

/** A fresh group with `n` queued jobs, oldest first. */
async function queue(n: number, owner = a) {
  const g = (await owner.client.rpc("create_group", { p_name: "Job functions" })).data as string;
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const { data } = await admin
      .from("messages")
      .insert({ group_id: g, sender_id: owner.id, type: "user", content: `q${i + 1}` })
      .select("id")
      .single();
    ids.push(data!.id);
  }
  return { g, ids };
}

const job = async (id: string) =>
  (await admin.from("ai_jobs").select("status, attempts, error_category, locked_at").eq("id", id).single()).data!;
const replies = async (g: string) =>
  (await admin.from("messages").select("content, job_id").eq("group_id", g).eq("type", "assistant").order("seq")).data!;

beforeAll(async () => {
  a = await createTestUser("fa");
  group = (await queue(0)).g;
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("access", () => {
  it("T4.4-8 members and anonymous callers cannot call the job functions", async () => {
    const { g } = await queue(1);
    for (const client of [a.client, anonClient()]) {
      expect((await client.rpc("claim_next_job", { p_group_id: g })).error).not.toBeNull();
      expect((await client.rpc("complete_job", { p_job_id: crypto.randomUUID(), p_content: "x" })).error).not.toBeNull();
      expect((await client.rpc("fail_job", { p_job_id: crypto.randomUUID(), p_category: "quota" })).error).not.toBeNull();
    }
  });
});

describe("claiming", () => {
  it("hands out the oldest queued job first, and only one at a time", async () => {
    const { g, ids } = await queue(3);
    const first = await claim(g);
    expect(first!.trigger_message_id).toBe(ids[0]);
    expect(first!.attempts).toBe(1);
    expect((await job(first!.job_id)).status).toBe("processing");
    expect(await claim(g)).toBeNull(); // the first is still being worked on
  });

  it("T4.4-3 simultaneous claims: exactly one caller wins", async () => {
    const { g } = await queue(2);
    const results = await Promise.all(Array.from({ length: 6 }, () => claim(g)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const { count } = await admin.from("ai_jobs").select("id", { count: "exact", head: true }).eq("group_id", g).eq("status", "processing");
    expect(count).toBe(1);
  });

  it("T4.4-5 different groups do not block each other", async () => {
    const one = await queue(1);
    const two = await queue(1);
    const [x, y] = await Promise.all([claim(one.g), claim(two.g)]);
    expect(x).not.toBeNull();
    expect(y).not.toBeNull();
  });

  it("returns nothing for an empty or unknown group", async () => {
    expect(await claim((await queue(0)).g)).toBeNull();
    expect(await claim(crypto.randomUUID())).toBeNull();
  });
});

describe("completing", () => {
  it("T4.4-1 / T4.4-4 stores one reply linked to the job, and a second call changes nothing", async () => {
    const { g } = await queue(1);
    const c = (await claim(g))!;
    expect((await admin.rpc("complete_job", { p_job_id: c.job_id, p_content: "the answer" })).data).toBe(true);
    expect((await admin.rpc("complete_job", { p_job_id: c.job_id, p_content: "a different answer" })).data).toBe(false);
    expect(await replies(g)).toEqual([{ content: "the answer", job_id: c.job_id }]);
    expect((await job(c.job_id)).status).toBe("succeeded");
  });

  it("a queued job cannot be completed without being claimed", async () => {
    const { g, ids } = await queue(1);
    const { data } = await admin.from("ai_jobs").select("id").eq("trigger_message_id", ids[0]).single();
    expect((await admin.rpc("complete_job", { p_job_id: data!.id, p_content: "sneaky" })).data).toBe(false);
    expect(await replies(g)).toHaveLength(0);
  });

  it("after a job succeeds the next one can be claimed", async () => {
    const { g, ids } = await queue(2);
    const c1 = (await claim(g))!;
    await admin.rpc("complete_job", { p_job_id: c1.job_id, p_content: "one" });
    const c2 = (await claim(g))!;
    expect(c2.trigger_message_id).toBe(ids[1]);
  });
});

describe("failing", () => {
  it("records the category, keeps the user message, and lets later jobs proceed", async () => {
    const { g, ids } = await queue(2);
    const c1 = (await claim(g))!;
    expect((await admin.rpc("fail_job", { p_job_id: c1.job_id, p_category: "quota" })).data).toBe(true);
    expect(await job(c1.job_id)).toMatchObject({ status: "failed", error_category: "quota", locked_at: null });
    expect(await replies(g)).toHaveLength(0);
    expect((await admin.from("messages").select("id").eq("id", ids[0])).data).toHaveLength(1);
    expect((await claim(g))!.trigger_message_id).toBe(ids[1]);
  });

  it("rejects unknown categories and cannot fail a job that is not processing", async () => {
    const { g, ids } = await queue(1);
    const { data } = await admin.from("ai_jobs").select("id").eq("trigger_message_id", ids[0]).single();
    expect((await admin.rpc("fail_job", { p_job_id: data!.id, p_category: "quota" })).data).toBe(false); // still queued
    const c = (await claim(g))!;
    expect((await admin.rpc("fail_job", { p_job_id: c.job_id, p_category: "my prompt was: secret" })).error).not.toBeNull();
    expect((await job(c.job_id)).status).toBe("processing");
  });

  it("a failed job cannot be completed afterwards", async () => {
    const { g } = await queue(1);
    const c = (await claim(g))!;
    await admin.rpc("fail_job", { p_job_id: c.job_id, p_category: "provider" });
    expect((await admin.rpc("complete_job", { p_job_id: c.job_id, p_content: "late" })).data).toBe(false);
    expect(await replies(g)).toHaveLength(0);
  });
});

describe("abandoned jobs", () => {
  const age = (id: string, seconds: number) =>
    admin.from("ai_jobs").update({ locked_at: new Date(Date.now() - seconds * 1000).toISOString() }).eq("id", id);

  it("a job stuck in processing is handed out again after the stale period, with a higher attempt count", async () => {
    const { g } = await queue(1);
    const c1 = (await claim(g))!;
    await age(c1.job_id, 30);
    expect(await claim(g)).toBeNull(); // 30 s is not yet stale (90 s)
    await age(c1.job_id, 120);
    const c2 = (await claim(g))!;
    expect(c2.job_id).toBe(c1.job_id);
    expect(c2.attempts).toBe(2);
  });

  it("gives up after three attempts and marks the job failed (timeout)", async () => {
    const { g } = await queue(1);
    let c = (await claim(g))!;
    for (let i = 0; i < 2; i++) {
      await age(c.job_id, 120);
      c = (await claim(g))!;
    }
    expect(c.attempts).toBe(3);
    await age(c.job_id, 120);
    expect(await claim(g)).toBeNull();
    expect(await job(c.job_id)).toMatchObject({ status: "failed", error_category: "timeout" });
  });

  it("T5.1-9 a slow original finishing after a re-claim cannot create a second reply", async () => {
    const { g } = await queue(1);
    const first = (await claim(g))!;
    await age(first.job_id, 120);
    const second = (await claim(g))!; // same job, handed out again
    expect(second.job_id).toBe(first.job_id);
    expect((await admin.rpc("complete_job", { p_job_id: second.job_id, p_content: "retry answer" })).data).toBe(true);
    expect((await admin.rpc("complete_job", { p_job_id: first.job_id, p_content: "slow original" })).data).toBe(false);
    expect((await replies(g)).map((r) => r.content)).toEqual(["retry answer"]);
  });
});
