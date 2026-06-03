/**
 * NFPA 13R — Sprinkler Systems in Low-Rise Residential Occupancies (up to and
 * including four stories). Design area = the four most-remote sprinklers (or all
 * in the largest single compartment, up to four); the design-head count is
 * applied in @rads/solve.
 */
import type { StandardModule } from "./types";

export const nfpa13r: StandardModule = {
  id: "nfpa13r",
  name: "NFPA 13R — Residential up to Four Stories",
  units: "imperial",
  cFactor: (material) => (/copper/i.test(material) ? 150 : /cpvc|pvc/i.test(material) ? 150 : 120),
  hazardClasses: () => [{ id: "residential", label: "Residential" }],
  designDensity: () => undefined,
  hoseAllowance: () => 0,
  minResidualPressure: () => 7,
  standardKFactors: () => [],
};
