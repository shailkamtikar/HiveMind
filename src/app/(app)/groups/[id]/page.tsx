import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { getConfig } from "@/lib/config";
import { fetchMessagesPage } from "@/lib/chat/queries";
import { isUuid } from "@/lib/validation/group";
import { Chat } from "@/components/chat/Chat";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  // Malformed ids and ids of groups you cannot see both end in the same 404.
  if (!isUuid(id)) notFound();
  await connection();

  const user = await getUser();
  if (!user) notFound();

  const supabase = await createClient();
  const { data: group } = await supabase
    .from("groups")
    .select("id, name, member_limit")
    .eq("id", id)
    .maybeSingle();
  if (!group) notFound();

  const { data: members } = await supabase
    .from("group_members")
    .select("user_id, role")
    .eq("group_id", group.id)
    .order("joined_at", { ascending: true });
  const ids = (members ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const history = await fetchMessagesPage(supabase, group.id, { limit: 30 });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/groups" className="font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground">
          ← All conversations
        </Link>
        <h1 className="mt-2 font-display text-4xl">{group.name}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Chat
          groupId={group.id}
          currentUserId={user.id}
          currentUserName={nameOf.get(user.id) || "You"}
          initialMessages={history.messages}
          initialHasMore={history.hasMore}
          maxLength={getConfig().maxMessageLength}
          memberNames={Object.fromEntries(nameOf)}
        />
        <Card className="h-fit">
          <h2 className="font-mono text-[11px] uppercase tracking-wide text-muted">
            Members ({members?.length ?? 0}/{group.member_limit})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {(members ?? []).map((m) => {
              const name = nameOf.get(m.user_id) || "Member";
              return (
                <li key={m.user_id} className="flex items-center gap-2 text-sm">
                  <Avatar name={name} />
                  <span className="truncate">{name}</span>
                  {m.role === "owner" && (
                    <span className="ml-auto font-mono text-[11px] uppercase tracking-wide text-muted">Owner</span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
