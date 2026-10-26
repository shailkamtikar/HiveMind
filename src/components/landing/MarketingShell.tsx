import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { AmbientBackground } from "@/components/fx/AmbientBackground";
import { LogoMark } from "@/components/fx/Logo";
import { getUser } from "@/lib/auth/getUser";
import { LandingMotion } from "./LandingMotion";

const ctaClass =
  "btn-shine inline-flex h-10 items-center justify-center rounded-[var(--radius)] bg-accent px-4 text-sm font-medium text-accent-foreground";

async function HeaderAction() {
  const user = await getUser();
  return user ? (
    <Link href="/groups" className={ctaClass}>
      Your conversations
    </Link>
  ) : (
    <Link href="/login" className={ctaClass}>
      Sign in
    </Link>
  );
}

/** Header, footer and motion for the public pages (`/` and `/privacy`). */
export function MarketingShell({ children }: { children: ReactNode }) {
  return (
    <>
      <AmbientBackground />
      <noscript>
        <style>{"[data-reveal]{opacity:1!important;transform:none!important}"}</style>
      </noscript>
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6">
        <Link href="/" className="flex items-center gap-2 font-display text-2xl leading-none">
          <LogoMark />
          HiveMind
        </Link>
        <nav aria-label="Main" className="flex items-center gap-4">
          <Link href="/privacy" className="font-mono text-[11px] uppercase tracking-wide text-muted hover:text-foreground">
            Privacy
          </Link>
          <Suspense fallback={<span className="inline-block h-10 w-24" aria-hidden />}>
            <HeaderAction />
          </Suspense>
        </nav>
      </header>
      {children}
      <footer className="mx-auto mt-24 w-full max-w-6xl border-t border-border px-4 py-8 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-wide text-muted">
          <span>HiveMind · a shared AI chat for friends</span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy and data
          </Link>
        </div>
      </footer>
      <LandingMotion />
    </>
  );
}
