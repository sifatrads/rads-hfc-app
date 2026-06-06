/**
 * Design-area proof: NFPA 13 requires the calc to demonstrate the MOST
 * hydraulically demanding remote area. The solver auto-picks the N most-remote
 * heads, but a designer should confirm no other area governs. This solves the
 * design at several candidate remote areas (the N heads clustered around each of
 * the farthest heads) and ranks them by required source pressure — the highest
 * is the governing area.
 */
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";

export interface AreaResult {
  label: string;
  anchor: string;
  heads: number;
  sourcePressurePsi: number;
  marginPsi: number;
  passes: boolean;
}

type Pipe = ProjectModel["network"]["pipes"][number];

/** Undirected graph distance (by pipe length, ft) from a start node, BFS-style. */
function distancesFrom(pipes: Pipe[], startId: string): Map<string, number> {
  const adj = new Map<string, [string, number][]>();
  const add = (a: string, b: string, w: number) => { (adj.get(a) ?? adj.set(a, []).get(a)!).push([b, w]); };
  for (const p of pipes) { const w = Math.max(0, (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0)); add(p.from, p.to, w); add(p.to, p.from, w); }
  const dist = new Map<string, number>([[startId, 0]]);
  // Dijkstra-lite (small networks): repeatedly relax the closest unsettled node.
  const settled = new Set<string>();
  while (settled.size < dist.size) {
    let cur: string | undefined; let best = Infinity;
    for (const [id, d] of dist) if (!settled.has(id) && d < best) { best = d; cur = id; }
    if (cur === undefined) break;
    settled.add(cur);
    for (const [nb, w] of adj.get(cur) ?? []) { const nd = best + w; if (nd < (dist.get(nb) ?? Infinity)) dist.set(nb, nd); }
  }
  return dist;
}

function findSource(model: ProjectModel): string | undefined {
  const incoming = new Set(model.network.pipes.map((p) => p.to));
  return (model.network.nodes.find((n) => !incoming.has(n.id)) ?? model.network.nodes[0])?.id;
}

/**
 * Solve up to `maxAreas` candidate remote areas + return them ranked by required
 * pressure (governing first). Returns [] when there's only one possible area.
 */
export function compareDesignAreas(model: ProjectModel, maxAreas = 5): AreaResult[] {
  let base;
  try { base = solveProject(model); } catch { return []; }
  const n = base.summary.operatingHeads;
  const heads = model.network.nodes.filter((nd) => nd.type === "sprinkler" && (nd.kFactor ?? 0) > 0);
  const src = findSource(model);
  if (!src || n <= 0 || heads.length <= n) return []; // only one area possible — nothing to compare

  const fromSource = distancesFrom(model.network.pipes, src);
  const anchors = [...heads].sort((a, b) => (fromSource.get(b.id) ?? 0) - (fromSource.get(a.id) ?? 0)).slice(0, maxAreas);

  const seen = new Set<string>();
  const results: AreaResult[] = [];
  for (const anchor of anchors) {
    const fromAnchor = distancesFrom(model.network.pipes, anchor.id);
    const group = [...heads].sort((a, b) => (fromAnchor.get(a.id) ?? Infinity) - (fromAnchor.get(b.id) ?? Infinity)).slice(0, n).map((h) => h.id);
    const key = [...group].sort().join(",");
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      const s = solveProject(model, { designArea: new Set(group) }).summary;
      results.push({ label: `Area @ ${anchor.id}`, anchor: anchor.id, heads: group.length, sourcePressurePsi: s.sourcePressurePsi, marginPsi: s.marginPsi, passes: s.passesSupply && s.meetsMinPressure });
    } catch { /* skip unsolvable candidate */ }
  }
  // Governing = highest required source pressure (worst case).
  return results.sort((a, b) => b.sourcePressurePsi - a.sourcePressurePsi);
}
