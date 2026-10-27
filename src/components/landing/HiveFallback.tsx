import { buildCells, toPlane } from "./hive";

/** The honeycomb as a flat drawing: shown before the 3D scene loads, and kept when WebGL or motion is unavailable. */
export function HiveFallback() {
  const size = 34;
  const cells = buildCells();
  const hex = (cx: number, cy: number, r: number) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      return `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  return (
    <svg viewBox="-190 -160 380 300" className="size-full" role="img" aria-label="Honeycomb of four friends and one AI">
      <g>
        {cells.map((c) => {
          const { x, z } = toPlane(c.q, c.r, size);
          const fill = c.kind === "ai" ? "var(--foreground)" : c.kind === "member" ? "var(--accent)" : "var(--surface)";
          return <polygon key={`${c.q},${c.r}`} points={hex(x, z - 10, size * 0.93)} fill={fill} stroke="var(--foreground)" strokeOpacity={0.35} strokeWidth={1} />;
        })}
      </g>
    </svg>
  );
}
