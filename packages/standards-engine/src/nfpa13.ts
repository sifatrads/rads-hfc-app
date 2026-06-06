import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";
import { cValueMultiplier, equivalentLengthModifier, fittingEquivalentLengthFt, SCH40_ID_IN } from "./tables-nfpa13";

/**
 * NFPA 13 (imperial). Verified against NFPA 13, 2019 Edition:
 *   - C-factors — Table 27.2.4.8.1 (exact),
 *   - hose-stream / supply duration — Table 19.3.3.1.2 (100/250/500 gpm),
 *   - density/area design points — Figure 19.2.3.1.1 curve anchors (max area),
 *   - 7 psi (0.5 bar) minimum at the most remote sprinkler — §27.2.
 */

// Hazen-Williams C-factors — NFPA 13 2019 Table 27.2.4.8.1 (verified).
const C_FACTORS: Record<string, number> = {
  "cast-iron": 100, // unlined cast or ductile iron
  "ductile-iron": 100, // unlined
  "cement-lined-cast-iron": 140,
  "cement-lined-ductile-iron": 140,
  "cement-lined": 140,
  steel: 120, // black steel, wet (default)
  "black-steel": 120, // wet system
  "black-steel-wet": 120,
  "black-steel-dry": 100, // dry / preaction system
  galvanized: 120, // wet system
  "galvanized-wet": 120,
  "galvanized-dry": 100, // dry / preaction system
  copper: 150, // copper tube, brass, or stainless steel
  brass: 150,
  stainless: 150,
  plastic: 150, // listed plastic, all
  cpvc: 150,
  pvc: 150,
  "asbestos-cement": 140,
  concrete: 140,
};

const HAZARDS: HazardClass[] = [
  { id: "light", label: "Light Hazard" },
  { id: "oh1", label: "Ordinary Hazard Group 1" },
  { id: "oh2", label: "Ordinary Hazard Group 2" },
  { id: "eh1", label: "Extra Hazard Group 1" },
  { id: "eh2", label: "Extra Hazard Group 2" },
];

// Density/area design points — the conservative (maximum-area) anchor of each
// hazard curve in NFPA 13 2019 Figure 19.2.3.1.1. (The full figure allows a
// higher density over a smaller area along each curve.)
const DENSITY: Record<string, DesignDensityPoint> = {
  light: { hazardClassId: "light", density: 0.1, area: 1500 },
  oh1: { hazardClassId: "oh1", density: 0.15, area: 1500 },
  oh2: { hazardClassId: "oh2", density: 0.2, area: 1500 },
  eh1: { hazardClassId: "eh1", density: 0.3, area: 2500 },
  eh2: { hazardClassId: "eh2", density: 0.4, area: 2500 },
};

// Hose-stream allowance, gpm — NFPA 13 2019 Table 19.3.3.1.2 (verified).
const HOSE: Record<string, number> = {
  light: 100,
  oh1: 250,
  oh2: 250,
  eh1: 500,
  eh2: 500,
};

export const nfpa13: StandardModule = {
  id: "nfpa13",
  name: "NFPA 13 — Standard for the Installation of Sprinkler Systems",
  units: "imperial",
  cFactor: (material) => C_FACTORS[material.toLowerCase()],
  hazardClasses: () => HAZARDS.map((h) => ({ ...h })),
  designDensity: (id) => {
    const d = DENSITY[id];
    return d ? { ...d } : undefined;
  },
  hoseAllowance: (id) => HOSE[id],
  minResidualPressure: () => 7,
  standardKFactors: () => [4.2, 5.6, 8.0, 11.2, 14.0, 16.8, 22.4, 25.2],
  hazenWilliamsCValues: () => ({ ...C_FACTORS }),
  cValueMultiplier,
  schedule40IdIn: (nominalSize) => SCH40_ID_IN[nominalSize],
  equivalentLengthModifier,
  fittingEquivalentLength: (fitting, nominalSize, opts) => fittingEquivalentLengthFt(fitting, nominalSize, opts ?? {}),
};
