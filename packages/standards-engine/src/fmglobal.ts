/**
 * FM Global — Property Loss Prevention Data Sheets (sprinkler protection).
 * Covers (a) the NON-STORAGE occupancy hazard categories HC-1/2/3 (DS 3-26) as
 * density/area schemes, and (b) STORAGE ceiling protection (DS 8-9) as
 * "count-at-pressure" schemes — a specific sprinkler operating a fixed number of
 * design heads (ESFR almost always 12) at a stated minimum end-head pressure,
 * plus fixed hose + duration. Both map onto the existing solver (density/area and
 * the N-most-remote-at-min-pressure binary search respectively).
 *
 * Non-storage HC-1/2/3 demands are taken from FM DS 3-26 Table 2.3.1.10 (the
 * wet / ≤30 ft ceiling base case). The STORAGE (DS 8-9) ESFR/CMSA scheme table
 * below is still ⚠ REPRESENTATIVE — confirm each per-cell K/count/pressure
 * against the current DS 8-9 for the specific commodity/arrangement/height/
 * edition before issuing a design, and never mix FM with NFPA 13 criteria.
 */
import type { StandardModule, HazardClass, DesignDensityPoint, StorageScheme, StorageDesignBasis } from "./types";
import { fittingEquivalentLengthFt } from "./tables-nfpa13";

const HAZARDS: HazardClass[] = [
  { id: "hc-1", label: "Hazard Category 1 (HC-1)" },
  { id: "hc-2", label: "Hazard Category 2 (HC-2)" },
  { id: "hc-3", label: "Hazard Category 3 (HC-3)" },
];

// Density (gpm/ft²) over area of operation (ft²) — FM DS 3-26 Table 2.3.1.10,
// wet system at a maximum ceiling height of 30 ft (9 m) [the most common base
// case]. NOTE: the full table also gives higher demand areas for dry systems and
// taller ceilings (45/60/100 ft) — those variants are not yet selectable here.
const DENSITY: Record<string, DesignDensityPoint> = {
  "hc-1": { hazardClassId: "hc-1", density: 0.1, area: 1500 }, // 4 mm/min / 140 m²
  "hc-2": { hazardClassId: "hc-2", density: 0.2, area: 2500 }, // 8 mm/min / 230 m²
  "hc-3": { hazardClassId: "hc-3", density: 0.3, area: 2500 }, // 12 mm/min / 230 m²
};

// Hose-stream demand (gpm) — DS 3-26 §2.3.1.12 (250 HC-1/HC-2, 500 HC-3); supply
// for 60 min (§2.3.1.13); minimum 7 psi (0.5 bar) at the most remote sprinkler
// (§2.3.1.11).
const HOSE: Record<string, number> = { "hc-1": 250, "hc-2": 250, "hc-3": 500 };

// ── FM DS 8-9 ceiling storage protection — count-at-pressure schemes ──
// Hose demand + supply duration are GROUNDED to DS 8-9 Table 14 (by ceiling-
// sprinkler count, NOT by suppression/control mode): ≤12 heads → 250 gpm; 13–19
// → 500 gpm (60–90 min); 20+ → 500 gpm (120 min). Grounded protection cells:
// K16.8 → 12 @ 63 psi and K14.0 → 12 @ 90 psi, both at a 40 ft ceiling for
// uncartoned plastic (DS 8-9, Jul-2024). The per-cell K/N/pressure in the rest of
// the table are ⚠ REPRESENTATIVE — DS 8-9's protection tables are dense grids that
// don't extract cleanly; replace each with the exact current DS 8-9 cell for the
// specific commodity/arrangement/storage+ceiling height before issuing a design,
// and never mix FM with NFPA 13 criteria. K16.8 is the minimum ceiling K for
// storage; K14 is legacy (12 @ 90 psi @ 40 ft → now "DNA" at 45 ft per recent
// revisions). >50 ft ceilings may need >12 heads — out of v1 scope.
const STORAGE_SCHEMES: StorageScheme[] = [
  { id: "esfr-k14-12-50", label: "ESFR K14.0 — 12 @ 50 psi (legacy ≤30 ft)", mode: "suppression", kFactor: 14.0, designSprinklers: 12, minPressurePsi: 50, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 25, maxCeilingHeightFt: 30, note: "AUDIT: K14 phased out >30 ft / exposed plastics; retrofit only." },
  { id: "esfr-k16.8-12-35", label: "ESFR K16.8 — 12 @ 35 psi (≤30 ft ceiling)", mode: "suppression", kFactor: 16.8, designSprinklers: 12, minPressurePsi: 35, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 25, maxCeilingHeightFt: 30, note: "Most-installed low-ceiling ESFR." },
  { id: "esfr-k16.8-12-52", label: "ESFR K16.8 — 12 @ 52 psi (35–40 ft ceiling)", mode: "suppression", kFactor: 16.8, designSprinklers: 12, minPressurePsi: 52, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 35, maxCeilingHeightFt: 40, note: "AUDIT: per-cell value." },
  { id: "esfr-k16.8-12-63", label: "ESFR K16.8 — 12 @ 63 psi (45 ft ceiling)", mode: "suppression", kFactor: 16.8, designSprinklers: 12, minPressurePsi: 63, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 40, maxCeilingHeightFt: 45, note: "AUDIT: per-cell value." },
  { id: "esfr-k22.4-12-40", label: "ESFR K22.4 — 12 @ 40 psi", mode: "suppression", kFactor: 22.4, designSprinklers: 12, minPressurePsi: 40, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 35, maxCeilingHeightFt: 45, note: "AUDIT: FM Jul-2015 K320 cells start ~20 psi @25/30 ft." },
  { id: "esfr-k22.4-12-63", label: "ESFR K22.4 — 12 @ 63 psi (45 ft ceiling)", mode: "suppression", kFactor: 22.4, designSprinklers: 12, minPressurePsi: 63, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 40, maxCeilingHeightFt: 45, note: "AUDIT: per-cell value." },
  { id: "esfr-k25.2-12-40", label: "ESFR K25.2 — 12 @ 40 psi", mode: "suppression", kFactor: 25.2, designSprinklers: 12, minPressurePsi: 40, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 35, maxCeilingHeightFt: 40, note: "AUDIT: FM K360 low cell ~20 psi @25/30 ft." },
  { id: "esfr-k25.2-12-50", label: "ESFR K25.2 — 12 @ 50 psi (48 ft ceiling)", mode: "suppression", kFactor: 25.2, designSprinklers: 12, minPressurePsi: 50, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Class 1–4 + cartoned unexp. plastic", maxStorageHeightFt: 40, maxCeilingHeightFt: 48, note: "Flagship tall-warehouse ESFR (publicly grounded, 5 ft aisles)." },
  { id: "esfr-k25.2-12-60", label: "ESFR K25.2 — 12 @ 60 psi (exposed plastic ≤40 ft)", mode: "suppression", kFactor: 25.2, designSprinklers: 12, minPressurePsi: 60, hoseAllowanceGpm: 250, durationMin: 60, commodity: "Exposed (uncartoned) nonexpanded Group A plastic", maxStorageHeightFt: 40, maxCeilingHeightFt: 40, note: "Only ESFR option for exposed plastic (publicly grounded)." },
  { id: "cmsa-k16.8-15-25", label: "CMSA (large-drop) K16.8 upright — 15 @ 25 psi", mode: "control", kFactor: 16.8, designSprinklers: 15, minPressurePsi: 25, hoseAllowanceGpm: 500, durationMin: 90, commodity: "Class 1–4 / cartoned plastics where ESFR unsuitable", note: "Hose/duration per DS 8-9 Table 14: 15 heads → 500 gpm, 90 min. AUDIT: count(12–25)/psi are commodity/height specific — replace with the FM cell." },
];

export const fmGlobal: StandardModule = {
  id: "fmds",
  name: "FM Global — Property Loss Prevention Data Sheets",
  units: "imperial",
  cFactor: (material) => (/copper/i.test(material) ? 150 : /cpvc|pvc/i.test(material) ? 150 : /ductile|cast/i.test(material) ? 140 : 120),
  hazardClasses: () => HAZARDS.map((h) => ({ ...h })),
  designDensity: (id) => {
    const d = DENSITY[id];
    return d ? { ...d } : undefined;
  },
  hoseAllowance: (id) => HOSE[id] ?? 0,
  minResidualPressure: () => 7,
  // FM commonly uses larger-orifice sprinklers for storage/HC-3.
  standardKFactors: () => [5.6, 8.0, 11.2, 14.0, 16.8, 22.4, 25.2],
  fittingEquivalentLength: (fitting, nominalSize, opts) => fittingEquivalentLengthFt(fitting, nominalSize, opts ?? {}),
  storageSchemes: () => STORAGE_SCHEMES.map((s) => ({ ...s })),
  designByScheme: (id): StorageDesignBasis | undefined => {
    const s = STORAGE_SCHEMES.find((x) => x.id === id);
    return s ? { operatingSprinklers: s.designSprinklers, minPressurePsi: s.minPressurePsi, kFactor: s.kFactor, hoseAllowanceGpm: s.hoseAllowanceGpm, durationMin: s.durationMin, method: "fm-storage", schemeLabel: s.label } : undefined;
  },
};
