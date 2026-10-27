import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken } from "../../src/lib/invites/token";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let owner: TestUser;
let member: TestUser;
let other: TestUser;
let outsider: TestUser;

const remove = (u: TestUser, group: string, who: string) => u.client.rpc("remove_member", { p_group_id: group, p_user_id: who });
const redeem = async (u: TestUser, hash: string) => {
  const { data, error } = await u.client.rpc("redeem_invitation", { p_token_hash: hash });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as { status: string; group_id: string | null };
};

/** A group with `member` and `other` in it. */
async function room() {
  const group = (await owner.client.rpc("create_group", { p_name: "Removals" })).data as string;
  await admin.from("group_members").insert([
    { group_id: group, user_id: member.id, role: "member" },
    { group_id: group, user_id: other.id, role: "member" },
  ]);
  return group;
}
async function invite(group: string, createdAt?: string) {
  const { token, hash } = generateInviteToken();
  await admin.from("invitations").insert({
    group_id: group,
    token_hash: hash,
    created_by: owner.id,
    expires_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    ...(createdAt ? { created_at: createdAt } : {}),
  });
  return { token, hash };
}

beforeAll(async () => {
  owner = await createTestUser("rmo");
  member = await createTestUser("rmm");
  other = await createTestUser("rmx");
  outsider = await createTestUser("rmz");
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("remove_member", () => {
  it("the owner removes a member: access ends at once, their messages stay, others are untouched", async () => {
    const group = await room();
    await admin.from("messages").insert({ group_id: group, sender_id: member.id, type: "user", content: "I was here" });
    expect((await member.client.from("messages").select("id").eq("group_id", group)).data).toHaveLength(1);

    expect((await remove(owner, group, member.id)).data).toBe(true);

    expect((await member.client.from("messages").select("id").eq("group_id", group)).data).toHaveLength(0);
    expect((await member.client.from("groups").select("id").eq("id", group)).data).toHaveLength(0);
    const post = await member.client.from("messages").insert({ group_id: group, sender_id: member.id, type: "user", content: "still here?" });
    expect(post.error).not.toBeNull();
    // Their earlier message is still part of the history for everyone else.
    expect((await other.client.from("messages").select("content").eq("group_id", group)).data!.map((m) => m.content)).toContain("I was here");
    expect((await other.client.from("groups").select("id").eq("id", group)).data).toHaveLength(1);
  });

  it("only the owner can do it; the owner cannot remove themselves; unknown people give false", async () => {
    const group = await room();
    expect((await remove(member, group, other.id)).error?.code).toBe("42501");
    expect((await remove(outsider, group, other.id)).error?.code).toBe("42501");
    expect((await remove(owner, group, owner.id)).error?.code).toBe("22023");
    expect((await remove(owner, group, randomUUID())).data).toBe(false);
    expect((await remove(owner, group, outsider.id)).data).toBe(false); // not in the group
    expect((await anonClient().rpc("remove_member", { p_group_id: group, p_user_id: other.id })).error).not.toBeNull();
    expect((await admin.from("group_members").select("user_id").eq("group_id", group)).data).toHaveLength(3);
  });

  it("revoking an invitation does not remove people who joined with it", async () => {
    const group = await room();
    const { hash } = await invite(group);
    expect((await redeem(outsider, hash)).status).toBe("joined");
    await admin.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("token_hash", hash);
    expect((await outsider.client.from("groups").select("id").eq("id", group)).data).toHaveLength(1);
    expect((await remove(owner, group, outsider.id)).data).toBe(true); // removing is the way to cut someone off
    expect((await outsider.client.from("groups").select("id").eq("id", group)).data).toHaveLength(0);
  });

  it("a removed person cannot use a link that already existed, but can use a new one", async () => {
    const group = await room();
    const old = await invite(group);
    expect((await redeem(outsider, old.hash)).status).toBe("joined");
    expect((await remove(owner, group, outsider.id)).data).toBe(true);

    expect(await redeem(outsider, old.hash)).toEqual({ status: "invalid", group_id: null });
    expect((await admin.from("group_members").select("user_id").eq("group_id", group).eq("user_id", outsider.id)).data).toHaveLength(0);

    const fresh = await invite(group, new Date(Date.now() + 5000).toISOString()); // created after the removal
    expect(await redeem(outsider, fresh.hash)).toEqual({ status: "joined", group_id: group });
  });

  it("a removal and a join racing for the same group end consistently", async () => {
    const group = await room();
    const { hash } = await invite(group);
    await Promise.all([remove(owner, group, member.id), redeem(outsider, hash)]);
    const ids = (await admin.from("group_members").select("user_id").eq("group_id", group)).data!.map((m) => m.user_id);
    expect(ids).not.toContain(member.id);
    expect(ids).toContain(outsider.id);
    expect(ids).toHaveLength(3); // owner, other, outsider
  });
});

describe("group_removals is server-only", () => {
  it("clients cannot read or write it", async () => {
    const group = await room();
    await remove(owner, group, member.id);
    for (const u of [owner, member, outsider]) {
      expect((await u.client.from("group_removals").select("*")).data ?? []).toHaveLength(0);
      expect((await u.client.from("group_removals").delete().eq("group_id", group).select()).data ?? []).toHaveLength(0);
    }
    expect((await admin.from("group_removals").select("user_id").eq("group_id", group)).data).toHaveLength(1);
  });
});
