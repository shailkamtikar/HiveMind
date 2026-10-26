import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken } from "../../src/lib/invites/token";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, BASE, sessionCookie } from "../helpers/http";

let owner: TestUser;
let guest: TestUser;
let group: string;
let ownerApi: ReturnType<typeof api>;
let guestApi: ReturnType<typeof api>;
const anon = api();

const redeem = (a: ReturnType<typeof api>, token: unknown) => a.post("/api/invitations/redeem", { token });
const newLink = async () => {
  const { invitation } = await (await ownerApi.post(`/api/groups/${group}/invitations`, {})).json();
  return { id: invitation.id as string, token: (invitation.url as string).split("/join/")[1] };
};

beforeAll(async () => {
  owner = await createTestUser("pxo");
  guest = await createTestUser("pxg");
  group = (await owner.client.rpc("create_group", { p_name: "Redeem API" })).data as string;
  ownerApi = api(await sessionCookie(owner));
  guestApi = api(await sessionCookie(guest));
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("POST /api/invitations/redeem", () => {
  it("signed-out callers get 401", async () => {
    expect((await redeem(anon, generateInviteToken().token)).status).toBe(401);
  });

  it("T3.2-1 / T3.2-2 joins once, then reports already_member, always with the group id", async () => {
    const { token } = await newLink();
    expect(await (await redeem(guestApi, token)).json()).toEqual({ status: "joined", groupId: group });
    expect(await (await redeem(guestApi, token)).json()).toEqual({ status: "already_member", groupId: group });
    const { data } = await admin.from("group_members").select("user_id").eq("group_id", group).eq("user_id", guest.id);
    expect(data).toHaveLength(1);
  });

  it("T3.2-3 / T3.2-5 / T3.2-11 revoked, unknown and malformed tokens give one identical, group-free answer", async () => {
    const outsider = await createTestUser("pxx");
    const outsiderApi = api(await sessionCookie(outsider));
    const { id, token } = await newLink();
    await ownerApi.delete(`/api/groups/${group}/invitations/${id}`);
    const answers = [];
    for (const t of [token, generateInviteToken().token, "garbage", "a".repeat(43) + "!", ""]) {
      const res = await redeem(outsiderApi, t);
      expect(res.status).toBe(200);
      answers.push(await res.json());
    }
    for (const a of answers) expect(a).toEqual({ status: "invalid" });
    expect(JSON.stringify(answers)).not.toContain(group);
    const { data } = await admin.from("group_members").select("user_id").eq("group_id", group).eq("user_id", outsider.id);
    expect(data).toHaveLength(0);
  });

  it("rejects bodies that are not JSON or carry no string token", async () => {
    for (const body of ["not json", "null", "{}", JSON.stringify({ token: 5 })]) {
      expect((await guestApi.post("/api/invitations/redeem", body)).status, body).toBe(400);
    }
  });

  it("is POST only, so a link preview cannot consume an invitation", async () => {
    expect((await guestApi.get("/api/invitations/redeem")).status).toBe(405);
  });

  it("T3.3-9 join pages send no Referer, so the token never leaks to other sites", async () => {
    const res = await fetch(`${BASE}/join/${generateInviteToken().token}`, { redirect: "manual" });
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    const login = await fetch(`${BASE}/join/x`, { redirect: "manual" });
    expect(login.headers.get("referrer-policy")).toBe("no-referrer");
  });
});
