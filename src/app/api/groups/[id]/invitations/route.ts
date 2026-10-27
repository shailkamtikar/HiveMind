import type { NextRequest } from "next/server";
import { authorizeGroup, json } from "@/lib/api/group";
import { getConfig } from "@/lib/config";
import { generateInviteToken } from "@/lib/invites/token";
import { siteUrl } from "@/lib/siteUrl";

const baseUrl = (request: NextRequest) => siteUrl(request.nextUrl.origin);

/** Active (not revoked, not expired) invitations. Only the owner may see them; the token itself is never retrievable. */
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/groups/[id]/invitations">) {
  const { id } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;
  if (auth.group.owner_id !== auth.user.id) return json({ error: "Only the owner can manage invitations" }, 403);

  const { data, error } = await auth.supabase
    .from("invitations")
    .select("id, created_at, expires_at")
    .eq("group_id", id)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return json({ error: "Could not load invitations" }, 500);
  return json({ invitations: data });
}

/** Creates an invitation. The link is returned once, here, and cannot be shown again. */
export async function POST(request: NextRequest, ctx: RouteContext<"/api/groups/[id]/invitations">) {
  const { id } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;
  if (auth.group.owner_id !== auth.user.id) return json({ error: "Only the owner can invite people" }, 403);

  const { token, hash } = generateInviteToken();
  const { data, error } = await auth.supabase.rpc("create_invitation", {
    p_group_id: id,
    p_token_hash: hash,
    p_expiry_days: getConfig().inviteExpiryDays,
  });
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) {
    return json({ error: error?.code === "42501" ? "Only the owner can invite people" : "Could not create the invitation" }, error?.code === "42501" ? 403 : 500);
  }

  const response = json(
    { invitation: { id: row.id, expires_at: row.expires_at, url: `${baseUrl(request)}/join/${token}` } },
    201,
  );
  // A link is a credential: never let a browser or proxy keep a copy.
  response.headers.set("Cache-Control", "no-store");
  return response;
}
