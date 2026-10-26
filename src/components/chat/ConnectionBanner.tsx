export type ConnectionState = "connecting" | "connected" | "reconnecting" | "offline";

export function ConnectionBanner({ state }: { state: ConnectionState }) {
  if (state === "connected") return null;
  const text =
    state === "offline"
      ? "You're offline. Messages can't be sent until you're back online."
      : state === "reconnecting"
        ? "Reconnecting… new messages may be delayed."
        : "Connecting…";
  return (
    <div
      role="status"
      data-testid="connection-banner"
      data-state={state}
      className="border-b border-border bg-surface-2 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted"
    >
      {text}
    </div>
  );
}
