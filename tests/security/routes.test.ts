import { randomUUID } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";
import { api, BASE, sessionCookie } from "../helpers/http";

/**
 * T5.4-2: every API route x {signed out, signed in but not a member, member}. The route list is checked against
 * the files on disk, so adding a route without adding it here fails the test.
 */
let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let g: string;
let jobId: string;

type Call = { name: string; file: string; run: (a: ReturnType<typeof api>) => Promise<Response> };
const url = (suffix: string) => `/api/groups/${g}${suffix}`;

const routes: Array<Call & { signedOut: number; outsider: number; member: number }> = [
  { name: "GET /api/health", file: "api/health", run: (a) => a.get("/api/health"), signedOut: 200, outsider: 200, member: 200 },
  { name: "GET /api/me", file: "api/me", run: (a) => a.get("/api/me"), signedOut: 401, outsider: 200, member: 200 },
  { name: "GET messages", file: "api/groups/[id]/messages", run: (a) => a.get(url("/messages")), signedOut: 401, outsider: 404, member: 200 },
  { name: "POST messages", file: "api/groups/[id]/messages", run: (a) => a.post(url("/messages"), { content: "route matrix" }), signedOut: 401, outsider: 404, member: 201 },
  { name: "GET invitations", file: "api/groups/[id]/invitations", run: (a) => a.get(url("/invitations")), signedOut: 401, outsider: 404, member: 403 },
  { name: "POST invitations", file: "api/groups/[id]/invitations", run: (a) => a.post(url("/invitations"), {}), signedOut: 401, outsider: 404, member: 403 },
  { name: "DELETE invitation", file: "api/groups/[id]/invitations/[inviteId]", run: (a) => a.delete(url(`/invitations/${randomUUID()}`)), signedOut: 401, outsider: 404, member: 403 },
  { name: "POST ai/process", file: "api/groups/[id]/ai/process", run: (a) => a.post(url("/ai/process"), {}), signedOut: 401, outsider: 404, member: 200 },
  { name: "POST ai/retry", file: "api/groups/[id]/ai/retry", run: (a) => a.post(url("/ai/retry"), { jobId }), signedOut: 401, outsider: 404, member: 409 },
  { name: "POST invitations/redeem", file: "api/invitations/redeem", run: (a) => a.post("/api/invitations/redeem", { token: "x".repeat(43) }), signedOut: 401, outsider: 200, member: 200 },
];

function routeFiles(dir: string, base = ""): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    if (statSync(full).isDirectory()) return routeFiles(full, rel);
    return name === "route.ts" ? [path.dirname(rel).replace(/\\/g, "/")] : [];
  });
}

beforeAll(async () => {
  owner = await createTestUser("rxo");
  member = await createTestUser("rxm");
  outsider = await createTestUser("rxx");
  g = (await owner.client.rpc("create_group", { p_name: "Route matrix" })).data as string;
  await admin.from("group_members").insert({ group_id: g, user_id: member.id, role: "member" });
  const { data: m } = await admin.from("messages").insert({ group_id: g, sender_id: owner.id, type: "user", content: "seed" }).select("id").single();
  jobId = (await admin.from("ai_jobs").select("id").eq("trigger_message_id", m!.id).single()).data!.id;
});
afterAll(async () => {
  await cleanupTestUsers();
});

describe("T5.4-2 route authorization matrix", () => {
  it("lists every route file in src/app/api (and the auth routes are covered by tests/auth)", () => {
    const onDisk = routeFiles(path.resolve(process.cwd(), "src/app/api")).map((p) => `api/${p}`).sort();
    const covered = [...new Set(routes.map((r) => r.file))].sort();
    expect(covered).toEqual(onDisk);
  });

  for (const r of routes) {
    it(`${r.name}: signed out ${r.signedOut}, not a member ${r.outsider}, member ${r.member}`, async () => {
      expect((await r.run(api())).status, "signed out").toBe(r.signedOut);
      expect((await r.run(api(await sessionCookie(outsider)))).status, "outsider").toBe(r.outsider);
      expect((await r.run(api(await sessionCookie(member)))).status, "member").toBe(r.member);
    });
  }

  it("the owner can do the owner-only things", async () => {
    const o = api(await sessionCookie(owner));
    expect((await o.get(url("/invitations"))).status).toBe(200);
    expect((await o.post(url("/invitations"), {})).status).toBe(201);
  });
});

describe("T5.4-6 security headers on a running app", () => {
  for (const p of ["/", "/login", "/api/health", "/join/abc"]) {
    it(`${p} carries the standard headers`, async () => {
      const res = await fetch(`${BASE}${p}`, { redirect: "manual" });
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
      // Frame blocking and the CSP are production-only (tests/e2e/csp.spec.ts checks them on a production build).
      const frame = res.headers.get("x-frame-options");
      if (frame) expect(frame).toBe("DENY");
      expect(res.headers.get("permissions-policy")).toContain("camera=()");
      // The CSP is applied to production builds only (see tests/e2e/csp.spec.ts); a dev server sends none.
      const csp = res.headers.get("content-security-policy");
      if (csp) {
        expect(csp).toContain("default-src 'self'");
        expect(csp).toContain("frame-ancestors 'none'");
      }
    });
  }
  it("pages that carry invitation tokens send no referrer at all", async () => {
    for (const p of ["/login", "/join/abc"]) {
      expect((await fetch(`${BASE}${p}`, { redirect: "manual" })).headers.get("referrer-policy")).toBe("no-referrer");
    }
    expect((await fetch(`${BASE}/`, { redirect: "manual" })).headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");
  });
});
