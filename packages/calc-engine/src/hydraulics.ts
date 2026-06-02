/**
 * Core hydraulic primitives (US customary units), per NFPA 13 methodology.
 *
 * Units: flow in gpm, pressure in psi, diameter in inches, length in feet.
 * Metric variants will be added alongside (mm / L·min⁻¹ / bar) in a later phase.
 *
 * Sources: NFPA 13 hydraulic calculation procedure; Hazen-Williams friction loss.
 */

/**
 * Hazen-Williams frictional resistance, psi per FOOT of pipe (NFPA 13 §27.2.2.1.1):
 *   p = 4.52 · Q^1.85 / (C^1.85 · d^4.87)     [p in psi/ft]
 */
export function hazenWilliamsPsiPerFoot(flowGpm: number, cFactor: number, internalDiameterIn: number): number {
  if (flowGpm <= 0) return 0;
  return (4.52 * Math.pow(flowGpm, 1.85)) / (Math.pow(cFactor, 1.85) * Math.pow(internalDiameterIn, 4.87));
}

/** Total Hazen-Williams friction loss over a pipe length, psi (= p · L, length in feet). */
export function hazenWilliamsLossPsi(
  flowGpm: number,
  cFactor: number,
  internalDiameterIn: number,
  lengthFt: number,
): number {
  return hazenWilliamsPsiPerFoot(flowGpm, cFactor, internalDiameterIn) * lengthFt;
}

/** Sprinkler / orifice discharge: Q = K·√P. */
export function kFactorFlowGpm(kFactor: number, pressurePsi: number): number {
  if (pressurePsi <= 0) return 0;
  return kFactor * Math.sqrt(pressurePsi);
}

/** Inverse of the K-factor relation: P = (Q / K)². */
export function pressureFromFlowPsi(kFactor: number, flowGpm: number): number {
  const ratio = flowGpm / kFactor;
  return ratio * ratio;
}

/** Water velocity in a circular pipe, ft/s:  V = 0.4085 · Q / d². */
export function velocityFps(flowGpm: number, internalDiameterIn: number): number {
  return (0.4085 * flowGpm) / (internalDiameterIn * internalDiameterIn);
}

/** Velocity pressure, psi (NFPA 13 §27.2.2.2):  P_v = 0.001123 · Q² / d⁴. */
export function velocityPressurePsi(flowGpm: number, internalDiameterIn: number): number {
  if (flowGpm <= 0) return 0;
  return (0.001123 * flowGpm * flowGpm) / Math.pow(internalDiameterIn, 4);
}

/** Normal pressure, psi (NFPA 13 §27.2.2.3):  P_n = P_t − P_v. */
export function normalPressurePsi(totalPressurePsi: number, velocityPressureValuePsi: number): number {
  return totalPressurePsi - velocityPressureValuePsi;
}

/**
 * Elevation / static head, psi, for a water column of `deltaElevationFt`.
 *   ΔP = 0.433 psi/ft · h
 * Positive Δelevation (rising) returns a positive pressure demand to overcome.
 */
export function elevationHeadPsi(deltaElevationFt: number): number {
  return 0.433 * deltaElevationFt;
}
