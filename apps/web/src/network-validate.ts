/**
 * Check-Model: static validation of a project's topology before/after solving —
 * disconnected nodes, hanging ends, zero-diameter pipes, missing source,
 * self-loops, no discharging sprinklers. Pure + unit-testable; surfaced as a
 * header badge + a banner on the Project tab so broken networks don't silently
 * produce wrong calcs.
 */
import type { ProjectModel } from "@rads/model";
import { sprinklerBySin } from "@rads/standards-engine";

export type IssueSeverity = "error" | "warning";
export interface Issue {
  severity: IssueSeverity;
  message: string;
}

export function checkModel(model: ProjectModel): Issue[] {
  const issues: Issue[] = [];
  const nodes = model.network.nodes;
  const pipes = model.network.pipes;
  const ids = new Set(nodes.map((n) => n.id));

  if (nodes.length === 0) { issues.push({ severity: "warning", message: "Empty project — no nodes yet." }); return issues; }

  // duplicate node ids
  const seen = new Set<string>();
  for (const n of nodes) {
    if (seen.has(n.id)) issues.push({ severity: "error", message: `Duplicate node id "${n.id}".` });
    seen.add(n.id);
  }

  // pipe integrity
  for (const p of pipes) {
    if (!ids.has(p.from)) issues.push({ severity: "error", message: `Pipe ${p.id} starts at unknown node "${p.from}" (hanging end).` });
    if (!ids.has(p.to)) issues.push({ severity: "error", message: `Pipe ${p.id} ends at unknown node "${p.to}" (hanging end).` });
    if (p.from === p.to) issues.push({ severity: "error", message: `Pipe ${p.id} connects a node to itself.` });
    const id = p.internalDiameterIn;
    if (!p.nominalSize && (id == null || id <= 0)) issues.push({ severity: "error", message: `Pipe ${p.id} has no size / zero diameter.` });
    if ((p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0) < 0) issues.push({ severity: "warning", message: `Pipe ${p.id} has a negative total length.` });
  }

  // connectivity
  const touched = new Set<string>();
  for (const p of pipes) { touched.add(p.from); touched.add(p.to); }
  if (nodes.length > 1) for (const n of nodes) if (!touched.has(n.id)) issues.push({ severity: "warning", message: `Node ${n.id} is not connected to any pipe.` });

  // source (node with no incoming pipe)
  const incoming = new Set(pipes.map((p) => p.to));
  const roots = nodes.filter((n) => !incoming.has(n.id));
  if (roots.length === 0) issues.push({ severity: "error", message: "No source node — every node has an incoming pipe (fully cyclic)." });
  else if (roots.length > 1 && pipes.length > 0) issues.push({ severity: "warning", message: `${roots.length} source nodes (no incoming pipe) — expected one supply source.` });

  // unreachable nodes from the source(s)
  if (pipes.length > 0 && roots.length > 0) {
    const byFrom = new Map<string, string[]>();
    for (const p of pipes) (byFrom.get(p.from) ?? byFrom.set(p.from, []).get(p.from)!).push(p.to);
    const reach = new Set<string>(roots.map((r) => r.id));
    const queue = [...reach];
    while (queue.length) for (const to of byFrom.get(queue.shift()!) ?? []) if (!reach.has(to)) { reach.add(to); queue.push(to); }
    const unreached = nodes.filter((n) => !reach.has(n.id) && touched.has(n.id)).length;
    if (unreached > 0) issues.push({ severity: "warning", message: `${unreached} node(s) can't be reached from the source.` });
  }

  // discharging sprinklers
  const spk = nodes.filter((n) => n.type === "sprinkler" && (n.kFactor ?? 0) > 0);
  if (spk.length === 0) issues.push({ severity: "warning", message: "No sprinklers with a K-factor — nothing will discharge." });

  // catalog cross-checks for heads assigned a SIN (opt-in: heads without a sin
  // are skipped, so legacy/manual designs produce no new noise). All warnings —
  // catalog data is AUDIT-flagged and manual K overrides are legitimate.
  for (const n of spk) {
    if (!n.sin) continue;
    const p = sprinklerBySin(n.sin);
    if (!p) { issues.push({ severity: "warning", message: `Node ${n.id}: SIN "${n.sin}" not in the sprinkler catalog (custom/unverified head).` }); continue; }
    const k = n.kFactor!;
    if (Math.abs(k - p.kImperial) / p.kImperial > 0.05) // ±5% per UL listing tolerance
      issues.push({ severity: "warning", message: `Node ${n.id}: K=${k} differs from catalog K=${p.kImperial} for ${n.sin} (>5%). Re-sync or override intentionally.` });
    if (n.sprinkler && n.sprinkler !== p.orientation)
      issues.push({ severity: "warning", message: `Node ${n.id}: orientation "${n.sprinkler}" doesn't match ${n.sin} (${p.orientation}).` });
    if (typeof n.tempRatingF === "number" && !p.tempRatingsF.includes(n.tempRatingF))
      issues.push({ severity: "warning", message: `Node ${n.id}: temp ${n.tempRatingF}°F not a listed rating for ${n.sin} (${p.tempRatingsF.join("/")}).` });
  }

  return issues;
}

export function issueCounts(issues: Issue[]): { errors: number; warnings: number } {
  return { errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length };
}
