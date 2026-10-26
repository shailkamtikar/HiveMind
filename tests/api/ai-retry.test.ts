import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

// The test server has AI switched off, so retried jobs stay queued: these checks are about who may retry what.
let a: TestUser;
let b: TestUser;
let g1: string;
let g2: string;
let aApi: ReturnType<typeof api>;
let bApi: ReturnType<typeof api>;
const anon = api();
const url = (g: string) => `/api/groups/${g}/ai/retry`;

async function failedJob(owner: TestUser, group: string, attempts = 1) {
  const { data: m } = await admin
    .from("messages")
    .insert({ group_id: group, sender_id: owner.id, type: "user", content: "x" })
    .select("id")
    .single();
  const { data: j } = await admin
    .from("ai_jobs")
    .update({ status: "failed", error_category: "provider", attempts })
    .eq("trigger_message_id", m!.id)
    .select("id")
    .single();
  return j!.id as string;
}

beforeAll(async () => {
  a = await createTestUser("rta1");
  b = await createTestUser("rtb1");
  g1 = (await a.client.rpc("create_group", { p_name: "Retry API G1" })).data as string;
  g2 = (await b.client.rpc("create_group", { p_name: "Retry API G2" })).data as string;
  aApi = api(await sessionCookie(a));
  bApi = api(await sessionCookie(b));
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("POST /api/groups/[id]/ai/retry", () => {
  it("signed-out callers get 401", async () => {
    expect((await anon.post(url(g1), { jobId: randomUUID() })).status).toBe(401);
  });

  it("T5.1-7 a non-member gets 404 and the job is untouched", async () => {
    const job = await failedJob(a, g1);
    expect((await bApi.post(url(g1), { jobId: job })).status).toBe(404);
    expect((await admin.from("ai_jobs").select("status").eq("id", job).single()).data!.status).toBe("failed");
  });

  it("T5.1-8 a job from another group cannot be retried through this group's URL", async () => {
    const foreign = await failedJob(b, g2);
    expect((await aApi.post(url(g1), { jobId: foreign })).status).toBe(404);
    expect((await aApi.post(url(g2), { jobId: foreign })).status).toBe(404); // a is not a member of g2 either
    expect((await admin.from("ai_jobs").select("status").eq("id", foreign).single()).data!.status).toBe("failed");
  });

  it("rejects bad bodies", async () => {
    for (const body of ["not json", "{}", JSON.stringify({ jobId: 5 }), JSON.stringify({ jobId: "nope" })]) {
      expect((await aApi.post(url(g1), body)).status, body).toBe(400);
    }
  });

  it("a member re-queues a failed job; doing it again is a 409", async () => {
    const job = await failedJob(a, g1);
    const first = await aApi.post(url(g1), { jobId: job });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ status: "queued" });
    expect((await admin.from("ai_jobs").select("status").eq("id", job).single()).data!.status).toBe("queued");
    const again = await aApi.post(url(g1), { jobId: job });
    expect(again.status).toBe(409);
  });

  it("T5.1-6 a job that did not fail cannot be retried", async () => {
    const { data: m } = await admin
      .from("messages")
      .insert({ group_id: g1, sender_id: a.id, type: "user", content: "fine" })
      .select("id")
      .single();
    const { data: j } = await admin.from("ai_jobs").select("id").eq("trigger_message_id", m!.id).single();
    expect((await aApi.post(url(g1), { jobId: j!.id })).status).toBe(409);
  });

  it("T5.1-5 after three attempts the answer is a 409 with status 'limit'", async () => {
    const job = await failedJob(a, g1, 3);
    const res = await aApi.post(url(g1), { jobId: job });
    expect(res.status).toBe(409);
    expect((await res.json()).status).toBe("limit");
    expect((await admin.from("ai_jobs").select("status").eq("id", job).single()).data!.status).toBe("failed");
  });
});
