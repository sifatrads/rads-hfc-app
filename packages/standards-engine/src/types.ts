/**
 * Pluggable standards layer. Each standard (NFPA 13/13R/13D, EN 12845, FM, ISO)
 * provides its data tables + rules behind one interface, selected by `StandardId`.
 * The calc engine stays standard-agnostic and reads parameters from the active module.
 */

export type StandardId = "nfpa13" | "nfpa13r" | "nfpa13d" | "en12845" | "fmds" | "iso";
export type Units = "imperial" | "metric";

export interface HazardClass {
  id: string;
  label: string;
}

export interface DesignDensityPoint {
  hazardClassId: string;
  /** Design density (gpm/ft² for imperial, mm/min for metric). */
  density: number;
  /** Design area of operation (ft² for imperial, m² for metric). */
  area: number;
}

export interface StandardModule {
  readonly id: StandardId;
  readonly name: string;
  readonly units: Units;

  /** Hazen-Williams C-factor for a pipe material id, or undefined if unknown. */
  cFactor(material: string): number | undefined;

  hazardClasses(): HazardClass[];
  designDensity(hazardClassId: string): DesignDensityPoint | undefined;

  /** Hose-stream allowance for a hazard class (gpm imperial / L·min⁻¹ metric). */
  hoseAllowance(hazardClassId: string): number | undefined;

  /** Minimum residual/operating pressure at any sprinkler (psi imperial / bar metric). */
  minResidualPressure(): number;

  /** Listed nominal K-factors for this standard's unit system. */
  standardKFactors(): number[];
}
