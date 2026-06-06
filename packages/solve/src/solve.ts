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
import { getStandard, internalDiameterForMaterial, defaultCFactorForMaterial, pipeMaterial, roughnessForMaterial, fittingEquivalentLengthFt, cValueMultiplier, equivalentLengthModifier, type StandardId } from "@rads/standards-engine";

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
  /** Design target safety margin (psi) + whether the margin meets it, when set. */
  targetMarginPsi?: number;
  meetsTargetMargin?: boolean;
  /** Component pressure rating (psi, default 175) + whether the required source
   * pressure stays within it — above it needs special (300 psi) components. */
  componentRatingPsi: number;
  withinComponentRating: boolean;
  /** Most-remote (lowest-pressure) sprinkler. */
  mostRemoteSprinkler?: { id: string; pressurePsi: number; flowGpm: number };
  /** Operating sprinklers in the design area (count). */
  operatingHeads: number;
  /** True when the operating set was pinned (designBasis.designAreaNodeIds). */
  manualDesignArea?: boolean;
  /** Design area (ft²) when area-density based — includes the dry-system increase. */
  designAreaFt2?: number;
  /** Remote-area dimension parallel to the branch lines, 1.2·√A (ft) — §27.2.4.2.2. */
  designAreaDimFt?: number;
  /** Design-area increase applied for a dry / preaction system (e.g. 30), if any. */
  dryAreaIncreasePct?: number;
  /** Design-area increase applied for a sloped ceiling (> 2/12), if any. */
  slopeAreaIncreasePct?: number;
  /** Quick-response design-area reduction applied (e.g. 25), if any. */
  qrAreaReductionPct?: number;
  /** Required discharge per head to meet the design density (gpm). */
  requiredHeadFlowGpm?: number;
  /** Design density (gpm/ft²) + the density actually delivered at the most remote
   * sprinkler (its discharge / coverage), for density/area designs. */
  designDensityGpmFt2?: number;
  deliveredDensityGpmFt2?: number;
  minSprinklerPressurePsi: number;
  meetsMinPressure: boolean;
  /** Design-area sprinklers whose pressure falls below the minimum (id + psi). */
  lowPressureNodes: { id: string; pressurePsi: number }[];
  maxJunctionImbalanceGpm: number;
  supplyCurveSamples: CurvePoint[];
  /** NFPA 20 pump suction-velocity check at 150% rated flow (limit 15 ft/s). */
  suctionCheck?: { velocityFps: number; atFlowGpm: number; ok: boolean };
  /** Peak pipe velocity (ft/s) + the configured limit (default 20) + pass flag. */
  maxVelocityFps?: number;
  maxVelocityPipe?: string;
  velocityLimitFps?: number;
  velocityOk?: boolean;
  /** Required stored water = total demand × supply duration (gal), when a
   * duration is given; with the reservoir capacity if modeled. */
  requiredStoredGal?: number;
  durationMin?: number;
  /** Reservoir/tank capacity (gal) if modeled, and whether it meets the requirement. */
  availableStoredGal?: number;
  storedWaterAdequate?: boolean;
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

function supplyCurveFor(model: ProjectModel, source: { id: string; elevationFt: number }): { curve: SupplyCurve; maxFlowGpm: number } {
  const ws = model.waterSupply as Record<string, unknown> | undefined;
  // A fire pump (if modeled) boosts whichever base supply is used.
  const fp = ws?.["firePump"] as Record<string, unknown> | undefined;
  const withPump = (curve: SupplyCurve): SupplyCurve =>
    fp && typeof fp["ratedFlowGpm"] === "number"
      ? pumpOnSuction(curve, {
          churnPsi: (fp["churnPsi"] as number) ?? (fp["ratedPsi"] as number) * 1.2,
          ratedFlowGpm: fp["ratedFlowGpm"] as number,
          ratedPsi: (fp["ratedPsi"] as number) ?? 0,
          ...(typeof fp["overloadFlowGpm"] === "number" ? { overloadFlowGpm: fp["overloadFlowGpm"] as number } : {}),
          ...(typeof fp["overloadPsi"] === "number" ? { overloadPsi: fp["overloadPsi"] as number } : {}),
        })
      : curve;

  // Fixed-pressure source: gravity / elevated tank — a flat curve at the tank head.
  if (ws?.["supplyType"] === "fixed-pressure") {
    let psi = typeof ws["fixedPressurePsi"] === "number" ? (ws["fixedPressurePsi"] as number) : undefined;
    // No explicit pressure → derive the gravity head from an elevated tank:
    // (water-surface elevation − supply-point elevation) × 0.4335 psi/ft.
    if (psi === undefined) {
      const r = model.network.reservoir as Record<string, unknown> | undefined;
      const h = typeof r?.["heightFt"] === "number" ? (r["heightFt"] as number) : undefined;
      if (h !== undefined) {
        const base = typeof r?.["baseElevationFt"] === "number" ? (r["baseElevationFt"] as number) : 0;
        psi = Math.max(0, (base + h - (source.elevationFt ?? 0)) * 0.4335);
      }
    }
    return { curve: withPump(constantPressureCurve(psi ?? 50)), maxFlowGpm: 2000 };
  }

  const ft = ws?.["flowTest"] as Record<string, unknown> | undefined;
  if (ft && typeof ft["staticPsi"] === "number") {
    const test: FlowTest = { staticPsi: ft["staticPsi"] as number, residualPsi: (ft["residualPsi"] as number) ?? (ft["staticPsi"] as number), testFlowGpm: (ft["testFlowGpm"] as number) ?? 1000 };
    return { curve: withPump(cityCurve(test)), maxFlowGpm: test.testFlowGpm * 1.5 };
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
function isDrySystem(model: ProjectModel): boolean {
  return model.meta.fillType === "dry" || model.meta.fillType === "preaction";
}

/** Minimum water-supply duration (min) by hazard when none is entered — the lower
 * bound of NFPA 13 Table 19.3.3.1.2 (LH 30 / OH 60 / EH 90), FM DS 3-26 §2.3.1.13
 * (60), and EN 12845. The AHJ may require longer; the user can override. */
function defaultDurationMin(model: ProjectModel): number | undefined {
  const id = model.meta.standardId;
  const hz = String(model.meta.hazardClass ?? "").toLowerCase();
  if (id === "nfpa13" || id === "nfpa13r" || id === "nfpa13d" || id === "en12845" || id === "as2118") {
    if (hz.startsWith("lh") || hz === "light" || hz === "elh") return 30;
    if (hz.startsWith("eh") || hz.startsWith("hh")) return 90;
    if (hz.startsWith("oh")) return 60;
  }
  if (id === "fmds") return 60; // DS 3-26 non-storage; storage schemes set their own
  return undefined;
}

/**
 * NFPA 13 §19.3.3.2 design-area adjustments, compounded per §19.3.3.2.8 (each
 * applied to the originally-selected area):
 *   - dry / double-interlock preaction → +30% (§19.3.3.2.5)
 *   - sloped ceiling, pitch > 2 in 12  → +30% (§19.3.3.2.4)
 *   - quick-response, wet LH/OH        → reduction up to 40% (§19.3.3.2.3)
 * QR requires a WET system (so never with dry) but DOES compound with a slope.
 */
function areaAdjustments(model: ProjectModel): { factor: number; dryPct?: number; slopePct?: number; qrPct?: number } {
  const dry = isDrySystem(model);
  const slope = (model.designBasis as Record<string, unknown> | undefined)?.["steepSlope"] === true;
  const qrRaw = num(model.designBasis, "qrAreaReductionPct");
  const hz = String(model.meta.hazardClass ?? "").toLowerCase();
  const wet = !model.meta.fillType || model.meta.fillType === "wet";
  const qrOk = !!qrRaw && qrRaw > 0 && wet && (hz === "light" || hz === "oh1" || hz === "oh2");
  let factor = 1;
  if (dry) factor *= 1.3;
  if (slope) factor *= 1.3;
  let qrPct: number | undefined;
  if (qrOk) { const qf = Math.max(0.6, 1 - qrRaw! / 100); factor *= qf; qrPct = Math.round((1 - qf) * 100); }
  return { factor, ...(dry ? { dryPct: 30 } : {}), ...(slope ? { slopePct: 30 } : {}), ...(qrPct !== undefined ? { qrPct } : {}) };
}
function designAreaFactor(model: ProjectModel): number {
  return areaAdjustments(model).factor;
}

/**
 * NFPA 13 §27.2.4.2.2 "remote area shape": the design area is a rectangle whose
 * dimension parallel to the branch lines is 1.2·√A, so each branch line carries
 * ceil(1.2·√A / spacing) sprinklers, taken from the most-remote branch lines
 * inward until A is covered. Returns undefined (caller falls back to the simple
 * most-remote accumulation) unless the topology is a clear multi-branch tree
 * (pipe roles set + ≥ 2 branch lines), so models without roles are unaffected.
 */
function branchAwareAreaSet(model: ProjectModel, sourceId: string, designArea: number, minHeads: number): Set<string> | undefined {
  const pipes = model.network.pipes;
  if (!pipes.some((p) => p.role && p.role !== "branch-line")) return undefined; // roles not set → can't identify branches
  const cov = new Map(model.network.nodes.map((n) => [n.id, n.coverageAreaFt2 ?? 130]));
  const spkIds = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0).map((n) => n.id);
  if (spkIds.length === 0) return undefined;

  // union-find over branch-line pipes only → each component is one branch line
  const parent = new Map<string, string>(model.network.nodes.map((n) => [n.id, n.id]));
  const find = (x: string): string => { let r = x; while (parent.get(r) !== r) r = parent.get(r)!; while (parent.get(x) !== r) { const n = parent.get(x)!; parent.set(x, r); x = n; } return r; };
  for (const p of pipes) if ((p.role ?? "branch-line") === "branch-line" && parent.has(p.from) && parent.has(p.to)) { const a = find(p.from), b = find(p.to); if (a !== b) parent.set(a, b); }

  const branches = new Map<string, string[]>();
  for (const id of spkIds) { const r = find(id); (branches.get(r) ?? branches.set(r, []).get(r)!).push(id); }
  if (branches.size < 2) return undefined; // single branch → simple accumulation is equivalent

  const dist = pathDistances(model, sourceId);
  const feedLen = new Map<string, number>(); // branch-line pipe length feeding each sprinkler ≈ spacing
  for (const p of pipes) if ((p.role ?? "branch-line") === "branch-line" && cov.has(p.to) && model.network.nodes.find((n) => n.id === p.to)?.type === "sprinkler") feedLen.set(p.to, (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0));

  const dimFt = 1.2 * Math.sqrt(designArea);
  const branchList = [...branches.values()].map((ids) => {
    const sorted = ids.slice().sort((a, b) => (dist.get(b) ?? 0) - (dist.get(a) ?? 0)); // most-remote first
    const sp = ids.map((id) => feedLen.get(id)).filter((v): v is number => typeof v === "number" && v > 0);
    const S = sp.length ? sp.reduce((s, v) => s + v, 0) / sp.length : 10;
    return { sorted, perBranch: Math.max(1, Math.ceil(dimFt / S)), remote: Math.max(...ids.map((id) => dist.get(id) ?? 0)) };
  }).sort((a, b) => b.remote - a.remote); // most-remote branch first

  const set = new Set<string>();
  let area = 0;
  for (const br of branchList) {
    for (let i = 0; i < br.perBranch && i < br.sorted.length && (area < designArea || set.size < minHeads); i++) { const id = br.sorted[i]!; set.add(id); area += cov.get(id) ?? 130; }
    if (area >= designArea && set.size >= minHeads) break;
  }
  return set.size > 0 && set.size >= minHeads ? set : undefined; // fall back if the EC 5-head minimum can't be met within branches
}

function autoPeakAreaSet(model: ProjectModel, sourceId: string): Set<string> | undefined {
  const designArea = (num(model.designBasis, "designAreaFt2") ?? 0) * designAreaFactor(model);
  if (!designArea) return undefined;
  // NFPA 13 §19.3.3.2.2.3: an extended-coverage design area is the hazard area OR
  // the area of 5 sprinklers, whichever is greater → at least 5 operating heads.
  const minHeads = (model.designBasis as Record<string, unknown> | undefined)?.["coverageType"] === "extended-coverage" ? 5 : 0;
  // Prefer the code-exact 1.2·√A branch-aware area when the topology is a clear
  // multi-branch tree; otherwise accumulate the most-remote heads by distance.
  const ba = branchAwareAreaSet(model, sourceId, designArea, minHeads);
  if (ba) return ba;
  const dist = pathDistances(model, sourceId);
  const spk = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0);
  if (spk.length === 0) return undefined;
  spk.sort((a, b) => (dist.get(b.id) ?? 0) - (dist.get(a.id) ?? 0));
  const set = new Set<string>();
  let area = 0;
  for (const n of spk) {
    set.add(n.id);
    area += n.coverageAreaFt2 ?? 130;
    if (area >= designArea && set.size >= minHeads) break;
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
    // NFPA 13 §27.2.3.1.1: fitting equivalent lengths are tabulated for Schedule-40
    // steel at C = 120; scale them to the pipe's actual C-factor (Table 27.2.3.1.2)
    // and actual internal diameter ((actual ID / Sch-40 ID)^4.87). Hazen-Williams,
    // imperial only — the metric/EN fitting table already carries C, and
    // Darcy-Weisbach uses the physical equivalent length.
    if (!dwMethod && std?.units !== "metric" && eq > 0) eq *= cValueMultiplier(cFactor) * equivalentLengthModifier(id, p.nominalSize ?? "1");
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
  return { nodes, links };
}

export function solveProject(model: ProjectModel, opts: SolveOptions = {}): ProjectSolution {
  const source = findSource(model);
  // Guard against a confident-looking solve on an unsolvable network: a phantom
  // source (no node with the source id — e.g. an empty project) or no pipes can
  // only produce misleading zeros. Throw so callers show a clear prompt instead.
  if (!model.network.nodes.some((n) => n.id === source.id) || model.network.pipes.length === 0) {
    throw new Error("Nothing to solve yet — add a source node, pipes and at least one sprinkler.");
  }
  const std = (() => {
    try {
      return getStandard((model.meta.standardId ?? "nfpa13") as StandardId);
    } catch {
      return undefined;
    }
  })();
  const { curve: derivedCurve, maxFlowGpm } = supplyCurveFor(model, source);
  const supply = opts.supply ?? derivedCurve;

  const sprinklers = model.network.nodes.filter((n) => n.type === "sprinkler" && typeof n.kFactor === "number" && n.kFactor > 0);
  // Design area: explicit operating-head count → most-remote N; else NFPA
  // area-density Auto-Peak (accumulate coverage to the design area); else all.
  // Explicit operating-head count → most-remote N. FM DS 8-9 / ESFR storage
  // (designBasis.method === "fm-storage") is exactly this: applyScheme writes
  // operatingSprinklers = N, so it flows through here; the only storage-specific
  // solver behaviour is the density-suppression guard below.
  const explicitCount = num(model.designBasis, "operatingSprinklers");
  const residentialCount = residentialDesignCount(model.meta.standardId);
  // NFPA 15 deluge / water-spray and NFPA 750 water mist: open nozzles, every
  // head in the zone discharges at once.
  const delugeMode = model.meta.fillType === "deluge" || model.meta.systemType === "deluge" || model.meta.systemType === "water-mist";
  // A locked design area (designBasis.designAreaNodeIds) pins the operating set —
  // e.g. an AHJ-directed area or a candidate chosen from the design-area proof.
  const lockedRaw = (model.designBasis as Record<string, unknown> | undefined)?.["designAreaNodeIds"];
  const spkIds = new Set(sprinklers.map((s) => s.id));
  const lockedArea = Array.isArray(lockedRaw) ? new Set((lockedRaw as unknown[]).filter((id): id is string => typeof id === "string" && spkIds.has(id))) : undefined;
  const usedLocked = lockedArea && lockedArea.size > 0 ? lockedArea : undefined;
  const open =
    opts.designArea ??
    usedLocked ??
    (delugeMode
      ? new Set(sprinklers.map((s) => s.id))
      : // residential (13D=2 / 13R=4) is standard-mandated → it wins over a stale
        // operatingSprinklers seed; otherwise an explicit count, else Auto-Peak.
        residentialCount !== undefined
        ? designAreaSet(model, source.id, residentialCount)
        : explicitCount !== undefined
          ? designAreaSet(model, source.id, explicitCount)
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
  // FM storage (count-at-pressure) governs by the scheme's minimum end-head
  // pressure, never by a density — so a leftover densityGpmFt2 must not inflate it.
  const fmStorage = (model.designBasis as Record<string, unknown> | undefined)?.["method"] === "fm-storage";
  if (!standpipeMode && density && !fmStorage) {
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

  // peak pipe velocity vs the configured limit (NFPA 13 guidance / spec default 20 ft/s)
  const velocityLimitFps = num(model.designBasis, "maxVelocityFps") ?? 20;
  let maxVelocityFps = 0;
  let maxVelocityPipe: string | undefined;
  for (const [id, r] of Object.entries(results.pipes)) if ((r.velocityFps ?? 0) > maxVelocityFps) { maxVelocityFps = r.velocityFps!; maxVelocityPipe = id; }

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
  const targetMarginPsi = num(model.designBasis, "targetMarginPsi");
  const meetsTargetMargin = targetMarginPsi !== undefined && targetMarginPsi > 0 ? marginPsi >= targetMarginPsi - 1e-6 : undefined;
  // NFPA 13: components must be rated for the system working pressure (≥ 175 psi).
  const componentRatingPsi = num(model.designBasis, "maxComponentPressurePsi") ?? 175;
  const areaAdj = areaAdjustments(model); // dry / sloped / QR design-area factors (§19.3.3.2.8)
  // Density actually delivered at the most remote sprinkler (discharge / coverage).
  const designDensityGpmFt2 = num(model.designBasis, "densityGpmFt2");
  const remoteCovFt2 = remote ? model.network.nodes.find((n) => n.id === remote.id)?.coverageAreaFt2 : undefined;
  const deliveredDensityGpmFt2 = remote && remoteCovFt2 ? Math.round((remote.flowGpm / remoteCovFt2) * 10000) / 10000 : undefined;

  // Stored-water requirement = total demand × supply duration, vs tank capacity.
  // Duration defaults by hazard (NFPA 13 Table 19.3.3.1.2) when not entered.
  const durationMin = num(model.designBasis, "durationMin") ?? defaultDurationMin(model);
  const requiredStoredGal = durationMin !== undefined ? Math.round(totalDemandGpm * durationMin) : undefined;
  const availableStoredGal = num(model.network.reservoir, "capacityGal");
  const storedWaterAdequate = requiredStoredGal !== undefined && availableStoredGal !== undefined ? availableStoredGal >= requiredStoredGal : undefined;

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
    ...(targetMarginPsi !== undefined && targetMarginPsi > 0 ? { targetMarginPsi } : {}),
    ...(meetsTargetMargin !== undefined ? { meetsTargetMargin } : {}),
    componentRatingPsi,
    withinComponentRating: sourceP <= componentRatingPsi + 1e-6,
    ...(remote ? { mostRemoteSprinkler: remote } : {}),
    operatingHeads: designNodeIds.length,
    ...(usedLocked && !opts.designArea ? { manualDesignArea: true } : {}),
    ...(num(model.designBasis, "designAreaFt2") !== undefined ? { designAreaFt2: Math.round(num(model.designBasis, "designAreaFt2")! * areaAdj.factor), designAreaDimFt: Math.round(1.2 * Math.sqrt(num(model.designBasis, "designAreaFt2")! * areaAdj.factor) * 10) / 10 } : {}),
    ...(num(model.designBasis, "designAreaFt2") !== undefined && areaAdj.dryPct ? { dryAreaIncreasePct: areaAdj.dryPct } : {}),
    ...(num(model.designBasis, "designAreaFt2") !== undefined && areaAdj.slopePct ? { slopeAreaIncreasePct: areaAdj.slopePct } : {}),
    ...(num(model.designBasis, "designAreaFt2") !== undefined && areaAdj.qrPct ? { qrAreaReductionPct: areaAdj.qrPct } : {}),
    ...(requiredHeadFlowGpm !== undefined ? { requiredHeadFlowGpm } : {}),
    ...(designDensityGpmFt2 !== undefined ? { designDensityGpmFt2 } : {}),
    ...(designDensityGpmFt2 !== undefined && deliveredDensityGpmFt2 !== undefined ? { deliveredDensityGpmFt2 } : {}),
    minSprinklerPressurePsi,
    meetsMinPressure: remote ? remote.pressurePsi >= minSprinklerPressurePsi - 0.5 : true,
    lowPressureNodes: designNodeIds
      .map((id) => ({ id, pressurePsi: gga.nodes[id]?.pressurePsi ?? 0 }))
      .filter((x) => x.pressurePsi < minSprinklerPressurePsi - 0.5)
      .sort((a, b) => a.pressurePsi - b.pressurePsi),
    maxJunctionImbalanceGpm: gga.maxImbalanceGpm,
    maxVelocityFps: Math.round(maxVelocityFps * 100) / 100,
    ...(maxVelocityPipe ? { maxVelocityPipe } : {}),
    velocityLimitFps,
    velocityOk: maxVelocityFps <= velocityLimitFps + 1e-6,
    supplyCurveSamples: sampleCurve(supply, maxFlowGpm, 24),
    ...(suctionCheck ? { suctionCheck } : {}),
    ...(requiredStoredGal !== undefined ? { requiredStoredGal, durationMin } : {}),
    ...(availableStoredGal !== undefined ? { availableStoredGal } : {}),
    ...(storedWaterAdequate !== undefined ? { storedWaterAdequate } : {}),
    converged: gga.converged,
  };

  return { results, summary, gga };
}
