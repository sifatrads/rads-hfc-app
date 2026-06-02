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
import { hazenWilliamsLossPsi, kFactorFlowGpm, velocityFps, elevationHeadPsi } from "./hydraulics";

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
  segmentLossPsi: number;
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
    const totalLengthFt = seg.lengthFt + (seg.equivalentLengthFt ?? 0);
    const friction = hazenWilliamsLossPsi(cumulative, seg.cFactor, seg.internalDiameterIn, totalLengthFt);
    const elevation = elevationHeadPsi(seg.elevationChangeFt ?? 0);
    const segmentLoss = friction + elevation;
    const nextPressure = pressure + segmentLoss;

    rows.push({
      id: spk.id,
      pressurePsi: pressure,
      sprinklerFlowGpm: flow,
      cumulativeFlowGpm: cumulative,
      velocityFps: velocityFps(cumulative, seg.internalDiameterIn),
      segmentLossPsi: segmentLoss,
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
