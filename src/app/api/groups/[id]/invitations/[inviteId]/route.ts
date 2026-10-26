import type { NextRequest } from "next/server";
import { authorizeGroup, json } from "@/lib/api/group";
import { isUuid } from "@/lib/validation/group";

/** Revokes an invitation. Existing members stay; the link just stops working. */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/groups/[id]/invitations/[inviteId]">) {
  const { id, inviteId } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;
  if (auth.group.owner_id !== auth.user.id) return json({ error: "Only the owner can manage invitations" }, 403);
  if (!isUuid(inviteId)) return json({ error: "Invitation not found" }, 404);

  const { data, error } = await auth.supabase.rpc("revoke_invitation", { p_group_id: id, p_invitation_id: inviteId });
  if (error) return json({ error: "Could not revoke the invitation" }, 500);
  // Unknown id, another group's invitation, and an already revoked one all answer the same.
  return data ? json({ revoked: true }) : json({ error: "Invitation not found" }, 404);
}
