import type { StandardModule, HazardClass, DesignDensityPoint } from "./types";

/**
 * NFPA 750 — Water Mist Fire Protection Systems (metric; pressures in bar).
 * Water mist is performance-based (the listing fixes the nozzle, spacing and
 * minimum operating pressure from fire testing), so there is no density/area
 * table like NFPA 13. Hydraulically a zone's nozzles all discharge together at
 * a high operating pressure, with Darcy-Weisbach friction in the small-bore,
 * high-pressure piping. Pair this Code with System = "water-mist" (all nozzles
 * flow) and Friction = Darcy-Weisbach.
 *
 * ⚠ Representative data — the nozzle K, minimum pressure and pressure class
 * (low ≤ 12.5 bar / intermediate / high > 35 bar) come from the manufacturer's
 * FM/UL listing; AUDIT against it before use.
 */
const APPLICATIONS: HazardClass[] = [
  { id: "machinery-space", label: "Machinery space / enclosure" },
  { id: "light-hazard", label: "Light hazard occupancy" },
  { id: "ordinary-hazard", label: "Ordinary hazard occupancy" },
  { id: "local-application", label: "Local application" },
];

export const nfpa750: StandardModule = {
  id: "nfpa750",
  name: "NFPA 750 — Water Mist Fire Protection Systems",
  units: "metric",
  cFactor: () => undefined, // high-pressure → use Darcy-Weisbach (per-material roughness)
  hazardClasses: () => APPLICATIONS.map((a) => ({ ...a })),
  // Performance-based — no density/area table; the nozzle + min pressure come
  // from the listing (entered in the design basis).
  designDensity: (): DesignDensityPoint | undefined => undefined,
  hoseAllowance: () => 0,
  // Representative minimum operating pressure (bar) — set per the nozzle listing.
  minResidualPressure: () => 12,
  // Mist nozzles have small K-factors (metric, L·min⁻¹·bar⁻⁰·⁵).
  standardKFactors: () => [0.7, 1.0, 1.4, 2.0, 2.8, 3.6],
};
