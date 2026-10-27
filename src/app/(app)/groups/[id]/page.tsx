import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { getConfig } from "@/lib/config";
import { fetchMessagesPage } from "@/lib/chat/queries";
import type { ClientJob } from "@/lib/chat/types";
import { isUuid } from "@/lib/validation/group";
import { Chat } from "@/components/chat/Chat";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";
import { BlurText } from "@/components/fx/BlurText";
import { ShareDialog } from "@/components/share/ShareDialog";
import { RemoveMemberButton } from "@/components/share/RemoveMemberButton";

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  // Malformed ids and ids of groups you cannot see both end in the same 404.
  if (!isUuid(id)) notFound();
  await connection();

  const user = await getUser();
  if (!user) notFound();

  // Everything the page needs is requested at the same time (each request is a round trip to the database, so
  // asking one after another is what made opening a conversation slow). Row Level Security filters all of it:
  // for someone who is not a member every answer is empty and the page is a 404.
  const supabase = await createClient();
  const [groupResult, membersAndNames, history, jobsResult] = await Promise.all([
    supabase.from("groups").select("id, name, member_limit, owner_id").eq("id", id).maybeSingle(),
    (async () => {
      const { data: members } = await supabase
        .from("group_members")
        .select("user_id, role")
        .eq("group_id", id)
        .order("joined_at", { ascending: true });
      const ids = (members ?? []).map((m) => m.user_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ids)
        : { data: [] };
      return { members, profiles };
    })(),
    fetchMessagesPage(supabase, id, { limit: 30 }),
    // AI work that is waiting, running or failed, so the chat can show "thinking" and failure notices from the start.
    supabase
      .from("ai_jobs")
      .select("id, trigger_message_id, status, error_category, attempts, updated_at")
      .eq("group_id", id)
      .in("status", ["queued", "processing", "failed"])
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const group = groupResult.data;
  if (!group) notFound();
  const { members, profiles } = membersAndNames;
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const jobs = jobsResult.data;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/groups" className="font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground">
          ← All conversations
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-5xl leading-none">
            <BlurText text={group.name} />
          </h1>
          {group.owner_id === user.id && (
            <ShareDialog
              groupId={group.id}
              groupName={group.name}
              memberCount={members?.length ?? 0}
              memberLimit={group.member_limit}
            />
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Chat
          groupId={group.id}
          currentUserId={user.id}
          currentUserName={nameOf.get(user.id) || "You"}
          initialMessages={history.messages}
          initialHasMore={history.hasMore}
          initialJobs={(jobs ?? []) as ClientJob[]}
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
                  {m.role !== "owner" && group.owner_id === user.id && (
                    <RemoveMemberButton groupId={group.id} userId={m.user_id} name={name} />
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
