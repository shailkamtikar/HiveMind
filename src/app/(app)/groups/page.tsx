import Link from "next/link";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui/Card";
import { BlurText } from "@/components/fx/BlurText";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
import { CreateGroupForm } from "./CreateGroupForm";

export default async function GroupsPage() {
  await connection();
  const supabase = await createClient();
  // Row Level Security returns only the groups this user belongs to.
  const { data: groups, error } = await supabase
    .from("groups")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  return (
    <div className="flex flex-col gap-8">
      <section>
        <h1 className="font-display text-5xl leading-none">
          <BlurText text="Your conversations" />
        </h1>
        <Card className="mt-4">
          <CreateGroupForm />
        </Card>
      </section>

      <section aria-label="Conversations">
        {error ? (
          <p role="alert" className="text-sm text-danger">
            We couldn&apos;t load your conversations. Refresh to try again.
          </p>
        ) : groups.length === 0 ? (
          <Card className="text-center">
            <p className="font-display text-2xl">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted">Start a conversation above, then invite friends to join it.</p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {groups.map((g, i) => (
              <li key={g.id} className="rise" style={{ "--i": Math.min(i, 8) } as React.CSSProperties}>
                <SpotlightCard>
                  <Link href={`/groups/${g.id}`} className="group flex items-center justify-between px-4 py-4">
                    <span className="font-medium">{g.name}</span>
                    <span className="flex items-center gap-3 text-xs text-muted">
                      {new Date(g.created_at).toLocaleDateString("en", { dateStyle: "medium" })}
                      <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">→</span>
                    </span>
                  </Link>
                </SpotlightCard>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
