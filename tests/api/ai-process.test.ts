import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

// The test server runs with AI_MODE=off, so these checks are about access, not about replies.
let a: TestUser;
let b: TestUser;
let g1: string;
let aApi: ReturnType<typeof api>;
let bApi: ReturnType<typeof api>;
const anon = api();
const url = (g: string) => `/api/groups/${g}/ai/process`;

beforeAll(async () => {
  a = await createTestUser("apa");
  b = await createTestUser("apb");
  g1 = (await a.client.rpc("create_group", { p_name: "Process API" })).data as string;
  aApi = api(await sessionCookie(a));
  bApi = api(await sessionCookie(b));
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("POST /api/groups/[id]/ai/process", () => {
  it("T4.4-7 signed-out callers get 401", async () => {
    expect((await anon.post(url(g1), {})).status).toBe(401);
  });

  it("T4.4-6 a non-member gets 404 and no job is touched", async () => {
    await admin.from("messages").insert({ group_id: g1, sender_id: a.id, type: "user", content: "queued" });
    const before = (await admin.from("ai_jobs").select("status").eq("group_id", g1)).data;
    expect((await bApi.post(url(g1), {})).status).toBe(404);
    expect((await bApi.post(url(randomUUID()), {})).status).toBe(404);
    expect((await bApi.post(url("not-a-uuid"), {})).status).toBe(404);
    expect((await admin.from("ai_jobs").select("status").eq("group_id", g1)).data).toEqual(before);
  });

  it("a member gets a plain result object; with AI switched off nothing is processed", async () => {
    const res = await aApi.post(url(g1), {});
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, failed: 0, more: false });
    expect((await admin.from("ai_jobs").select("status").eq("group_id", g1)).data!.every((j) => j.status === "queued")).toBe(true);
  });

  it("T4.4-8 the browser cannot call the job functions directly", async () => {
    expect((await a.client.rpc("claim_next_job", { p_group_id: g1 })).error).not.toBeNull();
  });
});
