import type { ReactNode } from "react";
import Link from "next/link";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { LogoMark } from "@/components/fx/Logo";
import { SpotlightCard } from "@/components/fx/SpotlightCard";

/** The frame around the small account pages (forgot password, reset password): brand link home, one card. */
export function AuthShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <>
      <AmbientBackground />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-4 py-16">
        <header>
          <Link href="/" prefetch={false} className="inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground">
            <LogoMark /> HiveMind
          </Link>
          <h1 className="mt-5 font-display text-5xl leading-[0.98]">{title}</h1>
          <p className="mt-3 text-muted">{intro}</p>
        </header>
        <SpotlightCard className="p-6">{children}</SpotlightCard>
      </main>
    </>
  );
}
