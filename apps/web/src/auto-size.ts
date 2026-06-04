/**
 * Greedy velocity auto-sizing: repeatedly upsize any pipe whose velocity exceeds
 * the limit by one nominal step, re-solving after each pass, until every pipe is
 * within the limit or can't grow further (or a safety cap). A pure transform —
 * returns a new (parsed) model plus how many pipes changed and how many remain
 * over the limit (because they're already at the largest size).
 */
import { parseProject, type ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { NOMINAL_SIZES } from "./network-edit";

export function autoSizeVelocity(model: ProjectModel, limitFps = 20): { model: ProjectModel; changed: number; remaining: number } {
  let m = model;
  const changedIds = new Set<string>();
  for (let pass = 0; pass < 40; pass++) {
    const velBy: Record<string, number> = {};
    try {
      const sol = solveProject(m);
      for (const p of m.network.pipes) velBy[p.id] = sol.results.pipes[p.id]?.velocityFps ?? 0;
    } catch {
      break; // unsolvable — nothing to size
    }
    if (!m.network.pipes.some((p) => velBy[p.id]! > limitFps)) break;
    let grew = false;
    const pipes = m.network.pipes.map((p) => {
      if (velBy[p.id]! <= limitFps) return p;
      const i = NOMINAL_SIZES.indexOf((p.nominalSize ?? "1") as (typeof NOMINAL_SIZES)[number]);
      if (i < 0 || i >= NOMINAL_SIZES.length - 1) return p; // already largest
      grew = true;
      changedIds.add(p.id);
      return { ...p, nominalSize: NOMINAL_SIZES[i + 1], idOverride: false, internalDiameterIn: undefined };
    });
    if (!grew) break; // everything over the limit is already maxed
    m = parseProject({ ...m, network: { ...m.network, pipes } });
  }
  let remaining = 0;
  try {
    const sol = solveProject(m);
    remaining = m.network.pipes.filter((p) => (sol.results.pipes[p.id]?.velocityFps ?? 0) > limitFps).length;
  } catch { /* leave remaining = 0 */ }
  return { model: m, changed: changedIds.size, remaining };
}
