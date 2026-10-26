/** Words of a freshly arrived reply fade in as if being written. Text content stays identical. */
export function WordReveal({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  let word = 0;
  return (
    <>
      {parts.map((part, i) =>
        /^\s+$/.test(part) || part === "" ? (
          part
        ) : (
          <span key={i} className="word-in" style={{ animationDelay: `${Math.min(word++ * 28, 1400)}ms` }}>
            {part}
          </span>
        ),
      )}
    </>
  );
}
