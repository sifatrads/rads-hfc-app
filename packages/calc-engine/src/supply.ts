/**
 * Water-supply analysis (US customary: gpm / psi).
 *
 * A supply is modeled as a curve  P_available(Q) — the pressure the source can
 * deliver at flow Q. A system is adequate when its demand point (total demand
 * flow at the required source pressure) falls on or below the supply curve, with
 * the required safety margin.
 *
 * Sources:
 *   - city flow test:  P(Q) = Ps − (Ps − Pr)·(Q/Qt)^1.85   (Hazen-Williams drop)
 *   - fire pump:       head added vs flow (churn / rated / overload, NFPA 20)
 *   - tank / constant: flat available pressure
 */

/** A supply curve: available pressure (psi) as a function of flow (gpm). */
export type SupplyCurve = (flowGpm: number) => number;

export interface FlowTest {
  /** Static pressure, no flow (psi). */
  staticPsi: number;
  /** Residual pressure at the test flow (psi). */
  residualPsi: number;
  /** Test flow (gpm). */
  testFlowGpm: number;
}

const SUPPLY_EXP = 1.85;

/** City supply available pressure at a given flow, from a 2-point flow test. */
export function cityAvailablePsi(test: FlowTest, flowGpm: number): number {
  if (flowGpm <= 0) return test.staticPsi;
  const drop = (test.staticPsi - test.residualPsi) * Math.pow(flowGpm / test.testFlowGpm, SUPPLY_EXP);
  return test.staticPsi - drop;
}

/** Flow the city supply can deliver at a target residual pressure (inverse of the curve). */
export function cityFlowAtPsi(test: FlowTest, targetPsi: number): number {
  if (targetPsi >= test.staticPsi) return 0;
  const ratio = (test.staticPsi - targetPsi) / (test.staticPsi - test.residualPsi);
  return test.testFlowGpm * Math.pow(ratio, 1 / SUPPLY_EXP);
}

/** City supply as a reusable curve. */
export function cityCurve(test: FlowTest): SupplyCurve {
  return (q) => cityAvailablePsi(test, q);
}

/** Constant-pressure / tank supply. */
export function constantPressureCurve(psi: number): SupplyCurve {
  return () => psi;
}

export interface PumpCurve {
  /** Shut-off / churn pressure at zero flow (psi). */
  churnPsi: number;
  ratedFlowGpm: number;
  ratedPsi: number;
  /** Overload point (typically 150% rated flow). Optional. */
  overloadFlowGpm?: number;
  overloadPsi?: number;
}

/** Pump head added at a given flow (piecewise-linear through churn / rated / overload). */
export function pumpHeadPsi(pump: PumpCurve, flowGpm: number): number {
  const points: Array<{ x: number; y: number }> = [
    { x: 0, y: pump.churnPsi },
    { x: pump.ratedFlowGpm, y: pump.ratedPsi },
  ];
  if (pump.overloadFlowGpm !== undefined && pump.overloadPsi !== undefined) {
    points.push({ x: pump.overloadFlowGpm, y: pump.overloadPsi });
  }
  return Math.max(0, interpLinear(points, flowGpm));
}

/** A pump boosting a suction supply: P(Q) = suction(Q) + pumpHead(Q). */
export function pumpOnSuction(suction: SupplyCurve, pump: PumpCurve): SupplyCurve {
  return (q) => suction(q) + pumpHeadPsi(pump, q);
}

export interface MarginOptions {
  /** Minimum acceptable margin in psi (default 0). */
  minMarginPsi?: number;
  /** Minimum acceptable margin as a fraction of required pressure (e.g. 0.10). Default 0. */
  minMarginFraction?: number;
}

export interface MarginResult {
  demandGpm: number;
  requiredPsi: number;
  availablePsi: number;
  marginPsi: number;
  marginPercent: number;
  passes: boolean;
}

/**
 * Check a system demand point (total demand flow + required source pressure,
 * hose allowance already included) against a supply curve.
 */
export function checkSupplyMargin(
  supply: SupplyCurve,
  demandGpm: number,
  requiredPsi: number,
  opts: MarginOptions = {},
): MarginResult {
  const availablePsi = supply(demandGpm);
  const marginPsi = availablePsi - requiredPsi;
  const marginPercent = requiredPsi > 0 ? (marginPsi / requiredPsi) * 100 : 0;
  const needPsi = Math.max(opts.minMarginPsi ?? 0, (opts.minMarginFraction ?? 0) * requiredPsi);
  return {
    demandGpm,
    requiredPsi,
    availablePsi,
    marginPsi,
    marginPercent,
    passes: marginPsi >= needPsi,
  };
}

export interface CurvePoint {
  flowGpm: number;
  pressurePsi: number;
}

/** Sample a supply curve for plotting (0 → maxFlowGpm). */
export function sampleCurve(supply: SupplyCurve, maxFlowGpm: number, points = 25): CurvePoint[] {
  const out: CurvePoint[] = [];
  const n = Math.max(2, points);
  for (let i = 0; i < n; i++) {
    const q = (maxFlowGpm * i) / (n - 1);
    out.push({ flowGpm: q, pressurePsi: supply(q) });
  }
  return out;
}

// ── internal ──────────────────────────────────────────────────────────────

function interpLinear(points: Array<{ x: number; y: number }>, x: number): number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (!first) return 0;
  if (!last || pts.length === 1) return first.y;

  if (x <= first.x) {
    const b = pts[1]!;
    return lineAt(first, b, x);
  }
  if (x >= last.x) {
    const a = pts[pts.length - 2]!;
    return lineAt(a, last, x);
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    if (x >= a.x && x <= b.x) return lineAt(a, b, x);
  }
  return last.y;
}

function lineAt(a: { x: number; y: number }, b: { x: number; y: number }, x: number): number {
  if (b.x === a.x) return a.y;
  return a.y + ((b.y - a.y) / (b.x - a.x)) * (x - a.x);
}
