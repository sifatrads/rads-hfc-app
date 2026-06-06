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

// ── FM DS 8-9 ceiling storage protection — count-at-pressure (GROUNDED) ──
// The cells below are the actual "No. of sprinklers @ psi" from FM DS 8-9
// (Jul-2024): ceiling-level protection with a WET system and quick-response
// PENDENT storage sprinklers, for both storage arrangements —
//   SOLID-PILED / PALLETIZED / SHELF / BIN-BOX:
//     · Tables 2 & 3 — Class 1-3 and Class 4 + cartoned unexpanded plastic
//     · Table 4 — cartoned expanded plastic · Tables 5/6 — uncartoned plastic
//   OPEN-FRAME RACK (min 4 ft aisles), ceiling-only:
//     · Tables 7 & 8 — Class 1-4 / cartoned unexpanded plastic
//     · Table 9 — cartoned expanded plastic · Table 10 — uncartoned plastic
// Rack demand exceeds solid-piled at tall ceilings, so the two are separate
// schemes. Hose demand + supply duration are from Table 14, by the number of
// ceiling sprinklers (≤12 → 250 gpm/60 min; 13-19 → 500 gpm/90 min; 20+ → 500
// gpm/120 min). Min 7 psi at the most remote sprinkler.
// ⚠ NOT covered (use the specific DS 8-9 table): in-rack sprinklers, DRY or
// UPRIGHT systems, extended-coverage storage sprinklers, and ceilings above 40
// ft. Never mix FM with NFPA 13.
interface StorageCell { group: string; name: string; ceilFt: number; k: number; n: number; psi: number; rack?: boolean }
const STORAGE_CELLS: StorageCell[] = [
  // Class 1-4 + cartoned unexpanded plastic — DS 8-9 Tables 2 & 3
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 20, k: 16.8, n: 12, psi: 7 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 25, k: 16.8, n: 10, psi: 13 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 30, k: 16.8, n: 12, psi: 35 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 40, k: 16.8, n: 9, psi: 52 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 30, k: 22.4, n: 9, psi: 20 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 40, k: 22.4, n: 9, psi: 28 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 30, k: 25.2, n: 9, psi: 20 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", ceilFt: 40, k: 25.2, n: 9, psi: 22 },
  // Cartoned expanded plastic — DS 8-9 Table 4
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 20, k: 16.8, n: 12, psi: 13 },
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 30, k: 16.8, n: 12, psi: 35 },
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 30, k: 22.4, n: 12, psi: 25 },
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 40, k: 22.4, n: 12, psi: 75 },
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 30, k: 25.2, n: 12, psi: 20 },
  { group: "cep", name: "Cartoned expanded plastic", ceilFt: 40, k: 25.2, n: 12, psi: 60 },
  // Uncartoned (exposed) plastic — DS 8-9 Tables 5/6
  { group: "unc", name: "Uncartoned (exposed) plastic", ceilFt: 30, k: 16.8, n: 12, psi: 35 },
  { group: "unc", name: "Uncartoned (exposed) plastic", ceilFt: 40, k: 16.8, n: 12, psi: 52 },
  { group: "unc", name: "Uncartoned (exposed) plastic", ceilFt: 30, k: 25.2, n: 9, psi: 20 },
  { group: "unc", name: "Uncartoned (exposed) plastic", ceilFt: 40, k: 25.2, n: 9, psi: 40 },
  // ── OPEN-FRAME RACK storage (min 4 ft aisles), wet QR pendent — DS 8-9 Tables 7-10.
  // Rack demand is higher than solid-piled at tall ceilings (e.g. K25.2 @ 40 ft is
  // 9 @ 40 psi in racks vs 9 @ 22 psi solid-piled) — do NOT use a solid-piled scheme.
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 20, k: 16.8, n: 12, psi: 13 }, // Table 8
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 30, k: 16.8, n: 12, psi: 35 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 40, k: 16.8, n: 12, psi: 52 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 30, k: 22.4, n: 9, psi: 20 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 40, k: 22.4, n: 9, psi: 50 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 30, k: 25.2, n: 9, psi: 20 },
  { group: "c14", name: "Class 1-4 / cartoned unexp. plastic", rack: true, ceilFt: 40, k: 25.2, n: 9, psi: 40 },
  { group: "cep", name: "Cartoned expanded plastic", rack: true, ceilFt: 25, k: 16.8, n: 12, psi: 24 }, // Table 9
  { group: "cep", name: "Cartoned expanded plastic", rack: true, ceilFt: 30, k: 16.8, n: 12, psi: 35 },
  { group: "cep", name: "Cartoned expanded plastic", rack: true, ceilFt: 30, k: 22.4, n: 12, psi: 25 },
  { group: "cep", name: "Cartoned expanded plastic", rack: true, ceilFt: 40, k: 22.4, n: 12, psi: 75 },
  { group: "cep", name: "Cartoned expanded plastic", rack: true, ceilFt: 40, k: 25.2, n: 12, psi: 60 },
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 20, k: 16.8, n: 9, psi: 35 }, // Table 10
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 30, k: 16.8, n: 15, psi: 35 },
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 30, k: 22.4, n: 10, psi: 50 },
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 40, k: 22.4, n: 12, psi: 75 },
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 30, k: 25.2, n: 10, psi: 40 },
  { group: "unc", name: "Uncartoned (exposed) plastic", rack: true, ceilFt: 40, k: 25.2, n: 12, psi: 60 },
];
/** DS 8-9 Table 14: hose demand (gpm) + supply duration (min) by ceiling-head count. */
const tbl14 = (n: number): { hose: number; dur: number } => (n <= 12 ? { hose: 250, dur: 60 } : n <= 19 ? { hose: 500, dur: 90 } : { hose: 500, dur: 120 });
const STORAGE_SCHEMES: StorageScheme[] = [
  ...STORAGE_CELLS.map((c): StorageScheme => {
    const h = tbl14(c.n);
    return { id: `fm-${c.rack ? "rk-" : ""}${c.group}-k${c.k}-${c.ceilFt}`, label: `${c.name}${c.rack ? " · open-frame rack" : ""} · K${c.k} ${c.n} @ ${c.psi} psi (≤${c.ceilFt} ft)`, mode: "suppression", kFactor: c.k, designSprinklers: c.n, minPressurePsi: c.psi, hoseAllowanceGpm: h.hose, durationMin: h.dur, commodity: `${c.name}${c.rack ? " (open-frame rack)" : " (solid-piled)"}`, maxCeilingHeightFt: c.ceilFt };
  }),
  // Control mode (CMSA / large-drop) where ESFR is unsuitable
  { id: "cmsa-k16.8-15-25", label: "CMSA (large-drop) K16.8 upright — 15 @ 25 psi", mode: "control", kFactor: 16.8, designSprinklers: 15, minPressurePsi: 25, hoseAllowanceGpm: 500, durationMin: 90, commodity: "Class 1-4 / where ESFR unsuitable", note: "Hose/duration per Table 14 (15 heads → 500 gpm/90 min). AUDIT: count/psi are commodity/height specific — confirm the DS 8-9 cell." },
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
