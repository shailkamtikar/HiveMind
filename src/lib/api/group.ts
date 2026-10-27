import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/group";

export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const notFound = () => json({ error: "Conversation not found" }, 404);

/**
 * Signed in and a member of the group, or a ready-made error response.
 * RLS only returns groups the caller belongs to, so non-members and unknown ids look the same (404).
 */
export async function authorizeGroup(groupId: string) {
  const supabase = await createClient();
  const user = await currentUser(supabase);
  if (!user) return { error: json({ error: "Unauthorized" }, 401) } as const;
  if (!isUuid(groupId)) return { error: notFound() } as const;
  const { data: group } = await supabase
    .from("groups")
    .select("id, owner_id")
    .eq("id", groupId)
    .maybeSingle();
  if (!group) return { error: notFound() } as const;
  return { supabase, user, group } as const;
}
