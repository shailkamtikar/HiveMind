import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let g: string;
let ownerApi: ReturnType<typeof api>;
let memberApi: ReturnType<typeof api>;
let outsiderApi: ReturnType<typeof api>;
const anon = api();
const url = (group: string, who: string) => `/api/groups/${group}/members/${who}`;

beforeAll(async () => {
  owner = await createTestUser("mpo");
  member = await createTestUser("mpm");
  outsider = await createTestUser("mpx");
  g = (await owner.client.rpc("create_group", { p_name: "Members API" })).data as string;
  await admin.from("group_members").insert({ group_id: g, user_id: member.id, role: "member" });
  ownerApi = api(await sessionCookie(owner));
  memberApi = api(await sessionCookie(member));
  outsiderApi = api(await sessionCookie(outsider));
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("DELETE /api/groups/[id]/members/[userId]", () => {
  it("signed-out callers get 401; non-members get the same 404 as an unknown group", async () => {
    expect((await anon.delete(url(g, member.id))).status).toBe(401);
    expect((await outsiderApi.delete(url(g, member.id))).status).toBe(404);
    expect((await outsiderApi.delete(url(randomUUID(), member.id))).status).toBe(404);
  });

  it("a plain member gets 403 and nobody is removed", async () => {
    expect((await memberApi.delete(url(g, member.id))).status).toBe(403);
    expect((await admin.from("group_members").select("user_id").eq("group_id", g)).data).toHaveLength(2);
  });

  it("the owner cannot remove themselves, and bad or unknown ids are refused", async () => {
    expect((await ownerApi.delete(url(g, owner.id))).status).toBe(400);
    expect((await ownerApi.delete(url(g, "not-a-uuid"))).status).toBe(404);
    expect((await ownerApi.delete(url(g, randomUUID()))).status).toBe(404);
  });

  it("the owner removes a member; that person's next message is refused", async () => {
    expect((await memberApi.post(`/api/groups/${g}/messages`, { content: "before" })).status).toBe(201);
    const res = await ownerApi.delete(url(g, member.id));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ removed: true });
    expect((await memberApi.post(`/api/groups/${g}/messages`, { content: "after" })).status).toBe(404);
    expect((await memberApi.get(`/api/groups/${g}/messages`)).status).toBe(404);
    expect((await ownerApi.delete(url(g, member.id))).status).toBe(404); // already gone
  });

  it("revoking a link leaves its members in place until the owner removes them", async () => {
    const res = await ownerApi.post(`/api/groups/${g}/invitations`, {});
    const { invitation } = await res.json();
    const token = (invitation.url as string).split("/join/")[1];
    expect((await (await outsiderApi.post("/api/invitations/redeem", { token })).json()).status).toBe("joined");
    expect((await ownerApi.delete(`/api/groups/${g}/invitations/${invitation.id}`)).status).toBe(200);
    expect((await outsiderApi.post(`/api/groups/${g}/messages`, { content: "still allowed" })).status).toBe(201);
    expect((await ownerApi.delete(url(g, outsider.id))).status).toBe(200);
    expect((await outsiderApi.post(`/api/groups/${g}/messages`, { content: "now refused" })).status).toBe(404);
  });
});
