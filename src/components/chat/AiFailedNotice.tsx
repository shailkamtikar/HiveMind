/** Shown under a member's message when HiveMind could not answer it. Rendered from job state, so it can never be mistaken for an AI answer. */
export function AiFailedNotice({ category }: { category: string | null }) {
  const text =
    category === "quota"
      ? "HiveMind is temporarily unavailable. Please try again in a little while."
      : "HiveMind couldn't respond to this message.";
  return (
    <li className="py-1 pl-14" data-testid="ai-failed" data-category={category ?? "unknown"}>
      <p className="inline-flex items-center gap-2 rounded-md border border-border bg-surface-2 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wide text-muted">
        <span aria-hidden="true" className="size-1.5 rounded-full bg-danger" />
        {text}
      </p>
    </li>
  );
}
