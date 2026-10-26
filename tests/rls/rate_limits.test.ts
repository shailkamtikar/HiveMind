import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser;
let b: TestUser;

const hit = async (user: string, bucket: string, max = 3, windowSeconds = 60) => {
  const { data, error } = await admin.rpc("check_rate_limit", {
    p_user_id: user,
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as { allowed: boolean; retry_after: number };
};

beforeAll(async () => {
  a = await createTestUser("rla");
  b = await createTestUser("rlb");
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("check_rate_limit", () => {
  it("T5.3-1 / T5.3-2 allows up to the limit, then refuses with a sensible retry time", async () => {
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await hit(a.id, "t1"));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    const denied = results[3];
    expect(denied.retry_after).toBeGreaterThanOrEqual(1);
    expect(denied.retry_after).toBeLessThanOrEqual(60);
  });

  it("T5.3-4 limits are per user", async () => {
    for (let i = 0; i < 4; i++) await hit(a.id, "t2");
    expect((await hit(a.id, "t2")).allowed).toBe(false);
    expect((await hit(b.id, "t2")).allowed).toBe(true);
  });

  it("buckets are independent", async () => {
    for (let i = 0; i < 4; i++) await hit(a.id, "t3a");
    expect((await hit(a.id, "t3a")).allowed).toBe(false);
    expect((await hit(a.id, "t3b")).allowed).toBe(true);
  });

  it("T5.3-3 a new window starts fresh", async () => {
    for (let i = 0; i < 4; i++) await hit(a.id, "t4");
    expect((await hit(a.id, "t4")).allowed).toBe(false);
    await admin.from("rate_limits").update({ window_start: new Date(Date.now() - 3_600_000).toISOString() }).eq("user_id", a.id).eq("bucket", "t4");
    expect((await hit(a.id, "t4")).allowed).toBe(true);
  });

  it("concurrent hits are counted exactly: no more than the limit get through", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => hit(b.id, "t5", 5, 3600)));
    expect(results.filter((r) => r.allowed)).toHaveLength(5);
  });

  it("rejects nonsense limits", async () => {
    await expect(hit(a.id, "t6", 0)).rejects.toThrow();
    await expect(hit(a.id, "t6", 5, 0)).rejects.toThrow();
  });
});

describe("T5.3-7 clients cannot touch the limiter", () => {
  it("members cannot read, write or call it", async () => {
    await hit(a.id, "t7");
    expect((await a.client.from("rate_limits").select("*")).data ?? []).toHaveLength(0);
    expect((await a.client.from("rate_limits").insert({ user_id: a.id, bucket: "x", window_start: new Date().toISOString() })).error).not.toBeNull();
    expect((await a.client.from("rate_limits").delete().eq("user_id", a.id).select()).data ?? []).toHaveLength(0);
    expect((await a.client.rpc("check_rate_limit", { p_user_id: b.id, p_bucket: "t7", p_max: 1, p_window_seconds: 60 })).error).not.toBeNull();
    expect((await anonClient().rpc("check_rate_limit", { p_user_id: b.id, p_bucket: "t7", p_max: 1, p_window_seconds: 60 })).error).not.toBeNull();
  });
});
