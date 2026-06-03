import type { StandardId, StandardModule, StorageScheme, StorageDesignBasis } from "./types";
import { nfpa13 } from "./nfpa13";
import { nfpa13d } from "./nfpa13d";
import { nfpa13r } from "./nfpa13r";
import { nfpa14 } from "./nfpa14";
import { en12845 } from "./en12845";
import { fmGlobal } from "./fmglobal";

export * from "./types";
export * from "./tables-nfpa13";
export * from "./materials";
export { nfpa13, nfpa13d, nfpa13r, nfpa14, en12845, fmGlobal };

const REGISTRY: Partial<Record<StandardId, StandardModule>> = {
  nfpa13,
  nfpa13d,
  nfpa13r,
  nfpa14,
  en12845,
  fmds: fmGlobal,
  // iso — scaffolded next
};

/** Get an implemented standard module, or throw if not yet available. */
export function getStandard(id: StandardId): StandardModule {
  const mod = REGISTRY[id];
  if (!mod) throw new Error(`Standard '${id}' is not implemented yet.`);
  return mod;
}

/** Standards currently implemented (have data + rules). */
export function availableStandards(): StandardId[] {
  return Object.keys(REGISTRY) as StandardId[];
}

/** Hazard classes offered by a standard (empty if the standard isn't implemented). */
export function hazardClassesFor(standardId: string): { id: string; label: string }[] {
  try { return getStandard(standardId as StandardId).hazardClasses(); } catch { return []; }
}

/** True if the standard's native units are metric (EN 12845). */
export function standardIsMetric(standardId: string): boolean {
  try { return getStandard(standardId as StandardId).units === "metric"; } catch { return false; }
}

/** Storage count-at-pressure schemes a standard offers (empty if none / not implemented). */
export function storageSchemesFor(standardId: string): StorageScheme[] {
  try { return getStandard(standardId as StandardId).storageSchemes?.() ?? []; } catch { return []; }
}

/** Imperial design basis for a storage scheme id, or undefined. */
export function designBasisForScheme(standardId: string, schemeId: string): StorageDesignBasis | undefined {
  try { return getStandard(standardId as StandardId).designByScheme?.(schemeId); } catch { return undefined; }
}

/**
 * Design-basis values (imperial — the solver works in psi/gpm/ft) derived from a
 * standard + hazard class. Metric standards (EN 12845) are converted from
 * mm/min over m² + bar. Returns undefined when the standard has no density table
 * for that class (e.g. NFPA 14 standpipe, residential).
 */
export function designBasisForHazard(standardId: string, hazardClassId: string): { densityGpmFt2: number; designAreaFt2: number; minPressurePsi: number; hoseAllowanceGpm: number } | undefined {
  let std: StandardModule;
  try { std = getStandard(standardId as StandardId); } catch { return undefined; }
  const d = std.designDensity(hazardClassId);
  if (!d) return undefined;
  const round = (v: number, p: number) => Math.round(v * 10 ** p) / 10 ** p;
  if (std.units === "metric") {
    return {
      densityGpmFt2: round(d.density * 0.024543, 4), // mm/min (= L/min/m²) → gpm/ft²
      designAreaFt2: Math.round(d.area * 10.7639), // m² → ft²
      minPressurePsi: round(std.minResidualPressure() * 14.5038, 1), // bar → psi
      hoseAllowanceGpm: Math.round((std.hoseAllowance(hazardClassId) ?? 0) * 0.264172), // L/min → gpm
    };
  }
  return { densityGpmFt2: d.density, designAreaFt2: d.area, minPressurePsi: std.minResidualPressure(), hoseAllowanceGpm: std.hoseAllowance(hazardClassId) ?? 0 };
}
