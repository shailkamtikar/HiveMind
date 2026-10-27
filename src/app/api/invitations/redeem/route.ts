import type { NextRequest } from "next/server";
import { json } from "@/lib/api/group";
import { hashInviteToken, isPlausibleToken } from "@/lib/invites/token";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export type RedeemStatus = "joined" | "already_member" | "invalid" | "full";

/**
 * Redeems an invitation for the signed-in caller. POST only, so link previews and scanners that merely
 * GET the page cannot use up an invitation. Every non-working link answers the same `invalid`.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return json({ error: "Unauthorized" }, 401);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Request body must be valid JSON" }, 400);
  }
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== "string") return json({ error: "A token is required" }, 400);

  // A malformed token is just another dead link.
  if (!isPlausibleToken(token)) return json({ status: "invalid" satisfies RedeemStatus });

  const { data, error } = await supabase.rpc("redeem_invitation", { p_token_hash: hashInviteToken(token) });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return json({ error: "Could not process the invitation" }, 500);

  const status = row.status as RedeemStatus;
  return json(status === "joined" || status === "already_member" ? { status, groupId: row.group_id } : { status });
}
