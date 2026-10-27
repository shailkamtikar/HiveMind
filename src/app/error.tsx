"use client";

import Link from "next/link";

/** Last-resort error page: friendly, no stack trace, and a way forward. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center gap-4 px-4 py-24 sm:px-6" role="alert">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Something went wrong</p>
      <h1 className="font-display text-5xl leading-tight">That didn&apos;t work.</h1>
      <p className="text-muted">An unexpected error stopped this page. Your messages are safe. Try again, or head back to your conversations.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-10 items-center rounded-[var(--radius)] bg-accent px-4 text-sm font-medium text-accent-foreground"
        >
          Try again
        </button>
        <Link href="/groups" className="inline-flex h-10 items-center rounded-[var(--radius)] border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-surface">
          Your conversations
        </Link>
      </div>
    </main>
  );
}
