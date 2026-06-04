/**
 * Fluid kinematic viscosity for Darcy-Weisbach friction — water and antifreeze
 * (propylene- / ethylene-glycol) solutions vary strongly with temperature and
 * concentration, which materially changes pipe friction in cold-climate / dry
 * systems. Returns kinematic viscosity in cSt (mm²/s); the solver converts to
 * ft²/s (1 cSt = 1.07639e-5 ft²/s).
 *
 * ⚠ Representative data — AUDIT against the antifreeze manufacturer's data sheet
 * (viscosity tables differ by product, inhibitor package and edition) before
 * production use. Values are bilinearly interpolated over the grids below and
 * clamped outside them.
 */
export type FluidType = "water" | "propylene-glycol" | "ethylene-glycol";

// Grid columns: temperature °F (≈ 0, 20, 40 °C). Rows: concentration % by volume.
const TEMPS_F = [32, 68, 104];
// Kinematic viscosity (cSt). Row 0% = water; higher rows = glycol solutions.
const PG_CST: Record<number, number[]> = {
  0: [1.79, 1.0, 0.66],
  20: [3.5, 1.9, 1.2],
  30: [6.0, 2.8, 1.7],
  40: [11.0, 4.3, 2.5],
  50: [22.0, 6.5, 3.6],
};
const EG_CST: Record<number, number[]> = {
  0: [1.79, 1.0, 0.66],
  20: [2.6, 1.5, 1.0],
  30: [3.8, 2.0, 1.3],
  40: [5.5, 2.8, 1.7],
  50: [8.5, 3.8, 2.2],
};
const CONCS = [0, 20, 30, 40, 50];

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }

/** Interpolate a row's viscosity at a temperature (°F), clamped to the grid. */
function atTemp(row: number[], tempF: number): number {
  if (tempF <= TEMPS_F[0]!) return row[0]!;
  if (tempF >= TEMPS_F[TEMPS_F.length - 1]!) return row[row.length - 1]!;
  for (let i = 0; i < TEMPS_F.length - 1; i++) {
    const lo = TEMPS_F[i]!, hi = TEMPS_F[i + 1]!;
    if (tempF >= lo && tempF <= hi) return lerp(row[i]!, row[i + 1]!, (tempF - lo) / (hi - lo));
  }
  return row[row.length - 1]!;
}

/** Kinematic viscosity (cSt) for a fluid at a temperature (°F) and concentration (% vol). */
export function fluidViscosityCst(type: FluidType, tempF: number, concPct = 0): number {
  const table = type === "ethylene-glycol" ? EG_CST : PG_CST;
  const conc = Math.max(0, Math.min(50, concPct));
  if (type === "water" || conc <= 0) return round(atTemp(PG_CST[0]!, tempF));
  // bilinear: interpolate viscosity-at-temp for the two bracketing concentrations
  let lo = 0, hi = 0;
  for (let i = 0; i < CONCS.length - 1; i++) {
    if (conc >= CONCS[i]! && conc <= CONCS[i + 1]!) { lo = CONCS[i]!; hi = CONCS[i + 1]!; break; }
  }
  const vLo = atTemp(table[lo]!, tempF);
  const vHi = atTemp(table[hi]!, tempF);
  return round(hi === lo ? vLo : lerp(vLo, vHi, (conc - lo) / (hi - lo)));
}

function round(v: number): number { return Math.round(v * 100) / 100; }
