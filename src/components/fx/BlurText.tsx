
/** Headline whose words resolve from blur one after another. CSS-only; plain text for assistive tech. */
export function BlurText({
  text,
  className,
  stepMs = 70,
  startMs = 0,
}: {
  text: string;
  className?: string;
  stepMs?: number;
  startMs?: number;
}) {
  const words = text.split(" ");
  return (
    <span className={className} aria-label={text}>
      {words.map((w, i) => (
        <span key={i} aria-hidden="true">
          <span className="blur-word" style={{ animationDelay: `${startMs + i * stepMs}ms` }}>
            {w}
          </span>
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
