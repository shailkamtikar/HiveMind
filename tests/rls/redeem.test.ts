import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken, hashInviteToken } from "../../src/lib/invites/token";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let owner: TestUser;
let g: string; // main group

type Redeem = { status: string; group_id: string | null };
const redeem = async (u: { client: TestUser["client"] }, hash: string): Promise<Redeem> => {
  const { data, error } = await u.client.rpc("redeem_invitation", { p_token_hash: hash });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as Redeem;
};

/** Stores an invitation straight through the service role, so each test controls its state. */
async function invite(group: string, opts: { expiresAt?: string; revoked?: boolean } = {}) {
  const { token, hash } = generateInviteToken();
  const { error } = await admin.from("invitations").insert({
    group_id: group,
    token_hash: hash,
    created_by: owner.id,
    expires_at: opts.expiresAt ?? new Date(Date.now() + 3 * 86_400_000).toISOString(),
    revoked_at: opts.revoked ? new Date().toISOString() : null,
  });
  expect(error).toBeNull();
  return { token, hash };
}

const members = async (group: string) =>
  (await admin.from("group_members").select("user_id").eq("group_id", group)).data!.map((m) => m.user_id);

beforeAll(async () => {
  owner = await createTestUser("ro");
  g = (await owner.client.rpc("create_group", { p_name: "Redeem G" })).data as string;
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("joining", () => {
  it("T3.2-1 a valid link makes the caller a member, not an owner", async () => {
    const b = await createTestUser("rb");
    const { hash } = await invite(g);
    expect(await redeem(b, hash)).toEqual({ status: "joined", group_id: g });
    const { data } = await admin.from("group_members").select("role").eq("group_id", g).eq("user_id", b.id).single();
    expect(data!.role).toBe("member");
  });

  it("T3.2-2 redeeming again says already_member and adds no second row", async () => {
    const b = await createTestUser("rb2");
    const { hash } = await invite(g);
    await redeem(b, hash);
    expect(await redeem(b, hash)).toEqual({ status: "already_member", group_id: g });
    const rows = (await members(g)).filter((id) => id === b.id);
    expect(rows).toHaveLength(1);
  });

  it("the owner opening their own link is just an existing member", async () => {
    const { hash } = await invite(g);
    expect((await redeem(owner, hash)).status).toBe("already_member");
  });

  it("T3.2-9 a new member can read the messages sent before they joined", async () => {
    const group = (await owner.client.rpc("create_group", { p_name: "History G" })).data as string;
    await admin.from("messages").insert([
      { group_id: group, sender_id: owner.id, type: "user", content: "before you" },
      { group_id: group, sender_id: null, type: "assistant", content: "welcome" },
    ]);
    const b = await createTestUser("rh");
    expect((await b.client.from("messages").select("id").eq("group_id", group)).data).toHaveLength(0);
    await redeem(b, (await invite(group)).hash);
    const { data } = await b.client.from("messages").select("content").eq("group_id", group).order("seq");
    expect(data!.map((m) => m.content)).toEqual(["before you", "welcome"]);
  });

  it("T3.2-10 revoking an invitation does not remove people who already joined", async () => {
    const group = (await owner.client.rpc("create_group", { p_name: "Revoke G" })).data as string;
    const b = await createTestUser("rr");
    const { hash } = await invite(group);
    await redeem(b, hash);
    await admin.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
    expect(await members(group)).toContain(b.id);
    expect((await b.client.from("groups").select("id").eq("id", group)).data).toHaveLength(1);
  });
});

describe("links that do not work all look the same", () => {
  it("T3.2-3 / T3.2-4 / T3.2-5 revoked, expired, unknown and malformed links answer identically", async () => {
    const b = await createTestUser("ri");
    const revoked = await invite(g, { revoked: true });
    const expired = await invite(g, { expiresAt: new Date(Date.now() - 1000).toISOString() });
    const unknown = generateInviteToken();
    const answers = [
      await redeem(b, revoked.hash),
      await redeem(b, expired.hash),
      await redeem(b, unknown.hash),
      await redeem(b, "abc"),
      await redeem(b, ""),
      await redeem(b, hashInviteToken("x").toUpperCase()),
    ];
    for (const a of answers) expect(a).toEqual({ status: "invalid", group_id: null }); // T3.2-11: no group id leaks
    expect(await members(g)).not.toContain(b.id);
  });

  it("an invitation whose group no longer exists is invalid", async () => {
    const o = await createTestUser("rg");
    const doomed = (await o.client.rpc("create_group", { p_name: "Doomed" })).data as string;
    const { hash } = await invite(doomed);
    await admin.from("groups").delete().eq("id", doomed);
    const b = await createTestUser("rg2");
    expect((await redeem(b, hash)).status).toBe("invalid");
  });
});

describe("capacity", () => {
  // A small pool of filler members is reused across groups (a user can belong to many), which keeps
  // the number of sign-ins low so these tests do not trip the auth service's rate limit.
  let pool: TestUser[] = [];
  beforeAll(async () => {
    pool = [await createTestUser("rp1"), await createTestUser("rp2"), await createTestUser("rp3"), await createTestUser("rp4")];
  });

  async function fullGroup(count: number, limit = 5) {
    const group = (await owner.client.rpc("create_group", { p_name: "Cap", p_member_limit: limit })).data as string;
    for (let i = 0; i < count - 1; i++) {
      await admin.from("group_members").insert({ group_id: group, user_id: pool[i].id, role: "member" });
    }
    return group;
  }

  it("T3.2-6 a full group refuses a new member and does not add them", async () => {
    const group = await fullGroup(5);
    const b = await createTestUser("rf");
    expect(await redeem(b, (await invite(group)).hash)).toEqual({ status: "full", group_id: null });
    expect(await members(group)).not.toContain(b.id);
    expect(await members(group)).toHaveLength(5);
  });

  it("an existing member of a full group still gets already_member, not full", async () => {
    const group = await fullGroup(5); // owner + 4 pool members = 5 of 5
    expect(await redeem(pool[0], (await invite(group)).hash)).toEqual({ status: "already_member", group_id: group });
    expect(await members(group)).toHaveLength(5);
  });

  it("T3.2-7 three people racing for the last seat: exactly one joins, two are told full", async () => {
    const racers = await Promise.all([createTestUser("rr1"), createTestUser("rr2"), createTestUser("rr3")]);
    // Repeated with a fresh group each time: a race that is only usually safe is not safe.
    for (let round = 0; round < 10; round++) {
      const group = await fullGroup(4);
      const { hash } = await invite(group);
      const results = await Promise.all(racers.map((u) => redeem(u, hash)));
      expect(results.map((r) => r.status).sort(), `round ${round}`).toEqual(["full", "full", "joined"]);
      expect(await members(group), `round ${round}`).toHaveLength(5);
    }
  });

  it("the same person redeeming twice at once is added once", async () => {
    const group = await fullGroup(2);
    const b = await createTestUser("rd");
    const { hash } = await invite(group);
    const results = await Promise.all([redeem(b, hash), redeem(b, hash), redeem(b, hash)]);
    expect(results.map((r) => r.status).sort()).toEqual(["already_member", "already_member", "joined"]);
    expect((await members(group)).filter((id) => id === b.id)).toHaveLength(1);
  });
});

describe("access", () => {
  it("T3.2-8 anonymous callers cannot run the function", async () => {
    const { error } = await anonClient().rpc("redeem_invitation", { p_token_hash: generateInviteToken().hash });
    expect(error).not.toBeNull();
  });
});
