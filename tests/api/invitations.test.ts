import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashInviteToken } from "../../src/lib/invites/token";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, sessionCookie } from "../helpers/http";

let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let g1: string;
let g2: string;
let ownerApi: ReturnType<typeof api>;
let memberApi: ReturnType<typeof api>;
let outsiderApi: ReturnType<typeof api>;
const anon = api();

const url = (g: string) => `/api/groups/${g}/invitations`;

beforeAll(async () => {
  owner = await createTestUser("ao");
  member = await createTestUser("am");
  outsider = await createTestUser("ax");
  g1 = (await owner.client.rpc("create_group", { p_name: "Inv API G1" })).data as string;
  g2 = (await outsider.client.rpc("create_group", { p_name: "Inv API G2" })).data as string;
  await admin.from("group_members").insert({ group_id: g1, user_id: member.id, role: "member" });
  ownerApi = api(await sessionCookie(owner));
  memberApi = api(await sessionCookie(member));
  outsiderApi = api(await sessionCookie(outsider));
});

afterAll(async () => {
  await cleanupTestUsers();
});

describe("creating", () => {
  it("T3.1-1 the owner gets a link once; the database holds only its hash", async () => {
    const res = await ownerApi.post(url(g1), {});
    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toContain("no-store");
    const { invitation } = await res.json();
    expect(invitation.url).toMatch(/^https?:\/\/[^/]+\/join\/[A-Za-z0-9_-]{43}$/);
    const token = invitation.url.split("/join/")[1];

    const { data: row } = await admin.from("invitations").select("*").eq("id", invitation.id).single();
    expect(row!.token_hash).toBe(hashInviteToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row!.group_id).toBe(g1);
    expect(row!.created_by).toBe(owner.id);
  });

  it("every call makes a different link", async () => {
    const a = (await (await ownerApi.post(url(g1), {})).json()).invitation.url;
    const b = (await (await ownerApi.post(url(g1), {})).json()).invitation.url;
    expect(a).not.toBe(b);
  });

  it("T3.1-3 a plain member gets 403 and nothing is stored", async () => {
    const before = (await admin.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", g1)).count;
    expect((await memberApi.post(url(g1), {})).status).toBe(403);
    const after = (await admin.from("invitations").select("id", { count: "exact", head: true }).eq("group_id", g1)).count;
    expect(after).toBe(before);
  });

  it("T3.1-4 a non-member gets the same 404 as an unknown or malformed group", async () => {
    const forbidden = await outsiderApi.post(url(g1), {});
    expect(forbidden.status).toBe(404);
    const body = await forbidden.json();
    expect((await outsiderApi.post(url(randomUUID()), {})).status).toBe(404);
    const bad = await outsiderApi.post(url("not-a-uuid"), {});
    expect(bad.status).toBe(404);
    expect(await bad.json()).toEqual(body);
  });

  it("signed-out callers get 401 on every method", async () => {
    expect((await anon.post(url(g1), {})).status).toBe(401);
    expect((await anon.get(url(g1))).status).toBe(401);
    expect((await anon.delete(`${url(g1)}/${randomUUID()}`)).status).toBe(401);
  });
});

describe("listing and revoking", () => {
  it("lists active invitations for the owner only, without any token", async () => {
    const res = await ownerApi.get(url(g1));
    expect(res.status).toBe(200);
    const { invitations } = await res.json();
    expect(invitations.length).toBeGreaterThan(0);
    for (const i of invitations) expect(Object.keys(i).sort()).toEqual(["created_at", "expires_at", "id"]);
    expect((await memberApi.get(url(g1))).status).toBe(403);
    expect((await outsiderApi.get(url(g1))).status).toBe(404);
  });

  it("T3.1-5 revoking removes it from the list and marks it in the database", async () => {
    const { invitation } = await (await ownerApi.post(url(g1), {})).json();
    const res = await ownerApi.delete(`${url(g1)}/${invitation.id}`);
    expect(res.status).toBe(200);
    const list = (await (await ownerApi.get(url(g1))).json()).invitations as { id: string }[];
    expect(list.some((i) => i.id === invitation.id)).toBe(false);
    const { data: row } = await admin.from("invitations").select("revoked_at").eq("id", invitation.id).single();
    expect(row!.revoked_at).not.toBeNull();
    expect((await ownerApi.delete(`${url(g1)}/${invitation.id}`)).status).toBe(404); // already revoked
  });

  it("T3.1-6 cross-group, member and outsider revokes are refused", async () => {
    const foreign = (await (await outsiderApi.post(url(g2), {})).json()).invitation.id;
    expect((await ownerApi.delete(`${url(g1)}/${foreign}`)).status).toBe(404);
    const mine = (await (await ownerApi.post(url(g1), {})).json()).invitation.id;
    expect((await memberApi.delete(`${url(g1)}/${mine}`)).status).toBe(403);
    expect((await outsiderApi.delete(`${url(g1)}/${mine}`)).status).toBe(404);
    expect((await ownerApi.delete(`${url(g1)}/not-a-uuid`)).status).toBe(404);
    const { data } = await admin.from("invitations").select("revoked_at").in("id", [foreign, mine]);
    expect(data!.every((r) => r.revoked_at === null)).toBe(true);
  });
});
