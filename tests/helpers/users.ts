import { randomBytes } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadTestEnv, requireEnv } from "./env";

loadTestEnv();

const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

/** Service-role client. Test setup only; bypasses RLS. */
export const admin: SupabaseClient = createClient(url, serviceKey, clientOptions);

/** Client with no session (the "anon" role). */
export function anonClient(): SupabaseClient {
  return createClient(url, anonKey, clientOptions);
}

export type TestUser = { id: string; email: string; client: SupabaseClient };

const created: string[] = [];

export async function createTestUser(label = "user"): Promise<TestUser> {
  const email = `hm-test-${label}-${randomBytes(4).toString("hex")}@example.com`;
  const password = randomBytes(18).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
  created.push(data.user.id);

  const client = createClient(url, anonKey, clientOptions);
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn failed: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** Deletes every user created by createTestUser (cascades to profiles, groups, memberships). */
export async function cleanupTestUsers() {
  while (created.length) {
    const id = created.pop()!;
    await admin.auth.admin.deleteUser(id);
  }
}
