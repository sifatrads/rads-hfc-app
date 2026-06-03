/**
 * FM Global — Property Loss Prevention Data Sheets (sprinkler protection).
 * v1 covers the NON-STORAGE occupancy hazard categories HC-1/2/3 (DS 3-26) as
 * density/area schemes, which map onto the existing area-density solver. Storage
 * schemes (DS 8-9 etc., a "number of design sprinklers at a minimum pressure"
 * approach) are a follow-up.
 *
 * ⚠ Representative data — AUDIT against the current FM Data Sheets before use.
 */
import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";
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
};
