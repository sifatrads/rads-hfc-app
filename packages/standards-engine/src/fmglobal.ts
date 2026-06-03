/**
 * FM Global — Property Loss Prevention Data Sheets (sprinkler protection).
 * Covers (a) the NON-STORAGE occupancy hazard categories HC-1/2/3 (DS 3-26) as
 * density/area schemes, and (b) STORAGE ceiling protection (DS 8-9) as
 * "count-at-pressure" schemes — a specific sprinkler operating a fixed number of
 * design heads (ESFR almost always 12) at a stated minimum end-head pressure,
 * plus fixed hose + duration. Both map onto the existing solver (density/area and
 * the N-most-remote-at-min-pressure binary search respectively).
 *
 * ⚠ Representative data — AUDIT against the current FM Data Sheets before use.
 *   The full FM 8-9 Tables 2-11 (per-cell K/count/pressure) are proprietary; only
 *   a few cells below are publicly grounded. Replace each with the exact current
 *   table cell for the specific commodity/arrangement/height/edition, and never
 *   mix FM with NFPA 13 criteria (they differ for the same sprinkler).
 */
import type { StandardModule, HazardClass, DesignDensityPoint, StorageScheme, StorageDesignBasis } from "./types";
import { fittingEquivalentLengthFt } from "./tables-nfpa13";

const HAZARDS: HazardClass[] = [
  { id: "hc-1", label: "Hazard Category 1 (HC-1)" },
  { id: "hc-2", label: "Hazard Category 2 (HC-2)" },
  { id: "hc-3", label: "Hazard Category 3 (HC-3)" },
];

// Density (gpm/ft²) over area of operation (ft²) — FM DS 3-26 non-storage.
const DENSITY: Record<string, DesignDensityPoint> = {
  "hc-1": { hazardClassId: "hc-1", density: 0.1, area: 2500 },
  "hc-2": { hazardClassId: "hc-2", density: 0.2, area: 2500 },
  "hc-3": { hazardClassId: "hc-3", density: 0.3, area: 2500 },
};

// Hose-stream demand (gpm).
const HOSE: Record<string, number> = { "hc-1": 250, "hc-2": 250, "hc-3": 500 };

// ── FM DS 8-9 ceiling storage protection — count-at-pressure schemes ──
// ⚠ AUDIT: Representative values consistent with public FM/industry sources.
// Only a few cells are publicly grounded (K25.2 12@50psi/48ft; K25.2 12@60psi
// exposed plastic; K16.8 35/52/63psi by ceiling; FM Jul-2015 K22.4/K25.2 cells).
// Every other psi/N is REPRESENTATIVE and MUST be replaced with the exact current
// FM 8-9 table cell for the specific commodity/arrangement/height/edition before
// issuing a design. Do NOT mix with NFPA 13 criteria (they differ).
// Suppression-mode (ESFR): 250 gpm hose / 60 min. Control-mode (CMSA/CMDA):
// 500 gpm hose / 120 min. K16.8 is the minimum ceiling K for storage; K14 is
// legacy (retired >30 ft). >50 ft ceilings may need >12 heads — out of v1 scope.
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
  { id: "cmsa-k16.8-15-25", label: "CMSA (large-drop) K16.8 upright — 15 @ 25 psi", mode: "control", kFactor: 16.8, designSprinklers: 15, minPressurePsi: 25, hoseAllowanceGpm: 500, durationMin: 120, commodity: "Class 1–4 / cartoned plastics where ESFR unsuitable", note: "AUDIT: count(12–25)/psi are commodity/height specific — replace with FM cell. Control mode → 500 gpm hose." },
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
