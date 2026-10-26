import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

let a: TestUser;
let b: TestUser;
let g1: string; // owned by A
let g2: string; // owned by B

beforeAll(async () => {
  a = await createTestUser("a");
  b = await createTestUser("b");
  const r1 = await a.client.rpc("create_group", { p_name: "G1", p_member_limit: 5 });
  const r2 = await b.client.rpc("create_group", { p_name: "G2", p_member_limit: 5 });
  expect(r1.error).toBeNull();
  expect(r2.error).toBeNull();
  g1 = r1.data as string;
  g2 = r2.data as string;
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("profiles", () => {
  it("T1.1-1 creates a profile automatically for a new user", async () => {
    const { data, error } = await a.client.from("profiles").select("id, display_name").eq("id", a.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].display_name).not.toBe("");
  });

  it("a user cannot read an unrelated user's profile", async () => {
    const { data } = await a.client.from("profiles").select("id").eq("id", b.id);
    expect(data).toHaveLength(0);
  });

  it("a user can update their own display name but not someone else's", async () => {
    const own = await a.client.from("profiles").update({ display_name: "Alice" }).eq("id", a.id).select();
    expect(own.data).toHaveLength(1);
    const other = await a.client.from("profiles").update({ display_name: "Hacked" }).eq("id", b.id).select();
    expect(other.data ?? []).toHaveLength(0);
  });
});

describe("groups", () => {
  it("T1.1-2 create_group makes the group and the owner membership atomically", async () => {
    const { data: group } = await a.client.from("groups").select("id, name, owner_id, member_limit").eq("id", g1).single();
    expect(group).toMatchObject({ name: "G1", owner_id: a.id, member_limit: 5 });
    const { data: members } = await a.client.from("group_members").select("user_id, role").eq("group_id", g1);
    expect(members).toEqual([{ user_id: a.id, role: "owner" }]);
  });

  it("T1.1-3 a non-member cannot read the group", async () => {
    const { data } = await b.client.from("groups").select("id").eq("id", g1);
    expect(data).toHaveLength(0);
  });

  it("T1.1-4 a non-member cannot read the member list", async () => {
    const { data } = await b.client.from("group_members").select("user_id").eq("group_id", g1);
    expect(data).toHaveLength(0);
  });

  it("T1.1-5 a user cannot add themselves to a group", async () => {
    const { error } = await b.client.from("group_members").insert({ group_id: g1, user_id: b.id, role: "member" });
    expect(error).not.toBeNull();
    const { data } = await admin.from("group_members").select("user_id").eq("group_id", g1);
    expect(data!.map((m) => m.user_id)).toEqual([a.id]);
  });

  it("T1.1-6 direct inserts into groups are blocked", async () => {
    const { error } = await a.client.from("groups").insert({ name: "Sneaky", owner_id: a.id });
    expect(error).not.toBeNull();
  });

  it("T1.1-7 two groups are isolated from each other", async () => {
    const la = await a.client.from("groups").select("id");
    const lb = await b.client.from("groups").select("id");
    expect(la.data!.map((g) => g.id)).toEqual([g1]);
    expect(lb.data!.map((g) => g.id)).toEqual([g2]);
  });

  it("T1.1-8 a non-owner member cannot rename or delete the group", async () => {
    await admin.from("group_members").insert({ group_id: g1, user_id: b.id, role: "member" });
    const rename = await b.client.from("groups").update({ name: "Mine now" }).eq("id", g1).select();
    expect(rename.data ?? []).toHaveLength(0);
    const del = await b.client.from("groups").delete().eq("id", g1).select();
    expect(del.data ?? []).toHaveLength(0);
    const { data } = await admin.from("groups").select("name").eq("id", g1).single();
    expect(data!.name).toBe("G1");
    await admin.from("group_members").delete().eq("group_id", g1).eq("user_id", b.id);
  });

  it("the owner can rename but cannot change protected columns", async () => {
    const ok = await a.client.from("groups").update({ name: "G1 renamed" }).eq("id", g1).select();
    expect(ok.data).toHaveLength(1);
    const limit = await a.client.from("groups").update({ member_limit: 50 }).eq("id", g1).select();
    expect(limit.error).not.toBeNull();
    const owner = await a.client.from("groups").update({ owner_id: b.id }).eq("id", g1).select();
    expect(owner.error).not.toBeNull();
  });

  it("T1.1-9 create_group validates its input", async () => {
    for (const name of ["", "   ", "x".repeat(81)]) {
      const { error } = await a.client.rpc("create_group", { p_name: name });
      expect(error, `name length ${name.length}`).not.toBeNull();
    }
    const badLimit = await a.client.rpc("create_group", { p_name: "ok", p_member_limit: 1 });
    expect(badLimit.error).not.toBeNull();
  });

  it("a member's profile becomes visible to other members only", async () => {
    await admin.from("group_members").insert({ group_id: g1, user_id: b.id, role: "member" });
    const { data } = await b.client.from("profiles").select("id").eq("id", a.id);
    expect(data).toHaveLength(1);
    await admin.from("group_members").delete().eq("group_id", g1).eq("user_id", b.id);
    const after = await b.client.from("profiles").select("id").eq("id", a.id);
    expect(after.data).toHaveLength(0);
  });
});

describe("anonymous access", () => {
  it("T1.1-10 sees nothing and cannot call create_group", async () => {
    const anon = anonClient();
    for (const table of ["profiles", "groups", "group_members"]) {
      const { data } = await anon.from(table).select("*");
      expect(data ?? [], table).toHaveLength(0);
    }
    const rpc = await anon.rpc("create_group", { p_name: "anon group" });
    expect(rpc.error).not.toBeNull();
  });
});
