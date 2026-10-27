import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { generateInviteToken } from "../../src/lib/invites/token";
import { admin, anonClient, cleanupTestUsers, createTestUser, type TestUser } from "../helpers/users";

/**
 * T5.4-1: every table x {anon, non-member, member, owner} x {select, insert, update, delete}.
 * Each cell tries a realistic, well-formed operation and records whether the database allowed it.
 * The expected table below is the authorization model; anything that differs is a bug (or a decision to record).
 */

type Role = "anon" | "outsider" | "member" | "owner";
const ROLES: Role[] = ["anon", "outsider", "member", "owner"];

type Ctx = { client: SupabaseClient; uid: string | null; owner: TestUser; member: TestUser; outsider: TestUser; group: string; message: string; invitation: string };
type Attempt = (c: Ctx) => Promise<boolean>;
type Cell = { table: string; op: "select" | "insert" | "update" | "delete"; attempt: Attempt; allowed: Role[] };

const rows = (r: { data: unknown[] | null; error: unknown }) => !r.error && (r.data?.length ?? 0) > 0;

const cells: Cell[] = [
  // profiles: you can read people you share a group with, and edit only yourself
  { table: "profiles", op: "select", allowed: ["member", "owner"], attempt: async (c) => rows(await c.client.from("profiles").select("id").eq("id", c.owner.id)) },
  { table: "profiles", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("profiles").insert({ id: randomUUID(), display_name: "x" })).error },
  { table: "profiles", op: "update", allowed: ["owner"], attempt: async (c) => rows(await c.client.from("profiles").update({ display_name: "Owner" }).eq("id", c.owner.id).select()) },
  { table: "profiles", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("profiles").delete().eq("id", c.owner.id).select()) },

  // groups: members read; only the owner renames or deletes; creation goes through create_group()
  { table: "groups", op: "select", allowed: ["member", "owner"], attempt: async (c) => rows(await c.client.from("groups").select("id").eq("id", c.group)) },
  { table: "groups", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("groups").insert({ name: "sneaky", owner_id: c.uid ?? randomUUID() })).error },
  { table: "groups", op: "update", allowed: ["owner"], attempt: async (c) => rows(await c.client.from("groups").update({ name: "Matrix group" }).eq("id", c.group).select()) },
  {
    table: "groups",
    op: "delete",
    allowed: ["owner"],
    attempt: async (c) => {
      // A throwaway group per attempt, so a successful delete does not disturb the other cells.
      const { data } = await admin.from("groups").insert({ name: "disposable", owner_id: c.owner.id }).select("id").single();
      await admin.from("group_members").insert([
        { group_id: data!.id, user_id: c.owner.id, role: "owner" },
        { group_id: data!.id, user_id: c.member.id, role: "member" },
      ]);
      const ok = rows(await c.client.from("groups").delete().eq("id", data!.id).select());
      await admin.from("groups").delete().eq("id", data!.id);
      return ok;
    },
  },

  // group_members: visible to members; changed only through functions
  { table: "group_members", op: "select", allowed: ["member", "owner"], attempt: async (c) => rows(await c.client.from("group_members").select("user_id").eq("group_id", c.group)) },
  {
    table: "group_members",
    op: "insert",
    allowed: [],
    attempt: async (c) => {
      const r = await c.client.from("group_members").insert({ group_id: c.group, user_id: c.outsider.id, role: "member" });
      await admin.from("group_members").delete().eq("group_id", c.group).eq("user_id", c.outsider.id);
      return !r.error;
    },
  },
  { table: "group_members", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("group_members").update({ role: "owner" }).eq("group_id", c.group).eq("user_id", c.member.id).select()) },
  { table: "group_members", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("group_members").delete().eq("group_id", c.group).eq("user_id", c.member.id).select()) },

  // messages: members read and write as themselves; history is append-only
  { table: "messages", op: "select", allowed: ["member", "owner"], attempt: async (c) => rows(await c.client.from("messages").select("id").eq("group_id", c.group)) },
  { table: "messages", op: "insert", allowed: ["member", "owner"], attempt: async (c) => !(await c.client.from("messages").insert({ group_id: c.group, sender_id: c.uid ?? randomUUID(), type: "user", content: "matrix" })).error },
  { table: "messages", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("messages").update({ content: "edited" }).eq("id", c.message).select()) },
  { table: "messages", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("messages").delete().eq("id", c.message).select()) },

  // invitations: only the owner can even see them, and nobody writes directly
  { table: "invitations", op: "select", allowed: ["owner"], attempt: async (c) => rows(await c.client.from("invitations").select("id").eq("group_id", c.group)) },
  { table: "invitations", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("invitations").insert({ group_id: c.group, token_hash: generateInviteToken().hash, expires_at: "2099-01-01T00:00:00Z" })).error },
  { table: "invitations", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("invitations").update({ revoked_at: new Date().toISOString() }).eq("id", c.invitation).select()) },
  { table: "invitations", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("invitations").delete().eq("id", c.invitation).select()) },

  // ai_jobs: members may watch; only the server writes
  { table: "ai_jobs", op: "select", allowed: ["member", "owner"], attempt: async (c) => rows(await c.client.from("ai_jobs").select("id").eq("group_id", c.group)) },
  { table: "ai_jobs", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("ai_jobs").insert({ group_id: c.group, trigger_message_id: randomUUID() })).error },
  { table: "ai_jobs", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("ai_jobs").update({ status: "succeeded" }).eq("group_id", c.group).select()) },
  { table: "ai_jobs", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("ai_jobs").delete().eq("group_id", c.group).select()) },

  // group_removals: server only (who the owner removed, so old links cannot bring them back)
  { table: "group_removals", op: "select", allowed: [], attempt: async (c) => rows(await c.client.from("group_removals").select("user_id")) },
  { table: "group_removals", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("group_removals").insert({ group_id: c.group, user_id: c.uid ?? randomUUID() })).error },
  { table: "group_removals", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("group_removals").update({ removed_at: new Date().toISOString() }).eq("group_id", c.group).select()) },
  { table: "group_removals", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("group_removals").delete().eq("group_id", c.group).select()) },

  // rate_limits: server only
  { table: "rate_limits", op: "select", allowed: [], attempt: async (c) => rows(await c.client.from("rate_limits").select("user_id")) },
  { table: "rate_limits", op: "insert", allowed: [], attempt: async (c) => !(await c.client.from("rate_limits").insert({ user_id: c.uid ?? randomUUID(), bucket: "x", window_start: new Date().toISOString() })).error },
  { table: "rate_limits", op: "update", allowed: [], attempt: async (c) => rows(await c.client.from("rate_limits").update({ hits: 0 }).neq("bucket", "").select()) },
  { table: "rate_limits", op: "delete", allowed: [], attempt: async (c) => rows(await c.client.from("rate_limits").delete().neq("bucket", "").select()) },
];

let owner: TestUser;
let member: TestUser;
let outsider: TestUser;
let base: Omit<Ctx, "client" | "uid">;

beforeAll(async () => {
  owner = await createTestUser("sxo");
  member = await createTestUser("sxm");
  outsider = await createTestUser("sxx");
  const group = (await owner.client.rpc("create_group", { p_name: "Matrix" })).data as string;
  await admin.from("group_members").insert({ group_id: group, user_id: member.id, role: "member" });
  await outsider.client.rpc("create_group", { p_name: "Outsider's own group" });
  const { data: msg } = await admin
    .from("messages")
    .insert({ group_id: group, sender_id: owner.id, type: "user", content: "fixture" })
    .select("id")
    .single();
  const { data: inv } = await admin
    .from("invitations")
    .insert({ group_id: group, token_hash: generateInviteToken().hash, created_by: owner.id, expires_at: "2099-01-01T00:00:00Z" })
    .select("id")
    .single();
  await admin.from("group_removals").insert({ group_id: group, user_id: outsider.id });
  await admin.from("rate_limits").insert({ user_id: owner.id, bucket: "fixture", window_start: new Date().toISOString(), hits: 1 });
  base = { owner, member, outsider, group, message: msg!.id, invitation: inv!.id };
});

afterAll(async () => {
  await cleanupTestUsers();
});

function ctxFor(role: Role): Ctx {
  const who = { anon: null, outsider, member, owner }[role];
  return { ...base, client: who ? who.client : anonClient(), uid: who?.id ?? null };
}

describe("T5.4-1 authorization matrix", () => {
  for (const cell of cells) {
    describe(`${cell.table} ${cell.op}`, () => {
      for (const role of ROLES) {
        const expected = cell.allowed.includes(role);
        it(`${role} is ${expected ? "allowed" : "denied"}`, async () => {
          expect(await cell.attempt(ctxFor(role))).toBe(expected);
        });
      }
    });
  }

  it("covers every table in the public schema that the app uses", () => {
    const tables = new Set(cells.map((c) => c.table));
    expect([...tables].sort()).toEqual(["ai_jobs", "group_members", "group_removals", "groups", "invitations", "messages", "profiles", "rate_limits"]);
    for (const t of tables) expect(cells.filter((c) => c.table === t).map((c) => c.op).sort()).toEqual(["delete", "insert", "select", "update"]);
  });
});
