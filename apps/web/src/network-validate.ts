/**
 * Check-Model: static validation of a project's topology before/after solving —
 * disconnected nodes, hanging ends, zero-diameter pipes, missing source,
 * self-loops, no discharging sprinklers. Pure + unit-testable; surfaced as a
 * header badge + a banner on the Project tab so broken networks don't silently
 * produce wrong calcs.
 */
import type { ProjectModel } from "@rads/model";

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

  return issues;
}

export function issueCounts(issues: Issue[]): { errors: number; warnings: number } {
  return { errors: issues.filter((i) => i.severity === "error").length, warnings: issues.filter((i) => i.severity === "warning").length };
}
