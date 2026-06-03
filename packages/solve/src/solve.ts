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
  dwPipeLink,
  emitterLink,
  type GgaNetwork,
  type GgaLink,
  type GgaNode,
  type GgaResult,
} from "@rads/calc-engine";
import { cityCurve, pumpOnSuction, constantPressureCurve, sampleCurve, velocityFps, type SupplyCurve, type FlowTest, type CurvePoint } from "@rads/calc-engine";
import { getStandard, internalDiameterForMaterial, defaultCFactorForMaterial, pipeMaterial, roughnessForMaterial, fittingEquivalentLengthFt, type StandardId } from "@rads/standards-engine";

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
  /** Operating sprinklers in the design area (count). */
  operatingHeads: number;
  /** Design area (ft²) when area-density based. */
  designAreaFt2?: number;
  /** Required discharge per head to meet the design density (gpm). */
  requiredHeadFlowGpm?: number;
  minSprinklerPressurePsi: number;
  meetsMinPressure: boolean;
  /** Design-area sprinklers whose pressure falls below the minimum (id + psi). */
  lowPressureNodes: { id: string; pressurePsi: number }[];
  maxJunctionImbalanceGpm: number;
  supplyCurveSamples: CurvePoint[];
  /** NFPA 20 pump suction-velocity check at 150% rated flow (limit 15 ft/s). */
  suctionCheck?: { velocityFps: number; atFlowGpm: number; ok: boolean };
  /** Required stored water = total demand × supply duration (gal), when a
   * duration is given; with the reservoir capacity if modeled. */
  requiredStoredGal?: number;
  durationMin?: number;
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

function pipeCFactor(p: Pipe, std: ReturnType<typeof getStandard> | undefined, dry: boolean): number {
  if (typeof p.cFactor === "number") return p.cFactor;
  if (p.material) {
    const c = std?.cFactor?.(p.material) ?? defaultCFactorForMaterial(p.material);
    // Dry/pre-action steel systems use C = 100 (NFPA 13 Table 27.2.4.8.1).
    return dry && pipeMaterial(p.material).family === "steel" ? Math.min(c, 100) : c;
  }
  return dry ? 100 : 120;
}
function pipeId(p: Pipe): number {
  if (typeof p.internalDiameterIn === "number") return p.internalDiameterIn;
  if (p.nominalSize) return internalDiameterForMaterial(p.material, p.nominalSize);
  return 1.049;
}
function pipeEquivLen(p: Pipe, std?: ReturnType<typeof getStandard>): number {
  const useStd = std && std.units === "metric" && std.fittingEquivalentLength;
  return (p.fittings ?? []).reduce((s, f) => {
    if (useStd) {
      const v = std!.fittingEquivalentLength!(f.type, p.nominalSize ?? "1", { cFactor: p.cFactor });
      if (v !== undefined) return s + v * (f.qty ?? 1);
    }
    return s + (f.equivalentLengthFt ?? 0);
  }, 0);
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

/**
 * NFPA 13 Auto-Peak: select the most-remote heads (by path length) and add them
 * until their summed coverage area reaches the design area — so the operating-
 * head count is derived from the area/density basis rather than entered. Returns
 * undefined when no design area is set (caller falls back to the explicit count).
 * (Schematic proxy for "most-demanding remote rectangle"; true geometric remote
 * area needs dimensioned layout.)
 */
function autoPeakAreaSet(model: ProjectModel, sourceId: string): Set<string> | undefined {
  const designArea = num(model.designBasis, "designAreaFt2");
  if (!designArea) return undefined;
  const dist = pathDistances(model, sourceId);
  const spk = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0);
  if (spk.length === 0) return undefined;
  spk.sort((a, b) => (dist.get(b.id) ?? 0) - (dist.get(a.id) ?? 0));
  const set = new Set<string>();
  let area = 0;
  for (const n of spk) {
    set.add(n.id);
    area += n.coverageAreaFt2 ?? 130;
    if (area >= designArea) break;
  }
  return set;
}

/** Residential design-head count: 13D = two most-remote, 13R = four most-remote. */
function residentialDesignCount(standardId: string | undefined): number | undefined {
  if (standardId === "nfpa13d") return 2;
  if (standardId === "nfpa13r") return 4;
  return undefined;
}

interface StandpipeParams { minResidual: number; firstFlow: number; addFlow: number; maxTotal: number }

/** NFPA 14 §7.10 design parameters by standpipe class. Class I/III: 100 psi at
 * the most-remote 2½" outlet, 500 gpm first standpipe + 250 each additional,
 * cap 1000 gpm. Class II: 65 psi, 100 gpm. */
function standpipeClassParams(cls: string | undefined): StandpipeParams {
  const c = (cls ?? "I").toUpperCase().replace(/CLASS\s*/i, "").trim();
  if (c === "II") return { minResidual: 65, firstFlow: 100, addFlow: 0, maxTotal: 100 };
  return { minResidual: 100, firstFlow: 500, addFlow: 250, maxTotal: 1000 };
}

/** Assign NFPA 14 demand to each hose connection: the most-remote gets the first-
 * standpipe flow, the rest the additional-standpipe flow, capped at the total. */
function standpipeDemands(model: ProjectModel, sourceId: string, params: StandpipeParams): Map<string, number> {
  const dist = pathDistances(model, sourceId);
  const hose = model.network.nodes.filter((n) => n.type === "hose-station");
  hose.sort((a, b) => (dist.get(b.id) ?? 0) - (dist.get(a.id) ?? 0));
  const demands = new Map<string, number>();
  let total = 0;
  hose.forEach((n, i) => {
    const give = Math.max(0, Math.min(i === 0 ? params.firstFlow : params.addFlow, params.maxTotal - total));
    if (give > 0) { demands.set(n.id, give); total += give; }
  });
  return demands;
}

/** Build a GGA network with the source fixed at `sourceHeadPsi` (total head). Only sprinklers in `open` discharge. */
function buildGga(model: ProjectModel, source: { id: string; elevationFt: number }, sourceHeadPsi: number, std: ReturnType<typeof getStandard> | undefined, open: Set<string>, demandOverride?: Map<string, number>): GgaNetwork {
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
    else nodes.push({ id: n.id, elevationFt: n.elevationFt ?? 0, demandGpm: demandOverride?.get(n.id) ?? (n.flowGpm && n.type !== "sprinkler" ? n.flowGpm : 0) });
  }

  const dry = model.meta.fillType === "dry" || model.meta.fillType === "preaction";
  const dwMethod = (model.designBasis as Record<string, unknown> | undefined)?.["frictionMethod"] === "darcy-weisbach";
  const viscCst = num(model.designBasis, "fluidViscosityCst");
  const viscosityFt2s = viscCst !== undefined ? viscCst * 1.07639e-5 : 1.21e-5; // water 60°F default
  // Optional auto-fitting: add a 90° elbow equivalent where a pipe changes
  // routing direction from its upstream pipe (NFPA equivalent-length table).
  const autoFit = !!(model.designBasis as Record<string, unknown> | undefined)?.["autoFittings"];
  const upstreamByNode = new Map<string, Pipe>();
  if (autoFit) for (const p of model.network.pipes) upstreamByNode.set(p.to, p);
  for (const p of model.network.pipes) {
    let eq = pipeEquivLen(p, std) + (extraEquiv.get(p.id) ?? 0);
    if (autoFit) {
      const up = upstreamByNode.get(p.from);
      if (up && p.direction && up.direction && p.direction !== up.direction) {
        eq += fittingEquivalentLengthFt("elbow-90", p.nominalSize ?? "1") ?? 0;
      }
    }
    const cFactor = pipeCFactor(p, std, dry);
    const id = pipeId(p);
    const physLen = Math.max(0, (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0));
    const link = dwMethod
      ? dwPipeLink(p.id, p.from, p.to, { internalDiameterIn: id, lengthFt: physLen, equivalentLengthFt: eq, roughnessFt: roughnessForMaterial(p.material), viscosityFt2s })
      : hwPipeLink(p.id, p.from, p.to, { cFactor, internalDiameterIn: id, lengthFt: physLen, equivalentLengthFt: eq });
    link.nominalSize = p.nominalSize;
    link.cFactorUsed = cFactor;
    link.lengthFt = physLen;
    link.equivalentLengthFt = eq;
    if (typeof p.fixedDropPsi === "number" && p.fixedDropPsi !== 0) link.fixedDropPsi = p.fixedDropPsi;
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
  // Design area: explicit operating-head count → most-remote N; else NFPA
  // area-density Auto-Peak (accumulate coverage to the design area); else all.
  const explicitCount = num(model.designBasis, "operatingSprinklers");
  const residentialCount = residentialDesignCount(model.meta.standardId);
  // NFPA 15 deluge / water-spray: open nozzles, every head flows at once.
  const delugeMode = model.meta.fillType === "deluge" || model.meta.systemType === "deluge";
  const open =
    opts.designArea ??
    (delugeMode
      ? new Set(sprinklers.map((s) => s.id))
      : explicitCount !== undefined
        ? designAreaSet(model, source.id, explicitCount)
        : residentialCount !== undefined
          ? designAreaSet(model, source.id, residentialCount)
          : autoPeakAreaSet(model, source.id) ?? designAreaSet(model, source.id, sprinklers.length));
  const openSprinklers = sprinklers.filter((n) => open.has(n.id));

  // Standpipe (NFPA 14) vs sprinkler (NFPA 13) design mode.
  const standpipeMode = (model.meta.systemType === "standpipe" || model.meta.standardId === "nfpa14") && model.network.nodes.some((n) => n.type === "hose-station");
  const spParams = standpipeMode ? standpipeClassParams(model.meta.standpipeClass) : undefined;
  const demandOverride = standpipeMode ? standpipeDemands(model, source.id, spParams!) : undefined;

  const emitterFlow = (g: GgaResult): number =>
    Object.values(g.links).reduce((s, l) => (l.id.endsWith("#em") ? s + Math.abs(l.flowGpm) : s), 0);

  // Design points: open sprinklers (sprinkler mode) or hose connections (standpipe).
  const designNodeIds = standpipeMode ? [...(demandOverride?.keys() ?? [])] : openSprinklers.map((n) => n.id);
  const remotePressure = (g: GgaResult): number =>
    designNodeIds.reduce((min, id) => Math.min(min, g.nodes[id]?.pressurePsi ?? Infinity), Infinity);

  // Minimum design pressure: NFPA 14 residual (standpipe), else the greater of
  // the listed minimum and the area-density pressure (sprinkler).
  const listedMin = num(model.designBasis, "minSprinklerPressurePsi") ?? std?.minResidualPressure?.() ?? 7;
  const density = num(model.designBasis, "densityGpmFt2");
  const dsK = num(model.designBasis, "sprinklerKFactor");
  let densityPressurePsi = 0;
  let requiredHeadFlowGpm: number | undefined;
  if (!standpipeMode && density) {
    for (const n of openSprinklers) {
      const flow = density * (n.coverageAreaFt2 ?? 130);
      const k = n.kFactor ?? dsK ?? 5.6;
      requiredHeadFlowGpm = Math.max(requiredHeadFlowGpm ?? 0, flow);
      densityPressurePsi = Math.max(densityPressurePsi, Math.pow(flow / k, 2));
    }
  }
  const minSprinklerPressurePsi = standpipeMode ? spParams!.minResidual : Math.max(listedMin, densityPressurePsi);
  const elevHead = 0.433 * source.elevationFt;
  const solveAt = (sourceGaugePsi: number) =>
    solveGga(buildGga(model, source, sourceGaugePsi + elevHead, std, standpipeMode ? new Set<string>() : open, demandOverride));

  // Binary-search the source gauge pressure so the most-remote design point sits
  // at its minimum (sprinkler min pressure / standpipe residual).
  let sourceP: number;
  let gga: GgaResult;
  if (designNodeIds.length === 0) {
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

  const systemFlowGpm = standpipeMode ? [...(demandOverride?.values() ?? [])].reduce((s, v) => s + v, 0) : emitterFlow(gga);

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

  // most-remote design point (sprinkler or hose connection) = lowest gauge pressure
  let remote: { id: string; pressurePsi: number; flowGpm: number } | undefined;
  for (const id of designNodeIds) {
    const p = gga.nodes[id]?.pressurePsi;
    if (p === undefined) continue;
    const q = standpipeMode ? demandOverride?.get(id) ?? 0 : gga.nodes[id]?.dischargeGpm ?? 0;
    if (!remote || p < remote.pressurePsi) remote = { id, pressurePsi: p, flowGpm: q };
  }

  const hazard = model.meta.hazardClass ?? "oh2";
  const hoseAllowanceGpm = num(model.designBasis, "hoseAllowanceGpm") ?? std?.hoseAllowance?.(hazard) ?? 0;
  const totalDemandGpm = systemFlowGpm + hoseAllowanceGpm;
  const availablePsi = supply(totalDemandGpm);
  const marginPsi = availablePsi - sourceP;

  // Stored-water requirement = total demand × supply duration.
  const durationMin = num(model.designBasis, "durationMin");
  const requiredStoredGal = durationMin !== undefined ? Math.round(totalDemandGpm * durationMin) : undefined;

  // NFPA 20: suction velocity at 150% rated flow must not exceed 15 ft/s.
  const suction = model.network.suction;
  const pumpDs = model.network.pump?.datasheet;
  let suctionCheck: SolveSummary["suctionCheck"];
  if (suction && typeof suction.sizeIn === "number" && pumpDs && typeof pumpDs.ratedFlowGpm === "number") {
    const overload = pumpDs.overloadFlowGpm ?? pumpDs.ratedFlowGpm * 1.5;
    const id = internalDiameterForMaterial(suction.material, String(suction.sizeIn));
    const vel = velocityFps(overload, id);
    suctionCheck = { velocityFps: vel, atFlowGpm: overload, ok: vel <= 15 };
  }

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
    operatingHeads: designNodeIds.length,
    ...(num(model.designBasis, "designAreaFt2") !== undefined ? { designAreaFt2: num(model.designBasis, "designAreaFt2") } : {}),
    ...(requiredHeadFlowGpm !== undefined ? { requiredHeadFlowGpm } : {}),
    minSprinklerPressurePsi,
    meetsMinPressure: remote ? remote.pressurePsi >= minSprinklerPressurePsi - 0.5 : true,
    lowPressureNodes: designNodeIds
      .map((id) => ({ id, pressurePsi: gga.nodes[id]?.pressurePsi ?? 0 }))
      .filter((x) => x.pressurePsi < minSprinklerPressurePsi - 0.5)
      .sort((a, b) => a.pressurePsi - b.pressurePsi),
    maxJunctionImbalanceGpm: gga.maxImbalanceGpm,
    supplyCurveSamples: sampleCurve(supply, maxFlowGpm, 24),
    ...(suctionCheck ? { suctionCheck } : {}),
    ...(requiredStoredGal !== undefined ? { requiredStoredGal, durationMin } : {}),
    converged: gga.converged,
  };

  return { results, summary, gga };
}
