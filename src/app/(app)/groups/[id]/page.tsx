import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/validation/group";
import { Avatar } from "@/components/ui/Avatar";
import { Card } from "@/components/ui/Card";

export default async function GroupPage({ params }: PageProps<"/groups/[id]">) {
  const { id } = await params;
  // Malformed ids and ids of groups you cannot see both end in the same 404.
  if (!isUuid(id)) notFound();
  await connection();

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/groups" className="text-sm text-muted hover:text-foreground">
          ← All conversations
        </Link>
        <h1 className="mt-2 font-display text-4xl">{group.name}</h1>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <Card className="flex min-h-64 items-center justify-center text-center">
          <p className="text-sm text-muted">Messages will appear here once chat is switched on.</p>
        </Card>
        <Card>
          <h2 className="text-sm font-medium">
            Members ({members?.length ?? 0}/{group.member_limit})
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {(members ?? []).map((m) => {
              const name = nameOf.get(m.user_id) || "Member";
              return (
                <li key={m.user_id} className="flex items-center gap-2 text-sm">
                  <Avatar name={name} />
                  <span className="truncate">{name}</span>
                  {m.role === "owner" && <span className="ml-auto text-xs text-muted">Owner</span>}
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
    </div>
  );
}
