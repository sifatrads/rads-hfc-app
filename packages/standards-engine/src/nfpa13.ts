import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";

/**
 * NFPA 13 (imperial). Representative data — every table is flagged for an
 * independent snapshot audit against the printed code (validation strategy, P1).
 */

// Hazen-Williams C-factors (NFPA 13 Table 23.4.3.1.1).
const C_FACTORS: Record<string, number> = {
  steel: 120,
  "black-steel": 120,
  "black-steel-dry": 100,
  galvanized: 120,
  copper: 150,
  cpvc: 150,
  pvc: 150,
  plastic: 150,
  "cement-lined": 140,
  "ductile-iron": 140,
  "cast-iron": 100,
};

const HAZARDS: HazardClass[] = [
  { id: "light", label: "Light Hazard" },
  { id: "oh1", label: "Ordinary Hazard Group 1" },
  { id: "oh2", label: "Ordinary Hazard Group 2" },
  { id: "eh1", label: "Extra Hazard Group 1" },
  { id: "eh2", label: "Extra Hazard Group 2" },
];

// Representative density/area design points (NFPA 13 density/area method).
const DENSITY: Record<string, DesignDensityPoint> = {
  light: { hazardClassId: "light", density: 0.1, area: 1500 },
  oh1: { hazardClassId: "oh1", density: 0.15, area: 1500 },
  oh2: { hazardClassId: "oh2", density: 0.2, area: 1500 },
  eh1: { hazardClassId: "eh1", density: 0.3, area: 2500 },
  eh2: { hazardClassId: "eh2", density: 0.4, area: 2500 },
};

// Hose-stream allowance, gpm (NFPA 13 Table 19.3.3.1.2).
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
};
