/**
 * NFPA 14 — Standard for the Installation of Standpipe and Hose Systems.
 * The standpipe sizing logic (per-class flow assignment + residual at the
 * most-remote outlet) lives in @rads/solve as a dedicated solve mode; this
 * module supplies the C-factors and the minimum residual pressure (100 psi at
 * the most-remote 2½" outlet for Class I/III).
 */
import type { StandardModule } from "./types";

export const nfpa14: StandardModule = {
  id: "nfpa14",
  name: "NFPA 14 — Standpipe and Hose Systems",
  units: "imperial",
  cFactor: (material) => (/copper/i.test(material) ? 150 : /cpvc|pvc/i.test(material) ? 150 : /ductile|cast/i.test(material) ? 140 : 100),
  hazardClasses: () => [],
  designDensity: () => undefined,
  hoseAllowance: () => 0,
  minResidualPressure: () => 100,
  standardKFactors: () => [],
};
