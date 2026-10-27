/** Shared description of the hero figure: a small honeycomb of 19 cells. Used by the 3D scene and the static fallback. */

export type CellKind = "empty" | "member" | "ai";
export type Cell = { q: number; r: number; kind: CellKind; name?: string; line?: string };

const MEMBERS: Record<string, { name: string; line: string }> = {
  "1,-1": { name: "Maya", line: "Where should we go for Dan's birthday? Somewhere with a view." },
  "-2,1": { name: "Dan", line: "Not another rooftop. Last year was loud." },
  "0,2": { name: "Priya", line: "I can book anything near the lake on Saturday." },
  "2,-1": { name: "Leo", line: "Can the AI check which places take groups of five?" },
};

export const HIVE_RADIUS = 2;

export function buildCells(): Cell[] {
  const cells: Cell[] = [];
  for (let q = -HIVE_RADIUS; q <= HIVE_RADIUS; q++) {
    for (let r = Math.max(-HIVE_RADIUS, -q - HIVE_RADIUS); r <= Math.min(HIVE_RADIUS, -q + HIVE_RADIUS); r++) {
      const m = MEMBERS[`${q},${r}`];
      if (q === 0 && r === 0) cells.push({ q, r, kind: "ai", name: "HiveMind", line: "Answers each message in turn, with the whole thread in view." });
      else if (m) cells.push({ q, r, kind: "member", ...m });
      else cells.push({ q, r, kind: "empty", name: "Open seat", line: "A conversation holds up to five people." });
    }
  }
  return cells;
}

/** Axial to flat coordinates for pointy-top hexagons of the given circumradius. */
export function toPlane(q: number, r: number, size: number) {
  return { x: Math.sqrt(3) * size * (q + r / 2), z: 1.5 * size * r };
}

/** Cells from `from` to the centre, one step at a time (cube-coordinate line). */
export function pathToCentre(q: number, r: number): { q: number; r: number }[] {
  const n = Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
  const out: { q: number; r: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = n === 0 ? 0 : i / n;
    // linear interpolation in cube space, then round to the nearest cell
    let x = q * (1 - t);
    let z = r * (1 - t);
    let y = -x - z;
    let rx = Math.round(x);
    let ry = Math.round(y);
    let rz = Math.round(z);
    const dx = Math.abs(rx - x);
    const dy = Math.abs(ry - y);
    const dz = Math.abs(rz - z);
    if (dx > dy && dx > dz) rx = -ry - rz;
    else if (dy > dz) ry = -rx - rz;
    else rz = -rx - ry;
    x = rx;
    y = ry;
    z = rz;
    out.push({ q: x === 0 ? 0 : x, r: z === 0 ? 0 : z });
  }
  return out;
}

/** Stable pseudo-random height variation so the empty cells look like a real comb, not a flat grid. */
export function wobble(q: number, r: number) {
  const s = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
