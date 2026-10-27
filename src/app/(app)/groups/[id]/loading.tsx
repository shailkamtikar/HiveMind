/** Shown the instant a conversation is opened, while its data loads: same shape as the real page, so nothing jumps. */
export default function LoadingConversation() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Opening the conversation">
      <div>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">← All conversations</span>
        <div className="mt-3 h-12 w-80 max-w-full animate-pulse rounded-lg bg-surface-2" />
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_16rem]">
        <div className="flex h-[min(70dvh,40rem)] min-h-[24rem] flex-col overflow-hidden rounded-[var(--radius)] border border-border bg-surface">
          <div className="flex flex-1 flex-col gap-5 p-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 border-l-2 border-transparent pl-3">
                <div className="size-8 shrink-0 animate-pulse rounded-full bg-surface-2" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 animate-pulse rounded bg-surface-2" />
                  <div className="h-4 animate-pulse rounded bg-surface-2" style={{ width: `${70 - i * 15}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-border p-3">
            <div className="h-11 animate-pulse rounded-[var(--radius)] border border-border bg-surface-2" />
          </div>
        </div>
        <div className="hidden h-fit rounded-[var(--radius)] border border-border bg-surface p-5 md:block">
          <div className="h-3 w-28 animate-pulse rounded bg-surface-2" />
          <div className="mt-4 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="size-8 animate-pulse rounded-full bg-surface-2" />
                <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
