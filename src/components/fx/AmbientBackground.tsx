/** Soft drifting glow and a faint dot grid behind the page. Pure CSS, decorative, hidden from assistive tech. */
export function AmbientBackground() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="ambient-blob ambient-blob-a" />
      <div className="ambient-blob ambient-blob-b" />
    </div>
  );
}
