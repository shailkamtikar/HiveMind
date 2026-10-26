import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { requireEnv } from "../helpers/env";

/**
 * T5.4-3: which database functions can each role call? The list of functions the API exposes is read from the
 * running API itself, so a new function that nobody reviewed makes this test fail.
 */
const ONLY_SERVER = ["check_rate_limit", "claim_next_job", "complete_job", "fail_job"]; // service role only
const SIGNED_IN = [
  "create_group",
  "create_invitation",
  "is_group_member",
  "is_group_owner",
  "redeem_invitation",
  "retry_job",
  "revoke_invitation",
]; // each one checks auth.uid() itself

const dummyArgs: Record<string, Record<string, unknown>> = {
  check_rate_limit: { p_user_id: randomUUID(), p_bucket: "x", p_max: 1, p_window_seconds: 60 },
  claim_next_job: { p_group_id: randomUUID() },
  complete_job: { p_job_id: randomUUID(), p_content: "x" },
  fail_job: { p_job_id: randomUUID(), p_category: "quota" },
  create_group: { p_name: "x" },
  create_invitation: { p_group_id: randomUUID(), p_token_hash: "0".repeat(64), p_expiry_days: 3 },
  is_group_member: { gid: randomUUID() },
  is_group_owner: { gid: randomUUID() },
  redeem_invitation: { p_token_hash: "0".repeat(64) },
  retry_job: { p_job_id: randomUUID() },
  revoke_invitation: { p_group_id: randomUUID(), p_invitation_id: randomUUID() },
};

let exposed: string[] = [];
let user: TestUser;

beforeAll(async () => {
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const res = await fetch(`${requireEnv("NEXT_PUBLIC_SUPABASE_URL")}/rest/v1/`, { headers: { apikey: key, authorization: `Bearer ${key}` } });
  const spec = (await res.json()) as { paths: Record<string, unknown> };
  exposed = Object.keys(spec.paths)
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => p.slice(5))
    .sort();
  user = await createTestUser("fnu");
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("exposed functions", () => {
  it("are exactly the reviewed ones", () => {
    expect(exposed).toEqual([...ONLY_SERVER, ...SIGNED_IN].sort());
  });

  it("T5.4-3 anonymous callers can run none of them", async () => {
    const anon = anonClient();
    for (const fn of exposed) {
      const { error } = await anon.rpc(fn, dummyArgs[fn]);
      expect(error, `anon ${fn}`).not.toBeNull();
      expect(error!.code, `anon ${fn}`).toBe("42501");
    }
  });

  it("signed-in users cannot run the server-only functions", async () => {
    for (const fn of ONLY_SERVER) {
      const { error } = await user.client.rpc(fn, dummyArgs[fn]);
      expect(error, `authenticated ${fn}`).not.toBeNull();
      expect(error!.code, `authenticated ${fn}`).toBe("42501");
    }
  });

  it("the functions meant for signed-in users are actually callable (and refuse what they should)", async () => {
    // Callable: they answer or refuse for domain reasons, never with "permission denied for function".
    for (const fn of SIGNED_IN) {
      const { error } = await user.client.rpc(fn, dummyArgs[fn]);
      if (error) expect(error.message, fn).not.toMatch(/permission denied for function/i);
    }
  });
});
