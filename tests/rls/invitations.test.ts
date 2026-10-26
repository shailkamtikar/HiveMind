import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken } from "../../src/lib/invites/token";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let owner: TestUser; // owns G1
let member: TestUser; // plain member of G1
let outsider: TestUser; // owns G2, not in G1
let g1: string;
let g2: string;

const create = (u: TestUser, group: string, hash = generateInviteToken().hash, days = 3) =>
  u.client.rpc("create_invitation", { p_group_id: group, p_token_hash: hash, p_expiry_days: days });

beforeAll(async () => {
  owner = await createTestUser("io");
  member = await createTestUser("im");
  outsider = await createTestUser("ix");
  g1 = (await owner.client.rpc("create_group", { p_name: "Invites G1" })).data as string;
  g2 = (await outsider.client.rpc("create_group", { p_name: "Invites G2" })).data as string;
  await admin.from("group_members").insert({ group_id: g1, user_id: member.id, role: "member" });
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("creating", () => {
  it("T3.1-1 / T3.1-9 the owner can create one; expiry is set by the database (about 3 days)", async () => {
    const { data, error } = await create(owner, g1);
    expect(error).toBeNull();
    const row = Array.isArray(data) ? data[0] : data;
    const days = (new Date(row.expires_at).getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(2.99);
    expect(days).toBeLessThan(3.01);
  });

  it("T3.1-3 a plain member cannot create one", async () => {
    const { error } = await create(member, g1);
    expect(error?.code).toBe("42501");
  });

  it("T3.1-4 a non-member cannot create one", async () => {
    const { error } = await create(outsider, g1);
    expect(error?.code).toBe("42501");
  });

  it("anonymous callers cannot call the function at all", async () => {
    const { error } = await anonClient().rpc("create_invitation", {
      p_group_id: g1,
      p_token_hash: generateInviteToken().hash,
      p_expiry_days: 3,
    });
    expect(error).not.toBeNull();
  });

  it("rejects malformed hashes and silly expiry values", async () => {
    expect((await create(owner, g1, "not-a-hash")).error).not.toBeNull();
    expect((await create(owner, g1, undefined, 0)).error).not.toBeNull();
    expect((await create(owner, g1, undefined, 31)).error).not.toBeNull();
  });

  it("the same hash cannot be stored twice", async () => {
    const { hash } = generateInviteToken();
    expect((await create(owner, g1, hash)).error).toBeNull();
    expect((await create(owner, g1, hash)).error).not.toBeNull();
  });

  it("clients cannot write the table directly", async () => {
    const insert = await owner.client
      .from("invitations")
      .insert({ group_id: g1, token_hash: generateInviteToken().hash, expires_at: "2099-01-01T00:00:00Z" });
    expect(insert.error).not.toBeNull();
    const { data: any1 } = await admin.from("invitations").select("id").eq("group_id", g1).limit(1).single();
    const update = await owner.client.from("invitations").update({ revoked_at: null }).eq("id", any1!.id).select();
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true);
  });
});

describe("reading", () => {
  it("T3.1-7 only the owner sees invitations; a member and an outsider see none", async () => {
    expect(((await owner.client.from("invitations").select("id").eq("group_id", g1)).data ?? []).length).toBeGreaterThan(0);
    expect((await member.client.from("invitations").select("id").eq("group_id", g1)).data).toHaveLength(0);
    expect((await outsider.client.from("invitations").select("id").eq("group_id", g1)).data).toHaveLength(0);
    expect((await anonClient().from("invitations").select("id")).data ?? []).toHaveLength(0);
  });

  it("T3.1-2 not even the owner can read the token hash column", async () => {
    const { error } = await owner.client.from("invitations").select("token_hash").eq("group_id", g1);
    expect(error).not.toBeNull();
    const { error: star } = await owner.client.from("invitations").select("*").eq("group_id", g1);
    expect(star).not.toBeNull();
  });

  it("T3.1-2 the stored value is a hash of the token, never the token", async () => {
    const { token, hash } = generateInviteToken();
    await create(owner, g1, hash);
    const { data } = await admin.from("invitations").select("*").eq("token_hash", hash).single();
    expect(JSON.stringify(data)).not.toContain(token);
  });
});

describe("revoking", () => {
  it("T3.1-5 the owner can revoke; the invitation is marked, not deleted", async () => {
    const { data } = await create(owner, g1);
    const id = (Array.isArray(data) ? data[0] : data).id;
    const res = await owner.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: id });
    expect(res.error).toBeNull();
    expect(res.data).toBe(true);
    const { data: row } = await admin.from("invitations").select("revoked_at").eq("id", id).single();
    expect(row!.revoked_at).not.toBeNull();
    // Revoking twice finds nothing to do.
    expect((await owner.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: id })).data).toBe(false);
  });

  it("T3.1-6 an owner cannot revoke another group's invitation, even through their own group id", async () => {
    const { data } = await create(outsider, g2);
    const foreign = (Array.isArray(data) ? data[0] : data).id;
    const res = await owner.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: foreign });
    expect(res.data).toBe(false);
    const direct = await owner.client.rpc("revoke_invitation", { p_group_id: g2, p_invitation_id: foreign });
    expect(direct.error?.code).toBe("42501");
    const { data: row } = await admin.from("invitations").select("revoked_at").eq("id", foreign).single();
    expect(row!.revoked_at).toBeNull();
  });

  it("members, outsiders and unknown ids cannot revoke anything", async () => {
    const { data } = await create(owner, g1);
    const id = (Array.isArray(data) ? data[0] : data).id;
    expect((await member.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: id })).error?.code).toBe("42501");
    expect((await outsider.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: id })).error?.code).toBe("42501");
    expect((await owner.client.rpc("revoke_invitation", { p_group_id: g1, p_invitation_id: randomUUID() })).data).toBe(false);
    const { data: row } = await admin.from("invitations").select("revoked_at").eq("id", id).single();
    expect(row!.revoked_at).toBeNull();
  });
});

describe("lifecycle", () => {
  it("deleting a group removes its invitations", async () => {
    const o = await createTestUser("ilife");
    const g = (await o.client.rpc("create_group", { p_name: "Doomed" })).data as string;
    const { hash } = generateInviteToken();
    await create(o, g, hash);
    await o.client.from("groups").delete().eq("id", g);
    const { data } = await admin.from("invitations").select("id").eq("token_hash", hash);
    expect(data).toHaveLength(0);
  });
});
