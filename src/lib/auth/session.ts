import type { SupabaseClient } from "@supabase/supabase-js";

export type SessionUser = { id: string; email: string | null };

/**
 * Who is signed in, checked without a network round trip.
 *
 * `getClaims()` verifies the access token's signature and expiry locally against the project's published signing
 * keys (fetched once and cached), so it costs nothing per request; `getUser()` asks the Auth server every time,
 * about 200 ms each. Trade-off: a session that was revoked on the server stays valid until its token expires
 * (about an hour). Data access already behaves that way, because the database accepts the same token, and
 * membership is always checked in the database itself, so nobody gains access to anything they could not already see.
 */
export async function currentUser(supabase: SupabaseClient): Promise<SessionUser | null> {
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
