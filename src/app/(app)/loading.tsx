/** Shown while a signed-in page loads: the shape of the page, not a spinner. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-6" role="status" aria-label="Loading">
      <div className="h-12 w-72 max-w-full animate-pulse rounded-lg bg-surface-2" />
      <div className="h-40 animate-pulse rounded-[var(--radius)] border border-border bg-surface" />
      <div className="h-14 animate-pulse rounded-[var(--radius)] border border-border bg-surface" />
    </div>
  );
}
