import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

// The signed-in area is per-user and gated by proxy.ts, so it is allowed to block on the server.
export const instant = false;

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name = profile?.display_name || user.email || "Member";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/groups" className="font-display text-2xl leading-none">
            HiveMind
          </Link>
          <div className="flex items-center gap-3">
            <Avatar name={name} />
            <span className="hidden text-sm text-muted sm:inline">{name}</span>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="ghost">
                Sign out
              </Button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6">{children}</div>
    </div>
  );
}
