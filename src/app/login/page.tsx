import { Suspense } from "react";
import Link from "next/link";
import { safeNext } from "@/lib/auth/safeNext";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { BlurText } from "@/components/fx/BlurText";
import { LogoMark } from "@/components/fx/Logo";
import { SpotlightCard } from "@/components/fx/SpotlightCard";
import { LoginForm } from "./LoginForm";

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// searchParams is request-time data, so it is read inside a Suspense boundary.
async function LoginContent({ searchParams }: { searchParams: PageProps<"/login">["searchParams"] }) {
  const sp = await searchParams;
  const next = safeNext(first(sp.next));
  const notice =
    first(sp.error) === "link" ? "That link is invalid or has expired. Sign in below, or ask for a new password reset link." : undefined;
  return <LoginForm next={next} notice={notice} initialMode={first(sp.mode) === "signup" ? "signup" : "signin"} />;
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <>
      <AmbientBackground />
      <main className="mx-auto grid w-full max-w-5xl flex-1 items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.15fr_1fr]">
        <header>
          <Link href="/" prefetch={false} className="rise inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground" style={{ "--i": 0 } as React.CSSProperties}>
            <LogoMark /> HiveMind
          </Link>
          <h1 className="mt-5 font-display text-6xl leading-[0.95] sm:text-7xl">
            <BlurText text="One chat. Many minds. One AI." startMs={150} />
          </h1>
          <p className="rise mt-6 max-w-md text-lg text-muted" style={{ "--i": 4 } as React.CSSProperties}>
            Think out loud with your friends and an AI that follows the whole conversation.
          </p>
        </header>
        <SpotlightCard className="rise p-6 sm:p-7" style={{ "--i": 3 } as React.CSSProperties}>
          <Suspense fallback={<div className="h-72" aria-hidden />}>
            <LoginContent searchParams={searchParams} />
          </Suspense>
        </SpotlightCard>
      </main>
    </>
  );
}
