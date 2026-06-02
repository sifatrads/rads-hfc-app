import { describe, it, expect } from "vitest";
import { placeLabels, anyOverlap, type LabelRequest, type Viewport } from "./place";

const vp: Viewport = { width: 1000, height: 1000, margin: 10 };

function grid(n: number, spacing: number, w = 44, h = 14): LabelRequest[] {
  const out: LabelRequest[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      out.push({ id: `${i}-${j}`, x: 30 + i * spacing, y: 30 + j * spacing, text: "X", category: "nodeNo", priority: (i + j) % 5, width: w, height: h });
  return out;
}

describe("placeLabels", () => {
  it("never overlaps placed boxes (the core guarantee), even when dense", () => {
    const reqs = grid(16, 50); // 256 anchors, 44×14 boxes on a 50px grid → congested
    const { placed, hidden } = placeLabels(reqs, vp);
    expect(anyOverlap(placed)).toBe(false);
    expect(placed.length + hidden.length).toBe(reqs.length);
    expect(placed.length).toBeGreaterThan(0);
  });

  it("keeps every placed box inside the viewport margins", () => {
    const { placed } = placeLabels(grid(10, 90), vp);
    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(vp.margin - 1e-6);
      expect(p.y).toBeGreaterThanOrEqual(vp.margin - 1e-6);
      expect(p.x + p.width).toBeLessThanOrEqual(vp.width - vp.margin + 1e-6);
      expect(p.y + p.height).toBeLessThanOrEqual(vp.height - vp.margin + 1e-6);
    }
  });

  it("places an isolated label adjacent with no leader", () => {
    const { placed } = placeLabels([{ id: "a", x: 500, y: 500, text: "N1", category: "nodeNo", priority: 1, width: 40, height: 14 }], vp);
    expect(placed).toHaveLength(1);
    expect(placed[0]!.leader).toBeUndefined();
  });

  it("draws leaders for congested labels pushed to outer rings", () => {
    const cluster: LabelRequest[] = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, x: 500, y: 500, text: `P-${i}`, category: "pipeNo", priority: 8 - i, width: 44, height: 14 }));
    const { placed } = placeLabels(cluster, vp);
    expect(anyOverlap(placed)).toBe(false);
    expect(placed.filter((p) => p.leader).length).toBeGreaterThan(0); // some displaced → leaders
    // leaders connect to the true anchor
    for (const p of placed) if (p.leader) expect([p.leader.x1, p.leader.y1]).toEqual([p.anchorX, p.anchorY]);
  });

  it("filters by enabled categories", () => {
    const reqs: LabelRequest[] = [
      { id: "a", x: 100, y: 100, text: "P", category: "pipeNo", priority: 1, width: 30, height: 12 },
      { id: "b", x: 200, y: 200, text: "E", category: "elevation", priority: 1, width: 30, height: 12 },
    ];
    const { placed } = placeLabels(reqs, vp, { enabledCategories: ["pipeNo"] });
    expect(placed.map((p) => p.id)).toEqual(["a"]);
  });

  it("thins dense same-cell labels by priority (LOD)", () => {
    const reqs: LabelRequest[] = Array.from({ length: 10 }, (_, i) => ({ id: `t${i}`, x: 105 + (i % 3), y: 105, text: "x", category: "pipeNo", priority: i, width: 20, height: 10 }));
    const full = placeLabels(reqs, vp).placed.length;
    const thinned = placeLabels(reqs, vp, { thinCellSize: 64, thinPerCell: 2 });
    expect(thinned.placed.length + thinned.hidden.length).toBeLessThanOrEqual(2);
    expect(thinned.placed.length).toBeLessThanOrEqual(full);
  });

  it("is deterministic", () => {
    const reqs = grid(12, 70);
    const a = placeLabels(reqs, vp);
    const b = placeLabels(reqs, vp);
    expect(a.placed.map((p) => `${p.id}:${p.x.toFixed(2)},${p.y.toFixed(2)}`)).toEqual(b.placed.map((p) => `${p.id}:${p.x.toFixed(2)},${p.y.toFixed(2)}`));
    expect(a.hidden).toEqual(b.hidden);
  });
});
