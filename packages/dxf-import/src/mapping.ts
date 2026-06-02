/**
 * Import mapping — every option the user can set when importing a DXF (the
 * "selectable mapping" requirement). `defaultMapping` pre-fills it from the
 * analysis so a clean Canute/AutoCAD export imports with no manual setup, but
 * every field is overridable in the import UI.
 */
import type { DxfAnalysis, LayerRole } from "./analyze";

export type SourceUnit = "mm" | "cm" | "m" | "in" | "ft";

export const UNIT_TO_FT: Record<SourceUnit, number> = {
  mm: 0.0032808399,
  cm: 0.032808399,
  m: 3.2808399,
  in: 0.0833333333,
  ft: 1,
};

export interface ImportMapping {
  sourceUnit: SourceUnit;
  /** Role chosen per layer (defaults from analysis; user-overridable). */
  layerRoles: Record<string, LayerRole>;
  /** Endpoint snap tolerance, in SOURCE units. */
  snapToleranceSource: number;
  /** How to obtain each pipe's nominal size. */
  sizeSource: "nearest-text" | "constant";
  defaultNominalSizeMm: number;
  /** Search radius (source units) for size / node-id / coverage text near geometry. */
  sizeTextMaxDistSource: number;
  nodeIdTextMaxDistSource: number;
  coverageTextMaxDistSource: number;
  // calc defaults the user selects at import
  defaultKFactor: number;
  defaultCFactor: number;
  defaultMaterial: string;
  systemType: "sprinkler" | "standpipe";
  standardId: string;
  displayUnits: "imperial" | "metric";
  projectId: string;
  projectName: string;
}

/** Guess the source unit from $INSUNITS, else from the drawing extent. */
export function guessSourceUnit(analysis: DxfAnalysis): SourceUnit {
  const byInsunit: Record<number, SourceUnit> = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };
  if (byInsunit[analysis.insunits]) return byInsunit[analysis.insunits]!;
  const span = Math.max(
    analysis.bbox.max[0] - analysis.bbox.min[0],
    analysis.bbox.max[1] - analysis.bbox.min[1],
    analysis.bbox.max[2] - analysis.bbox.min[2],
  );
  if (span > 3000) return "mm"; // tens of thousands → millimetres
  if (span > 200) return "in";
  return "m";
}

export function defaultMapping(analysis: DxfAnalysis, opts: Partial<ImportMapping> = {}): ImportMapping {
  const layerRoles: Record<string, LayerRole> = {};
  for (const l of analysis.layers) layerRoles[l.name] = l.guessedRole;
  const unit = opts.sourceUnit ?? guessSourceUnit(analysis);
  // tolerances scale with unit (mm vs ft)
  const tol = unit === "mm" ? 5 : unit === "cm" ? 0.5 : unit === "m" ? 0.02 : unit === "in" ? 0.25 : 0.02;
  const near = unit === "mm" ? 900 : unit === "cm" ? 90 : unit === "m" ? 0.9 : 36;
  return {
    sourceUnit: unit,
    layerRoles: opts.layerRoles ?? layerRoles,
    snapToleranceSource: opts.snapToleranceSource ?? tol,
    sizeSource: opts.sizeSource ?? "nearest-text",
    defaultNominalSizeMm: opts.defaultNominalSizeMm ?? 25,
    sizeTextMaxDistSource: opts.sizeTextMaxDistSource ?? near,
    nodeIdTextMaxDistSource: opts.nodeIdTextMaxDistSource ?? near,
    coverageTextMaxDistSource: opts.coverageTextMaxDistSource ?? near * 2,
    defaultKFactor: opts.defaultKFactor ?? 5.6,
    defaultCFactor: opts.defaultCFactor ?? 120,
    defaultMaterial: opts.defaultMaterial ?? "black-steel-wet",
    systemType: opts.systemType ?? "sprinkler",
    standardId: opts.standardId ?? "nfpa13",
    displayUnits: opts.displayUnits ?? (unit === "mm" || unit === "cm" || unit === "m" ? "metric" : "imperial"),
    projectId: opts.projectId ?? "DXF-IMPORT",
    projectName: opts.projectName ?? "Imported DXF",
  };
}
