import { describe, it, expect } from "vitest";
import {
  cityAvailablePsi,
  cityFlowAtPsi,
  cityCurve,
  constantPressureCurve,
  pumpHeadPsi,
  pumpOnSuction,
  checkSupplyMargin,
  sampleCurve,
  type FlowTest,
  type PumpCurve,
} from "./supply";

const test: FlowTest = { staticPsi: 70, residualPsi: 50, testFlowGpm: 1000 };

describe("city supply curve", () => {
  it("hits the flow-test endpoints", () => {
    expect(cityAvailablePsi(test, 0)).toBe(70);
    expect(cityAvailablePsi(test, 1000)).toBeCloseTo(50, 10);
  });

  it("drops as Q^1.85 between endpoints", () => {
    // P(500) = 70 - 20*(0.5)^1.85
    const expected = 70 - 20 * Math.pow(0.5, 1.85);
    expect(cityAvailablePsi(test, 500)).toBeCloseTo(expected, 10);
  });

  it("inverts: flow at a target pressure round-trips", () => {
    const q = cityFlowAtPsi(test, 60);
    expect(cityAvailablePsi(test, q)).toBeCloseTo(60, 8);
    expect(cityFlowAtPsi(test, 70)).toBe(0); // at static, no flow
  });
});

describe("pump curve", () => {
  const pump: PumpCurve = {
    churnPsi: 165,
    ratedFlowGpm: 1000,
    ratedPsi: 100,
    overloadFlowGpm: 1500,
    overloadPsi: 65,
  };

  it("passes through churn / rated / overload points", () => {
    expect(pumpHeadPsi(pump, 0)).toBeCloseTo(165, 10);
    expect(pumpHeadPsi(pump, 1000)).toBeCloseTo(100, 10);
    expect(pumpHeadPsi(pump, 1500)).toBeCloseTo(65, 10);
  });

  it("interpolates linearly between points", () => {
    // midpoint of rated→overload: Q=1250 → (100+65)/2 = 82.5
    expect(pumpHeadPsi(pump, 1250)).toBeCloseTo(82.5, 10);
  });

  it("boosts a suction supply additively", () => {
    const combined = pumpOnSuction(cityCurve(test), pump);
    const q = 800;
    expect(combined(q)).toBeCloseTo(cityAvailablePsi(test, q) + pumpHeadPsi(pump, q), 10);
  });
});

describe("demand-vs-supply safety margin", () => {
  it("passes when demand falls below supply with the required cushion", () => {
    const supply = cityCurve(test);
    // demand 600 gpm at 55 psi; available ≈ 70 - 20*(0.6)^1.85
    const r = checkSupplyMargin(supply, 600, 55, { minMarginPsi: 5 });
    expect(r.availablePsi).toBeCloseTo(cityAvailablePsi(test, 600), 10);
    expect(r.marginPsi).toBeCloseTo(r.availablePsi - 55, 10);
    expect(r.passes).toBe(true);
  });

  it("fails when demand exceeds the supply", () => {
    const r = checkSupplyMargin(cityCurve(test), 900, 60);
    // available at 900 ≈ 70 - 20*0.9^1.85 ≈ 53.4 < 60
    expect(r.passes).toBe(false);
    expect(r.marginPsi).toBeLessThan(0);
  });

  it("honors a percentage cushion", () => {
    const flat = constantPressureCurve(66);
    // require 60 psi with a 10% cushion ⇒ need 6 psi margin; available margin = 6 ⇒ passes
    const r = checkSupplyMargin(flat, 500, 60, { minMarginFraction: 0.1 });
    expect(r.marginPsi).toBeCloseTo(6, 10);
    expect(r.passes).toBe(true);
    // require 62 ⇒ margin 4 < 6.2 needed ⇒ fails
    expect(checkSupplyMargin(flat, 500, 62, { minMarginFraction: 0.1 }).passes).toBe(false);
  });
});

describe("curve sampling", () => {
  it("samples N points from 0 to maxFlow, monotonically decreasing for city", () => {
    const pts = sampleCurve(cityCurve(test), 1200, 13);
    expect(pts).toHaveLength(13);
    expect(pts[0]!.flowGpm).toBe(0);
    expect(pts[12]!.flowGpm).toBeCloseTo(1200, 10);
    for (let i = 1; i < pts.length; i++) {
      expect(pts[i]!.pressurePsi).toBeLessThanOrEqual(pts[i - 1]!.pressurePsi + 1e-9);
    }
  });
});
