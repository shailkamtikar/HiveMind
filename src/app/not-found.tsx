import Link from "next/link";
import { AmbientBackground } from "@/components/fx/AmbientBackground";

export default function NotFound() {
  return (
    <>
      <AmbientBackground />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-24 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Error 404</p>
        <h1 className="font-display text-5xl leading-tight">This page isn&apos;t here.</h1>
        <p className="text-muted">The link may be mistyped, or the conversation may not exist or may not be yours to see.</p>
        <div>
          <Link href="/" className="inline-flex h-10 items-center rounded-[var(--radius)] border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-surface">
            Back to the start
          </Link>
        </div>
      </main>
    </>
  );
}
