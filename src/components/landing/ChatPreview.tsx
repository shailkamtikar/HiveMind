/** A picture of the real chat, drawn with the same classes. It is static: nothing here talks to the server. */
const MESSAGES = [
  { who: "Maya", own: true, text: "Where should we go for Dan's birthday? Somewhere with a view." },
  { who: "Dan", own: false, text: "Not another rooftop. Last year was loud." },
  { who: "HiveMind", ai: true, text: "Maya wants a view and Dan wants quiet. A lakeside café with an evening booking fits both. Want three options near you?" },
];

export function ChatPreview() {
  return (
    <figure className="rounded-[var(--radius)] border border-border bg-surface shadow-[0_24px_60px_-30px_rgb(0_0_0/0.35)]" aria-label="Example of a HiveMind conversation">
      <figcaption className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="font-display text-xl">Birthday plans</span>
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">3 members</span>
      </figcaption>
      <ul className="flex flex-col gap-4 p-4">
        {MESSAGES.map((m) => (
          <li
            key={m.text}
            data-preview-msg
            className={`flex gap-3 border-l-2 pl-3 ${m.ai ? "border-foreground" : m.own ? "border-accent" : "border-transparent"}`}
          >
            {m.ai ? (
              <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground font-display text-lg leading-none text-background">
                H
              </span>
            ) : (
              <span aria-hidden="true" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-medium">
                {m.who[0]}
              </span>
            )}
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-wide text-muted">
                <span className="text-foreground">{m.who}</span>
              </p>
              <p className="mt-1 text-[15px] leading-relaxed">{m.text}</p>
            </div>
          </li>
        ))}
      </ul>
    </figure>
  );
}
