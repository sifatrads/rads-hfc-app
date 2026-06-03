import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";
import { fittingEquivalentLengthFt } from "./tables-nfpa13";

/**
 * EN 12845 (metric). Density in mm/min, area in m², pressure in bar, flow in L/min.
 *
 * Key differences from NFPA 13 captured here:
 *   - a single flat Hazen-Williams C = 100 for all pipe materials,
 *   - stricter hazard classes (LH / OH1–4 / HHP / HHS),
 *   - higher minimum operating pressures.
 *
 * Representative data — flagged for an independent snapshot audit against the
 * printed standard (validation strategy, P1).
 */

// EN 12845 prescribes C = 100 for all pipe types.
const EN_C_FACTOR = 100;

const HAZARDS: HazardClass[] = [
  { id: "lh", label: "Light Hazard (LH)" },
  { id: "oh1", label: "Ordinary Hazard 1 (OH1)" },
  { id: "oh2", label: "Ordinary Hazard 2 (OH2)" },
  { id: "oh3", label: "Ordinary Hazard 3 (OH3)" },
  { id: "oh4", label: "Ordinary Hazard 4 (OH4)" },
  { id: "hhp", label: "High Hazard Process (HHP)" },
];

// density (mm/min) over area of operation (m²).
const DENSITY: Record<string, DesignDensityPoint> = {
  lh: { hazardClassId: "lh", density: 2.25, area: 84 },
  oh1: { hazardClassId: "oh1", density: 5.0, area: 72 },
  oh2: { hazardClassId: "oh2", density: 5.0, area: 144 },
  oh3: { hazardClassId: "oh3", density: 5.0, area: 216 },
  oh4: { hazardClassId: "oh4", density: 5.0, area: 360 },
  hhp: { hazardClassId: "hhp", density: 7.5, area: 260 },
};

// Hose-stream / additional demand allowance is handled differently under EN 12845;
// represented here as 0 (system demand governs) pending the data audit.
const HOSE: Record<string, number> = {
  lh: 0,
  oh1: 0,
  oh2: 0,
  oh3: 0,
  oh4: 0,
  hhp: 0,
};

export const en12845: StandardModule = {
  id: "en12845",
  name: "EN 12845 — Fixed firefighting systems · Automatic sprinkler systems",
  units: "metric",
  // Flat C = 100 for every material under EN 12845.
  cFactor: () => EN_C_FACTOR,
  hazardClasses: () => HAZARDS.map((h) => ({ ...h })),
  designDensity: (id) => {
    const d = DENSITY[id];
    return d ? { ...d } : undefined;
  },
  hoseAllowance: (id) => HOSE[id],
  // Minimum operating pressure: 0.5 bar (LH/OH). HH classes require ≥ 1.0 bar (handled per-class later).
  minResidualPressure: () => 0.5,
  // Metric K-factors (L·min⁻¹·bar⁻⁰·⁵): K80 ≈ NFPA K5.6.
  standardKFactors: () => [57, 80, 115, 160, 240, 360],
  // EN 12845 Table 23 equivalent lengths. Approximated from the base fitting
  // table at the EN flat C = 100 (same C-correction mechanism as NFPA Table
  // 27.2.3.2.1); ⚠ AUDIT against the printed Table 23 before production use.
  fittingEquivalentLength: (fitting, nominalSize, opts) => fittingEquivalentLengthFt(fitting, nominalSize, { cFactor: opts?.cFactor ?? EN_C_FACTOR, ...(opts?.actualIdIn !== undefined ? { actualIdIn: opts.actualIdIn } : {}) }),
};
