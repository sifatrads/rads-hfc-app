/**
 * NFPA 13D — Sprinkler Systems in One- and Two-Family Dwellings and
 * Manufactured Homes. Design is the most-demanding of the single most-remote
 * sprinkler or the two most-remote in a compartment (the design-head count is
 * applied in @rads/solve); no hose-stream allowance.
 */
import type { StandardModule } from "./types";

export const nfpa13d: StandardModule = {
  id: "nfpa13d",
  name: "NFPA 13D — One- and Two-Family Dwellings",
  units: "imperial",
  cFactor: (material) => (/copper/i.test(material) ? 150 : /cpvc|pvc/i.test(material) ? 150 : 120),
  hazardClasses: () => [{ id: "dwelling", label: "Dwelling unit" }],
  designDensity: () => undefined,
  hoseAllowance: () => 0,
  minResidualPressure: () => 7,
  standardKFactors: () => [],
};
