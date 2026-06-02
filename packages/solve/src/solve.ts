/**
 * Project → whole-network hydraulic solve. Builds a GGA network from a
 * ProjectModel (pipes → Hazen-Williams links, sprinklers → emitters, source →
 * fixed grade), then finds the operating point by coupling the source pressure
 * to the water-supply curve (city flow test ± fire pump) via a damped fixed
 * point. Produces SceneResults (for the viewer/sheets) + a Ch.27 summary + the
 * rich GGA results (for the detailed worksheet).
 */
import type { ProjectModel, Pipe } from "@rads/model";
import {
  solveGga,
  hwPipeLink,
  emitterLink,
  type GgaNetwork,
  type GgaLink,
  type GgaNode,
  type GgaResult,
} from "@rads/calc-engine";
import { cityCurve, pumpOnSuction, constantPressureCurve, sampleCurve, type SupplyCurve, type FlowTest, type CurvePoint } from "@rads/calc-engine";
import { getStandard, SCH40_ID_IN, type StandardId } from "@rads/standards-engine";

export interface NodeResult {
  totalPressurePsi?: number;
  normalPressurePsi?: number;
  velocityPressurePsi?: number;
  dischargeGpm?: number;
}
export interface PipeResult {
  flowGpm?: number;
  velocityFps?: number;
  frictionLossPsi?: number;
  elevationLossPsi?: number;
  totalLossPsi?: number;
}
export interface SceneResults {
  nodes: Record<string, NodeResult>;
  pipes: Record<string, PipeResult>;
}

export interface SolveSummary {
  sourceId: string;
  sourceElevationFt: number;
  systemFlowGpm: number;
  hoseAllowanceGpm: number;
  totalDemandGpm: number;
  /** Required gauge pressure at the source to deliver min pressure at the most-remote head (psi). */
  sourcePressurePsi: number;
  availablePsi: number;
  /** Supply margin = available − required (psi). */
  marginPsi: number;
  passesSupply: boolean;
  /** Most-remote (lowest-pressure) sprinkler. */
  mostRemoteSprinkler?: { id: string; pressurePsi: number; flowGpm: number };
  minSprinklerPressurePsi: number;
  meetsMinPressure: boolean;
  maxJunctionImbalanceGpm: number;
  supplyCurveSamples: CurvePoint[];
  converged: boolean;
}

export interface ProjectSolution {
  results: SceneResults;
  summary: SolveSummary;
  gga: GgaResult;
}

export interface SolveOptions {
  /** Override the supply curve (else derived from waterSupply). */
  supply?: SupplyCurve;
  /** Explicit design-area sprinkler ids (else the N most-remote are chosen). */
  designArea?: Set<string>;
}

const num = (o: unknown, k: string): number | undefined => {
  const v = (o as Record<string, unknown> | undefined)?.[k];
  return typeof v === "number" ? v : undefined;
};

/** Source node = the one with no incoming pipe (the supply connection). */
function findSource(model: ProjectModel): { id: string; elevationFt: number } {
  const incoming = new Set(model.network.pipes.map((p) => p.to));
  const root = model.network.nodes.find((n) => !incoming.has(n.id)) ?? model.network.nodes[0];
  return { id: root?.id ?? "SOURCE", elevationFt: root?.elevationFt ?? 0 };
}

function supplyCurveFor(model: ProjectModel): { curve: SupplyCurve; maxFlowGpm: number } {
  const ws = model.waterSupply as Record<string, unknown> | undefined;
  const ft = ws?.["flowTest"] as Record<string, unknown> | undefined;
  if (ft && typeof ft["staticPsi"] === "number") {
    const test: FlowTest = { staticPsi: ft["staticPsi"] as number, residualPsi: (ft["residualPsi"] as number) ?? (ft["staticPsi"] as number), testFlowGpm: (ft["testFlowGpm"] as number) ?? 1000 };
    let curve = cityCurve(test);
    const fp = ws?.["firePump"] as Record<string, unknown> | undefined;
    if (fp && typeof fp["ratedFlowGpm"] === "number") {
      curve = pumpOnSuction(curve, {
        churnPsi: (fp["churnPsi"] as number) ?? (fp["ratedPsi"] as number) * 1.2,
        ratedFlowGpm: fp["ratedFlowGpm"] as number,
        ratedPsi: (fp["ratedPsi"] as number) ?? 0,
        ...(typeof fp["overloadFlowGpm"] === "number" ? { overloadFlowGpm: fp["overloadFlowGpm"] as number } : {}),
        ...(typeof fp["overloadPsi"] === "number" ? { overloadPsi: fp["overloadPsi"] as number } : {}),
      });
    }
    return { curve, maxFlowGpm: test.testFlowGpm * 1.5 };
  }
  return { curve: constantPressureCurve(100), maxFlowGpm: 2000 };
}

function pipeCFactor(p: Pipe, std: ReturnType<typeof getStandard> | undefined): number {
  if (typeof p.cFactor === "number") return p.cFactor;
  if (p.material && std?.cFactor) return std.cFactor(p.material) ?? 120;
  return 120;
}
function pipeId(p: Pipe): number {
  if (typeof p.internalDiameterIn === "number") return p.internalDiameterIn;
  if (p.nominalSize && SCH40_ID_IN[p.nominalSize]) return SCH40_ID_IN[p.nominalSize]!;
  return 1.049;
}
function pipeEquivLen(p: Pipe): number {
  return (p.fittings ?? []).reduce((s, f) => s + (f.equivalentLengthFt ?? 0), 0);
}

/** Hydraulic path length (ft) from the source to every node (tree walk). */
function pathDistances(model: ProjectModel, sourceId: string): Map<string, number> {
  const byFrom = new Map<string, Pipe[]>();
  for (const p of model.network.pipes) (byFrom.get(p.from) ?? byFrom.set(p.from, []).get(p.from)!).push(p);
  const dist = new Map<string, number>([[sourceId, 0]]);
  const queue = [sourceId];
  while (queue.length) {
    const id = queue.shift()!;
    const d = dist.get(id) ?? 0;
    for (const p of byFrom.get(id) ?? []) {
      if (!dist.has(p.to)) {
        dist.set(p.to, d + (p.lengthFt ?? 0));
        queue.push(p.to);
      }
    }
  }
  return dist;
}

/** The design area = the `count` most-remote sprinklers (by path length). */
function designAreaSet(model: ProjectModel, sourceId: string, count: number): Set<string> {
  const dist = pathDistances(model, sourceId);
  const spk = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0);
  spk.sort((a, b) => (dist.get(b.id) ?? 0) - (dist.get(a.id) ?? 0));
  return new Set(spk.slice(0, Math.max(1, count)).map((s) => s.id));
}

/** Build a GGA network with the source fixed at `sourceHeadPsi` (total head). Only sprinklers in `open` discharge. */
function buildGga(model: ProjectModel, source: { id: string; elevationFt: number }, sourceHeadPsi: number, std: ReturnType<typeof getStandard> | undefined, open: Set<string>): GgaNetwork {
  const nodes: GgaNode[] = [];
  const links: GgaLink[] = [];
  const byId = new Map(model.network.nodes.map((n) => [n.id, n]));

  // valve equivalent length → first pipe of the matching role
  const extraEquiv = new Map<string, number>();
  const pipesByRole = new Map<string, Pipe[]>();
  for (const p of model.network.pipes) (pipesByRole.get(p.role ?? "") ?? pipesByRole.set(p.role ?? "", []).get(p.role ?? "")!).push(p);
  for (const v of model.network.valves ?? []) {
    const host = (v.onPipe && (model.network.pipes.find((p) => p.id === v.onPipe) || pipesByRole.get(v.onPipe)?.[0])) || undefined;
    if (host && typeof v.equivalentLengthFt === "number") extraEquiv.set(host.id, (extraEquiv.get(host.id) ?? 0) + v.equivalentLengthFt);
  }

  for (const n of model.network.nodes) {
    if (n.id === source.id) nodes.push({ id: n.id, fixed: true, headPsi: sourceHeadPsi, elevationFt: n.elevationFt ?? 0 });
    else nodes.push({ id: n.id, elevationFt: n.elevationFt ?? 0, demandGpm: n.flowGpm && n.type !== "sprinkler" ? n.flowGpm : 0 });
  }

  for (const p of model.network.pipes) {
    const eq = pipeEquivLen(p) + (extraEquiv.get(p.id) ?? 0);
    const cFactor = pipeCFactor(p, std);
    const id = pipeId(p);
    const link = hwPipeLink(p.id, p.from, p.to, { cFactor, internalDiameterIn: id, lengthFt: p.lengthFt ?? 0, equivalentLengthFt: eq });
    link.nominalSize = p.nominalSize;
    link.cFactorUsed = cFactor;
    link.lengthFt = p.lengthFt ?? 0;
    link.equivalentLengthFt = eq;
    links.push(link);
  }

  // open (design-area) sprinklers → emitters discharging to a fixed sink at gauge 0
  for (const n of model.network.nodes) {
    if (n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0 && open.has(n.id)) {
      const sink = `${n.id}#sink`;
      nodes.push({ id: sink, fixed: true, headPsi: 0.433 * (n.elevationFt ?? 0), elevationFt: n.elevationFt ?? 0 });
      links.push(emitterLink(`${n.id}#em`, n.id, sink, n.kFactor));
    }
  }
  void byId;
  return { nodes, links };
}

export function solveProject(model: ProjectModel, opts: SolveOptions = {}): ProjectSolution {
  const source = findSource(model);
  const std = (() => {
    try {
      return getStandard((model.meta.standardId ?? "nfpa13") as StandardId);
    } catch {
      return undefined;
    }
  })();
  const { curve: derivedCurve, maxFlowGpm } = supplyCurveFor(model);
  const supply = opts.supply ?? derivedCurve;

  const sprinklers = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0);
  // design area = the N most-remote sprinklers (N from designBasis, else all)
  const areaCount = num(model.designBasis, "operatingSprinklers") ?? sprinklers.length;
  const open = opts.designArea ?? designAreaSet(model, source.id, areaCount);
  const openSprinklers = sprinklers.filter((n) => open.has(n.id));
  const emitterFlow = (g: GgaResult): number =>
    Object.values(g.links).reduce((s, l) => (l.id.endsWith("#em") ? s + Math.abs(l.flowGpm) : s), 0);
  const remotePressure = (g: GgaResult): number =>
    openSprinklers.reduce((min, n) => Math.min(min, g.nodes[n.id]?.pressurePsi ?? Infinity), Infinity);

  const minSprinklerPressurePsi = num(model.designBasis, "minSprinklerPressurePsi") ?? std?.minResidualPressure?.() ?? 7;
  const elevHead = 0.433 * source.elevationFt;
  const solveAt = (sourceGaugePsi: number) => solveGga(buildGga(model, source, sourceGaugePsi + elevHead, std, open));

  // Find the required source gauge pressure so the most-remote head sits at its
  // minimum design pressure (the standard "required pressure" design output).
  // remotePressure increases with sourceP → binary search.
  let sourceP: number;
  let gga: GgaResult;
  if (openSprinklers.length === 0) {
    sourceP = supply(0);
    gga = solveAt(sourceP);
  } else {
    let lo = 0;
    let hi = minSprinklerPressurePsi + 1000;
    for (let i = 0; i < 50; i++) {
      const mid = (lo + hi) / 2;
      const rp = remotePressure(solveAt(mid));
      if (rp < minSprinklerPressurePsi) lo = mid;
      else hi = mid;
    }
    sourceP = (lo + hi) / 2;
    gga = solveAt(sourceP);
  }

  const systemFlowGpm = emitterFlow(gga);

  // results for the scene / sheets
  const results: SceneResults = { nodes: {}, pipes: {} };
  for (const [id, r] of Object.entries(gga.nodes)) {
    if (id.endsWith("#sink")) continue;
    results.nodes[id] = {
      ...(r.pressurePsi !== undefined ? { totalPressurePsi: r.pressurePsi } : {}),
      ...(r.normalPressurePsi !== undefined ? { normalPressurePsi: r.normalPressurePsi } : {}),
      ...(r.velocityPressurePsi !== undefined ? { velocityPressurePsi: r.velocityPressurePsi } : {}),
      ...(r.dischargeGpm !== undefined ? { dischargeGpm: r.dischargeGpm } : {}),
    };
  }
  for (const [id, r] of Object.entries(gga.links)) {
    if (id.endsWith("#em")) continue;
    results.pipes[id] = {
      flowGpm: Math.abs(r.flowGpm),
      ...(r.velocityFps !== undefined ? { velocityFps: r.velocityFps } : {}),
      frictionLossPsi: r.frictionLossPsi,
      elevationLossPsi: r.elevationLossPsi,
      totalLossPsi: r.totalLossPsi,
    };
  }

  // most-remote sprinkler (within the design area) = lowest gauge pressure
  let remote: { id: string; pressurePsi: number; flowGpm: number } | undefined;
  for (const n of openSprinklers) {
    const p = gga.nodes[n.id]?.pressurePsi;
    const q = gga.nodes[n.id]?.dischargeGpm ?? 0;
    if (p === undefined) continue;
    if (!remote || p < remote.pressurePsi) remote = { id: n.id, pressurePsi: p, flowGpm: q };
  }

  const hazard = model.meta.hazardClass ?? "oh2";
  const hoseAllowanceGpm = num(model.designBasis, "hoseAllowanceGpm") ?? std?.hoseAllowance?.(hazard) ?? 0;
  const totalDemandGpm = systemFlowGpm + hoseAllowanceGpm;
  const availablePsi = supply(totalDemandGpm);
  const marginPsi = availablePsi - sourceP;

  const summary: SolveSummary = {
    sourceId: source.id,
    sourceElevationFt: source.elevationFt,
    systemFlowGpm,
    hoseAllowanceGpm,
    totalDemandGpm,
    sourcePressurePsi: sourceP,
    availablePsi,
    marginPsi,
    passesSupply: marginPsi >= -1e-6,
    ...(remote ? { mostRemoteSprinkler: remote } : {}),
    minSprinklerPressurePsi,
    meetsMinPressure: remote ? remote.pressurePsi >= minSprinklerPressurePsi - 0.5 : true,
    maxJunctionImbalanceGpm: gga.maxImbalanceGpm,
    supplyCurveSamples: sampleCurve(supply, maxFlowGpm, 24),
    converged: gga.converged,
  };

  return { results, summary, gga };
}
