/**
 * Branch-line solver — the standard NFPA "tip-to-source" hand-calculation method.
 *
 * Walk from the MOST REMOTE sprinkler (set to its minimum design pressure),
 * accumulating sprinkler flows toward the source. At each sprinkler:
 *   flow      = K·√(pressure here)
 *   cumulative+= flow
 *   segment   loss = Hazen-Williams(cumulative) + elevation head
 *   pressure at next node = pressure here + loss
 *
 * This is exact for a branch (no loops) and is the validation oracle for the
 * general nodal (GGA) solver added later.
 */
import { hazenWilliamsLossPsi, hazenWilliamsPsiPerFoot, kFactorFlowGpm, velocityFps, velocityPressurePsi, normalPressurePsi, elevationHeadPsi } from "./hydraulics";

export interface PipeSegment {
  cFactor: number;
  internalDiameterIn: number;
  lengthFt: number;
  /** Equivalent length of fittings on this segment, ft. */
  equivalentLengthFt?: number;
  /** Elevation rise from this node to the next (positive = upward), ft. */
  elevationChangeFt?: number;
}

export interface BranchSprinkler {
  id: string;
  kFactor: number;
  /** Pipe segment from this sprinkler toward the source / next node. */
  segment: PipeSegment;
  /** Minimum required pressure (used only for the most-remote sprinkler to seed the walk). */
  minPressurePsi?: number;
}

export interface BranchResultRow {
  id: string;
  pressurePsi: number;
  sprinklerFlowGpm: number;
  cumulativeFlowGpm: number;
  velocityFps: number;
  /** Velocity pressure P_v at this point (NFPA 13 §27.2.2.2). */
  velocityPressurePsi: number;
  /** Normal pressure P_n = P_t − P_v (NFPA 13 §27.2.2.3). */
  normalPressurePsi: number;
  /** friction + elevation for the segment to the next node. */
  segmentLossPsi: number;
  frictionLossPsi: number;
  elevationLossPsi: number;
  /** Friction loss per foot, psi/ft (Worksheet item 14). */
  frictionPsiPerFt: number;
  /** Fitting equivalent length on the segment, ft (Worksheet item 9). */
  equivalentLengthFt: number;
  /** Pipe length + equivalent length, ft (Worksheet item 12). */
  totalLengthFt: number;
  pressureAtNextNodePsi: number;
}

export interface BranchResult {
  rows: BranchResultRow[];
  totalFlowGpm: number;
  pressureAtSourceConnectionPsi: number;
}

/**
 * Solve one branch line. `sprinklers[0]` is the most remote head; the final
 * segment connects to the source/cross-main. `startPressurePsi` overrides the
 * seed pressure (otherwise the most-remote sprinkler's `minPressurePsi`, or 7 psi).
 */
export function solveBranchLine(sprinklers: BranchSprinkler[], startPressurePsi?: number): BranchResult {
  const first = sprinklers[0];
  if (!first) throw new Error("Branch line has no sprinklers.");

  const rows: BranchResultRow[] = [];
  let nodePressure = startPressurePsi ?? first.minPressurePsi ?? 7;
  let cumulative = 0;

  for (const spk of sprinklers) {
    const pressure = nodePressure;
    const flow = kFactorFlowGpm(spk.kFactor, pressure);
    cumulative += flow;

    const seg = spk.segment;
    const equivalentLengthFt = seg.equivalentLengthFt ?? 0;
    const totalLengthFt = seg.lengthFt + equivalentLengthFt;
    const frictionPsiPerFt = hazenWilliamsPsiPerFoot(cumulative, seg.cFactor, seg.internalDiameterIn);
    const friction = hazenWilliamsLossPsi(cumulative, seg.cFactor, seg.internalDiameterIn, totalLengthFt);
    const elevation = elevationHeadPsi(seg.elevationChangeFt ?? 0);
    const segmentLoss = friction + elevation;
    const nextPressure = pressure + segmentLoss;
    const pv = velocityPressurePsi(cumulative, seg.internalDiameterIn);

    rows.push({
      id: spk.id,
      pressurePsi: pressure,
      sprinklerFlowGpm: flow,
      cumulativeFlowGpm: cumulative,
      velocityFps: velocityFps(cumulative, seg.internalDiameterIn),
      velocityPressurePsi: pv,
      normalPressurePsi: normalPressurePsi(pressure, pv),
      segmentLossPsi: segmentLoss,
      frictionLossPsi: friction,
      elevationLossPsi: elevation,
      frictionPsiPerFt,
      equivalentLengthFt,
      totalLengthFt,
      pressureAtNextNodePsi: nextPressure,
    });

    nodePressure = nextPressure;
  }

  return {
    rows,
    totalFlowGpm: cumulative,
    pressureAtSourceConnectionPsi: nodePressure,
  };
}
