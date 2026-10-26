export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <span role="status" aria-label={label} className="inline-block">
      <span className="block size-4 animate-spin rounded-full border-2 border-border border-t-accent" />
    </span>
  );
}
