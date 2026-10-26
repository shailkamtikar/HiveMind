import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUser } from "@/lib/auth/getUser";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { LogoMark } from "@/components/fx/Logo";

const Logo = () => (
  <Link href="/groups" className="flex items-center gap-2 font-display text-2xl leading-none">
    <LogoMark />
    HiveMind
  </Link>
);

// Request-time reads (cookies, session) live inside Suspense boundaries so the shell can render instantly.
async function HeaderUser() {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle();
  const name = profile?.display_name || user.email || "Member";
  return (
    <div className="flex items-center gap-3">
      <Avatar name={name} />
      <span className="hidden text-sm text-muted sm:inline">{name}</span>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="ghost">
          Sign out
        </Button>
      </form>
    </div>
  );
}

// Defence in depth: proxy.ts already redirects signed-out visitors; this stops page content rendering without a user.
async function AuthGate({ children }: { children: ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-screen flex-col">
      <AmbientBackground />
      <header className="sticky top-0 z-20 border-b border-border bg-background/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4 py-3 sm:px-6">
          <Logo />
          <Suspense fallback={<div className="h-8" aria-hidden />}>
            <HeaderUser />
          </Suspense>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-8 sm:px-6">
        <Suspense fallback={<div className="h-32" aria-hidden />}>
          <AuthGate>{children}</AuthGate>
        </Suspense>
      </div>
    </div>
  );
}
