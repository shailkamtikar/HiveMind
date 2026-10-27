import type { NextRequest } from "next/server";
import { authorizeGroup, json } from "@/lib/api/group";
import { isUuid } from "@/lib/validation/group";

/**
 * Removes a member from the conversation. Owner only. The person loses access at once (the database no longer
 * counts them as a member) and cannot come back with any link created before they were removed.
 */
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/groups/[id]/members/[userId]">) {
  const { id, userId } = await ctx.params;
  const auth = await authorizeGroup(id);
  if ("error" in auth) return auth.error;
  if (auth.group.owner_id !== auth.user.id) return json({ error: "Only the owner can remove people" }, 403);
  if (!isUuid(userId)) return json({ error: "Member not found" }, 404);
  if (userId === auth.user.id) return json({ error: "The owner cannot be removed" }, 400);

  const { data, error } = await auth.supabase.rpc("remove_member", { p_group_id: id, p_user_id: userId });
  if (error) return json({ error: "Could not remove that member" }, 500);
  return data ? json({ removed: true }) : json({ error: "Member not found" }, 404);
}
