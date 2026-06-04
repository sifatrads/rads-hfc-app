import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";
import { fittingEquivalentLengthFt } from "./tables-nfpa13";

/**
 * AS 2118.1 — Australian Standard, automatic fire sprinkler systems (metric).
 * Density in mm/min, area (Assumed Maximum Area of Operation, AMAO) in m²,
 * pressure in bar, flow in L/min. Hazard classes follow the AS/EN heritage:
 * Extra-Light / Light / Ordinary Hazard Groups 1–3 / High Hazard.
 *
 * ⚠ Representative data — AUDIT against the current printed AS 2118.1 (densities,
 * AMAO, minimum pressures and the C-factor table change by edition/material)
 * before production use.
 */

const HAZARDS: HazardClass[] = [
  { id: "elh", label: "Extra-Light Hazard (ELH)" },
  { id: "lh", label: "Light Hazard (LH)" },
  { id: "oh1", label: "Ordinary Hazard Group 1 (OH1)" },
  { id: "oh2", label: "Ordinary Hazard Group 2 (OH2)" },
  { id: "oh3", label: "Ordinary Hazard Group 3 (OH3)" },
  { id: "hh", label: "High Hazard (HH)" },
];

// density (mm/min) over AMAO (m²) — representative AS 2118.1 values.
const DENSITY: Record<string, DesignDensityPoint> = {
  elh: { hazardClassId: "elh", density: 2.25, area: 84 },
  lh: { hazardClassId: "lh", density: 2.25, area: 84 },
  oh1: { hazardClassId: "oh1", density: 5.0, area: 72 },
  oh2: { hazardClassId: "oh2", density: 5.0, area: 144 },
  oh3: { hazardClassId: "oh3", density: 5.0, area: 216 },
  hh: { hazardClassId: "hh", density: 7.5, area: 260 },
};

// Hose / additional demand is project-specific under AS 2118; 0 here (system
// demand governs) pending the data audit.
const HOSE: Record<string, number> = { elh: 0, lh: 0, oh1: 0, oh2: 0, oh3: 0, hh: 0 };

export const as2118: StandardModule = {
  id: "as2118",
  name: "AS 2118.1 — Automatic fire sprinkler systems (Australia)",
  units: "metric",
  // Hazen-Williams C by material family (representative — AUDIT vs the AS table).
  cFactor: (material) => (/copper/i.test(material) ? 150 : /cpvc|pvc|plastic/i.test(material) ? 150 : /galvanized|dry/i.test(material) ? 100 : /cement|cast|ductile/i.test(material) ? 130 : 120),
  hazardClasses: () => HAZARDS.map((h) => ({ ...h })),
  designDensity: (id) => {
    const d = DENSITY[id];
    return d ? { ...d } : undefined;
  },
  hoseAllowance: (id) => HOSE[id],
  // Minimum operating pressure ≈ 0.5 bar (70 kPa) at the most-remote sprinkler.
  minResidualPressure: () => 0.5,
  // Metric K-factors (L·min⁻¹·bar⁻⁰·⁵): K80 ≈ NFPA K5.6.
  standardKFactors: () => [57, 80, 115, 160, 240, 360],
  // Equivalent lengths approximated from the base fitting table at the active C.
  fittingEquivalentLength: (fitting, nominalSize, opts) => fittingEquivalentLengthFt(fitting, nominalSize, opts ?? {}),
};
