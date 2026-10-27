/** Shown the instant "Your conversations" is opened, while the list loads. */
export default function LoadingConversations() {
  return (
    <div className="flex flex-col gap-8" role="status" aria-label="Loading your conversations">
      <section>
        <h1 className="font-display text-5xl leading-none">Your conversations</h1>
        <div className="mt-4 h-28 animate-pulse rounded-[var(--radius)] border border-border bg-surface-2" />
      </section>
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-14 animate-pulse rounded-[var(--radius)] border border-border bg-surface-2" />
        ))}
      </div>
    </div>
  );
}
