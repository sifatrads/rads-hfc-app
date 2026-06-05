/**
 * Pluggable standards layer. Each standard (NFPA 13/13R/13D, EN 12845, FM, ISO)
 * provides its data tables + rules behind one interface, selected by `StandardId`.
 * The calc engine stays standard-agnostic and reads parameters from the active module.
 */

export type StandardId = "nfpa13" | "nfpa13r" | "nfpa13d" | "nfpa14" | "nfpa750" | "en12845" | "fmds" | "as2118" | "iso";
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

/**
 * A storage "count-at-pressure" ceiling-protection scheme (FM DS 8-9 / ESFR):
 * a specific sprinkler operating a fixed number of design heads at a stated
 * minimum end-head pressure, plus fixed hose + duration — NOT density/area.
 */
export interface StorageScheme {
  id: string;
  label: string;
  /** suppression (ESFR/storage-mode) vs control (CMSA/CMDA). */
  mode: "suppression" | "control";
  kFactor: number;
  designSprinklers: number;
  minPressurePsi: number;
  hoseAllowanceGpm: number;
  durationMin: number;
  commodity?: string;
  maxStorageHeightFt?: number;
  maxCeilingHeightFt?: number;
  note?: string;
}

/** Design-basis values a storage scheme writes into the (imperial) design basis. */
export interface StorageDesignBasis {
  operatingSprinklers: number;
  minPressurePsi: number;
  kFactor: number;
  hoseAllowanceGpm: number;
  durationMin: number;
  method: "fm-storage";
  schemeLabel: string;
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

  // ── equivalent length / friction reference (optional; NFPA 13 §27.2.3) ──

  /** Hazen-Williams C value table (material id → C). */
  hazenWilliamsCValues?(): Record<string, number>;

  /** C-value multiplier for the equivalent-length table (Table 27.2.3.2.1). */
  cValueMultiplier?(cFactor: number): number;

  /** Schedule-40 internal diameter for a nominal size (in / mm). */
  schedule40IdIn?(nominalSize: string): number | undefined;

  /** Diameter modifier for non-Sch-40 ID (§27.2.3.1.3.1): (actual/sch40)^4.87. */
  equivalentLengthModifier?(actualIdIn: number, nominalSize: string): number;

  /** Equivalent pipe length (ft/m) for a fitting/valve at a nominal size (Table 27.2.3.1.1). */
  fittingEquivalentLength?(fitting: string, nominalSize: string, opts?: { cFactor?: number; actualIdIn?: number }): number | undefined;

  // ── storage "count-at-pressure" schemes (optional; FM DS 8-9 / ESFR) ──

  /** Storage ceiling-protection schemes (K + N design heads @ minimum pressure). */
  storageSchemes?(): StorageScheme[];

  /** Resolve a storage scheme id into an imperial design basis, or undefined. */
  designByScheme?(schemeId: string): StorageDesignBasis | undefined;
}
