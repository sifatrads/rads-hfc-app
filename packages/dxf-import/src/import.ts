/**
 * Build a ProjectModel network from a parsed DXF + an ImportMapping. Pipe
 * centerlines become pipes with TRUE 3D geometry (so node.geometry is exact and
 * auto-layout is bypassed); sizes/ids/coverage are read from the nearest text;
 * circles become sprinkler heads. Lengths/elevations are converted to feet for
 * the calc engine.
 */
import { parseProject, type ProjectModel } from "@rads/model";
import { SCH40_ID_IN } from "@rads/standards-engine";
import type { DxfDoc, DxfEntity, DxfPoint } from "./parse";
import type { ImportMapping } from "./mapping";
import { UNIT_TO_FT } from "./mapping";

export interface ImportStats {
  nodes: number;
  pipes: number;
  heads: number;
  pipesWithMatchedSize: number;
  nodesWithMatchedId: number;
}

export interface ImportResult {
  model: ProjectModel;
  warnings: string[];
  stats: ImportStats;
}

const MM_TO_NOMINAL: [number, string][] = [
  [15, "1/2"], [20, "3/4"], [25, "1"], [32, "1-1/4"], [40, "1-1/2"], [50, "2"], [65, "2-1/2"],
  [80, "3"], [90, "3-1/2"], [100, "4"], [125, "5"], [150, "6"], [200, "8"], [250, "10"], [300, "12"], [350, "14"], [400, "16"],
];
function mmToNominal(mm: number): string {
  let best = MM_TO_NOMINAL[0]!;
  for (const cand of MM_TO_NOMINAL) if (Math.abs(cand[0] - mm) < Math.abs(best[0] - mm)) best = cand;
  return best[1];
}

const dist3 = (a: DxfPoint, b: DxfPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function directionOf(a: DxfPoint, b: DxfPoint): "N" | "S" | "E" | "W" | "U" | "D" {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
  if (az >= ax && az >= ay) return dz >= 0 ? "U" : "D";
  if (ax >= ay) return dx >= 0 ? "E" : "W";
  return dy >= 0 ? "N" : "S";
}

/** Parse a size/coverage text token to a number (mm / m²). */
function numToken(s: string): number | undefined {
  const m = /-?\.?\d+\.?\d*/.exec(s.replace(/,/g, ""));
  return m ? Number(m[0]) : undefined;
}

export function importNetwork(doc: DxfDoc, mapping: ImportMapping): ImportResult {
  const scale = UNIT_TO_FT[mapping.sourceUnit];
  const role = (e: DxfEntity) => mapping.layerRoles[e.layer] ?? "ignore";
  const warnings: string[] = [];

  // collect entities by role
  const pipeEnts = doc.entities.filter((e) => role(e) === "pipes" && (e.type === "LINE" || e.type === "LWPOLYLINE" || e.type === "POLYLINE"));
  const headEnts = doc.entities.filter((e) => role(e) === "heads" && e.vertices.length >= 1);
  const sizeTexts = doc.entities.filter((e) => role(e) === "pipe-size" && e.text);
  const idTexts = doc.entities.filter((e) => role(e) === "node-id" && e.text);
  const coverageTexts = doc.entities.filter((e) => role(e) === "coverage" && e.text);

  // segments from pipe entities (polylines → consecutive pairs)
  const segments: [DxfPoint, DxfPoint][] = [];
  for (const e of pipeEnts) {
    if (e.type === "LINE") {
      if (e.vertices[0] && e.vertices[1]) segments.push([e.vertices[0], e.vertices[1]]);
    } else {
      for (let i = 0; i + 1 < e.vertices.length; i++) segments.push([e.vertices[i]!, e.vertices[i + 1]!]);
    }
  }
  if (segments.length === 0) warnings.push("No pipe centerlines found on the layers mapped to 'pipes'.");

  // snap endpoints → nodes (source units)
  const tol = mapping.snapToleranceSource;
  const nodePts: DxfPoint[] = [];
  const snap = (p: DxfPoint): number => {
    for (let i = 0; i < nodePts.length; i++) if (dist3(nodePts[i]!, p) <= tol) return i;
    nodePts.push({ ...p });
    return nodePts.length - 1;
  };
  const segNodes = segments.map(([a, b]) => [snap(a), snap(b)] as [number, number]);

  // nearest text helper (3D), within a max distance
  const nearestText = (texts: DxfEntity[], at: DxfPoint, maxDist: number): string | undefined => {
    let best: { d: number; t: string } | undefined;
    for (const e of texts) {
      const p = e.vertices[0];
      if (!p || !e.text) continue;
      const d = dist3(p, at);
      if (d <= maxDist && (!best || d < best.d)) best = { d, t: e.text };
    }
    return best?.t;
  };

  // node ids from nearest id-text, else sequential; ensure uniqueness
  const used = new Set<string>();
  const nodeId: string[] = nodePts.map((p, i) => {
    let id = nearestText(idTexts, p, mapping.nodeIdTextMaxDistSource) ?? `N${i + 1}`;
    id = id.trim();
    if (used.has(id)) id = `${id}#${i + 1}`;
    used.add(id);
    return id;
  });
  const nodesWithMatchedId = nodePts.filter((p) => nearestText(idTexts, p, mapping.nodeIdTextMaxDistSource) !== undefined).length;

  // Heads are detected by EITHER a head glyph (circle/insert) OR a coverage
  // label near a node — whichever the drawing provides. Canute DXFs label
  // coverage ("11.00m2") at each head while drawing head symbols elsewhere.
  const headNodeIdx = new Set<number>();
  const headCoverageFt2 = new Map<number, number>();
  const considerHead = (at: DxfPoint, coverageStr?: string) => {
    let bi = -1, bd = Infinity;
    for (let i = 0; i < nodePts.length; i++) { const d = dist3(nodePts[i]!, at); if (d < bd) { bd = d; bi = i; } }
    if (bi >= 0 && bd <= mapping.coverageTextMaxDistSource) {
      headNodeIdx.add(bi);
      const m2 = coverageStr ? numToken(coverageStr) : undefined;
      if (m2 !== undefined && headCoverageFt2.get(bi) === undefined) headCoverageFt2.set(bi, m2 * 10.7639);
    }
  };
  for (const h of headEnts) considerHead(h.vertices[0]!, nearestText(coverageTexts, h.vertices[0]!, mapping.coverageTextMaxDistSource));
  for (const ct of coverageTexts) if (ct.vertices[0]) considerHead(ct.vertices[0], ct.text);

  // build model nodes
  const nodes = nodePts.map((p, i) => {
    const isHead = headNodeIdx.has(i);
    const node: Record<string, unknown> = {
      id: nodeId[i]!,
      type: isHead ? "sprinkler" : "junction",
      elevationFt: p.z * scale,
      geometry: { x: p.x * scale, y: p.y * scale, z: p.z * scale },
    };
    if (isHead) {
      node["kFactor"] = mapping.defaultKFactor;
      const cov = headCoverageFt2.get(i);
      if (cov !== undefined) node["coverageAreaFt2"] = Math.round(cov * 10) / 10;
    }
    return node;
  });

  // build model pipes
  let matchedSize = 0;
  const pipes = segments.map(([a, b], i) => {
    const [ai, bi] = segNodes[i]!;
    const mid: DxfPoint = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
    let mm = mapping.defaultNominalSizeMm;
    if (mapping.sizeSource === "nearest-text") {
      const t = nearestText(sizeTexts, mid, mapping.sizeTextMaxDistSource);
      const v = t ? numToken(t) : undefined;
      if (v !== undefined && v > 0) { mm = v; matchedSize++; }
    }
    const nominalImperial = mmToNominal(mm);
    // display size in the project's units: DN (mm) for metric, inch nominal for imperial.
    const nominalSize = mapping.displayUnits === "metric" ? String(Math.round(mm)) : nominalImperial;
    const lengthFt = dist3(a, b) * scale;
    const dir = directionOf(a, b);
    const dz = (b.z - a.z) * scale;
    return {
      id: `P-${String(i + 1).padStart(3, "0")}`,
      from: nodeId[ai]!,
      to: nodeId[bi]!,
      role: dir === "U" || dir === "D" ? "riser" : "branch-line",
      direction: dir,
      material: mapping.defaultMaterial,
      cFactor: mapping.defaultCFactor,
      nominalSize,
      internalDiameterIn: SCH40_ID_IN[nominalImperial] ?? undefined,
      lengthFt: Math.round(lengthFt * 1000) / 1000,
      ...(Math.abs(dz) > 1e-6 ? { elevationChangeFt: Math.round(dz * 1000) / 1000 } : {}),
    };
  });

  if (matchedSize < segments.length) warnings.push(`${segments.length - matchedSize} pipe(s) had no size text nearby — default ${mapping.defaultNominalSizeMm} mm used.`);

  const model = parseProject({
    schemaVersion: 2,
    meta: { id: mapping.projectId, name: mapping.projectName, systemType: mapping.systemType, standardId: mapping.standardId, units: mapping.displayUnits },
    network: { nodes, pipes, valves: [] },
  });

  return {
    model,
    warnings,
    stats: { nodes: nodes.length, pipes: pipes.length, heads: headNodeIdx.size, pipesWithMatchedSize: matchedSize, nodesWithMatchedId },
  };
}
