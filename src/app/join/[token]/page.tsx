import { Suspense } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getUser } from "@/lib/auth/getUser";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { LogoMark } from "@/components/fx/Logo";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
import { JoinClient } from "./JoinClient";

// The token is a credential: keep it out of search results and previews.
export const metadata: Metadata = { title: "Join a conversation", robots: { index: false, follow: false } };

async function JoinContent({ params }: { params: PageProps<"/join/[token]">["params"] }) {
  const { token } = await params;
  const user = await getUser();

  if (!user) {
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <div className="flex flex-col gap-4" data-testid="join-signed-out">
        <h1 className="font-display text-4xl leading-none">You’re invited</h1>
        <p className="text-muted">
          Someone wants you in their HiveMind conversation. Sign in or create an account and you’ll be taken straight in.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/login?next=${next}`}
            className="btn-shine inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-accent px-4 text-sm font-medium text-accent-foreground"
          >
            Sign in to join
          </Link>
          <Link
            href={`/login?mode=signup&next=${next}`}
            className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-surface"
          >
            Create an account
          </Link>
        </div>
      </div>
    );
  }

  return <JoinClient token={token} />;
}

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <>
      <AmbientBackground />
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-6 px-4 py-16">
        <Link href="/" prefetch={false} className="rise inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground">
          <LogoMark /> HiveMind
        </Link>
        <SpotlightCard className="rise p-6 sm:p-7" style={{ "--i": 2 } as React.CSSProperties}>
          <Suspense fallback={<div className="h-32" aria-hidden />}>
            <JoinContent params={params} />
          </Suspense>
        </SpotlightCard>
      </main>
    </>
  );
}
