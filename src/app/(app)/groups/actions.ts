"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getConfig } from "@/lib/config";
import { createGroupSchema } from "@/lib/validation/group";

export type CreateGroupState = { error?: string };

export async function createGroup(_prev: CreateGroupState, formData: FormData): Promise<CreateGroupState> {
  const parsed = createGroupSchema.safeParse({ name: String(formData.get("name") ?? "") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid name." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase.rpc("create_group", {
    p_name: parsed.data.name,
    p_member_limit: getConfig().maxGroupMembers,
  });
  if (error || typeof data !== "string") {
    return { error: "We couldn't create the conversation. Please try again." };
  }

  redirect(`/groups/${data}`);
}
