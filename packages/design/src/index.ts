/**
 * End-to-end density/area design runner — ties the standards layer, the
 * hydraulic solver, and the water-supply analysis into one NFPA-style calc.
 *
 * This first version covers a SINGLE branch-line remote area (the common
 * textbook hand-calc). Multi-branch remote areas solved via the GGA nodal
 * solver come in a later phase.
 *
 * Flow:
 *   density/area (from the standard) → most-remote sprinkler min flow & pressure
 *   → branch-line solve (flows + required pressure at the cross-main connection)
 *   → optional feed main → required source pressure
 *   → + hose allowance = total demand
 *   → optional demand-vs-supply margin check.
 */
import {
  solveBranchLine,
  hazenWilliamsLossPsi,
  elevationHeadPsi,
  checkSupplyMargin,
  type BranchSprinkler,
  type PipeSegment,
  type SupplyCurve,
  type MarginOptions,
  type MarginResult,
} from "@rads/calc-engine";
import { getStandard, type StandardId, type Units } from "@rads/standards-engine";

export interface DesignSprinklerInput {
  id: string;
  kFactor: number;
  /** Floor area this sprinkler covers (ft²) — used for the density requirement. */
  coverageAreaFt2: number;
  /** Pipe from this sprinkler toward the source / next node. */
  segment: PipeSegment;
}

export interface DesignInput {
  standardId: StandardId;
  hazardClassId: string;
  /** Operating sprinklers in the remote design area, MOST REMOTE first. */
  sprinklers: DesignSprinklerInput[];
  /** Optional feed main carrying total flow from the branch connection to the source. */
  feedMain?: PipeSegment;
  /** Optional supply curve for the demand-vs-supply check. */
  supply?: SupplyCurve;
  marginOptions?: MarginOptions;
}

export interface DesignSprinklerResult {
  id: string;
  pressurePsi: number;
  flowGpm: number;
  coverageAreaFt2: number;
  densityGpmFt2: number;
  meetsDensity: boolean;
}

export interface DesignResult {
  standardId: StandardId;
  hazardClassId: string;
  units: Units;
  designDensityGpmFt2: number;
  designAreaFt2: number;
  sprinklerCount: number;
  remoteSprinklerMinPressurePsi: number;
  systemFlowGpm: number;
  requiredSourcePressurePsi: number;
  hoseAllowanceGpm: number;
  totalDemandGpm: number;
  sprinklers: DesignSprinklerResult[];
  minDensityAchievedGpmFt2: number;
  meetsDensity: boolean;
  supply?: MarginResult;
  passes: boolean;
}

const DENSITY_EPS = 1e-6;

export function runDesign(input: DesignInput): DesignResult {
  const std = getStandard(input.standardId);
  const dd = std.designDensity(input.hazardClassId);
  if (!dd) {
    throw new Error(`Standard '${input.standardId}' has no design density for hazard class '${input.hazardClassId}'.`);
  }
  const remote = input.sprinklers[0];
  if (!remote) throw new Error("Design area has no sprinklers.");

  const density = dd.density; // gpm/ft² for imperial standards

  // The most-remote sprinkler must discharge at least density × its coverage.
  const remoteMinFlow = density * remote.coverageAreaFt2;
  const remoteMinPressure = (remoteMinFlow / remote.kFactor) ** 2;

  const branchSprinklers: BranchSprinkler[] = input.sprinklers.map((s) => ({
    id: s.id,
    kFactor: s.kFactor,
    segment: s.segment,
  }));
  const branch = solveBranchLine(branchSprinklers, remoteMinPressure);

  const sprinklers: DesignSprinklerResult[] = branch.rows.map((row, i) => {
    const coverage = input.sprinklers[i]!.coverageAreaFt2;
    const achieved = row.sprinklerFlowGpm / coverage;
    return {
      id: row.id,
      pressurePsi: row.pressurePsi,
      flowGpm: row.sprinklerFlowGpm,
      coverageAreaFt2: coverage,
      densityGpmFt2: achieved,
      meetsDensity: achieved >= density - DENSITY_EPS,
    };
  });

  const systemFlow = branch.totalFlowGpm;

  let requiredSource = branch.pressureAtSourceConnectionPsi;
  if (input.feedMain) {
    const fm = input.feedMain;
    const length = fm.lengthFt + (fm.equivalentLengthFt ?? 0);
    requiredSource += hazenWilliamsLossPsi(systemFlow, fm.cFactor, fm.internalDiameterIn, length);
    requiredSource += elevationHeadPsi(fm.elevationChangeFt ?? 0);
  }

  const hose = std.hoseAllowance(input.hazardClassId) ?? 0;
  const totalDemand = systemFlow + hose;

  const minDensity = sprinklers.reduce((m, s) => Math.min(m, s.densityGpmFt2), Number.POSITIVE_INFINITY);
  const meetsDensity = sprinklers.every((s) => s.meetsDensity);

  const supply = input.supply
    ? checkSupplyMargin(input.supply, totalDemand, requiredSource, input.marginOptions)
    : undefined;

  return {
    standardId: input.standardId,
    hazardClassId: input.hazardClassId,
    units: std.units,
    designDensityGpmFt2: density,
    designAreaFt2: dd.area,
    sprinklerCount: input.sprinklers.length,
    remoteSprinklerMinPressurePsi: remoteMinPressure,
    systemFlowGpm: systemFlow,
    requiredSourcePressurePsi: requiredSource,
    hoseAllowanceGpm: hose,
    totalDemandGpm: totalDemand,
    sprinklers,
    minDensityAchievedGpmFt2: minDensity,
    meetsDensity,
    ...(supply ? { supply } : {}),
    passes: meetsDensity && (supply ? supply.passes : true),
  };
}
