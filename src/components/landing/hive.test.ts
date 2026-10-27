import { describe, expect, it } from "vitest";
import { buildCells, pathToCentre, toPlane, wobble } from "./hive";

describe("hive layout", () => {
  const cells = buildCells();
  it("is a 19-cell honeycomb with one AI cell in the middle and four members", () => {
    expect(cells).toHaveLength(19);
    expect(cells.filter((c) => c.kind === "ai")).toEqual([expect.objectContaining({ q: 0, r: 0 })]);
    expect(cells.filter((c) => c.kind === "member")).toHaveLength(4);
    expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(19);
  });
  it("places neighbouring cells the same distance apart", () => {
    const a = toPlane(0, 0, 1);
    for (const [q, r] of [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]] as const) {
      const p = toPlane(q, r, 1);
      expect(Math.hypot(p.x - a.x, p.z - a.z)).toBeCloseTo(Math.sqrt(3), 6);
    }
  });
  it("walks from any cell to the centre one neighbour at a time", () => {
    for (const c of cells) {
      const path = pathToCentre(c.q, c.r);
      expect(path[0]).toEqual({ q: c.q, r: c.r });
      expect(path.at(-1)).toEqual({ q: 0, r: 0 });
      for (let i = 1; i < path.length; i++) {
        const dq = path[i].q - path[i - 1].q;
        const dr = path[i].r - path[i - 1].r;
        expect(Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr))).toBe(1);
      }
    }
  });
  it("gives repeatable heights between 0 and 1", () => {
    expect(wobble(1, 2)).toBe(wobble(1, 2));
    for (const c of cells) expect(wobble(c.q, c.r)).toBeGreaterThanOrEqual(0);
  });
});
