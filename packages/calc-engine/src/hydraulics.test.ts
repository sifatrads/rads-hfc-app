import { describe, it, expect } from "vitest";
import {
  hazenWilliamsPsiPer100ft,
  hazenWilliamsLossPsi,
  kFactorFlowGpm,
  pressureFromFlowPsi,
  velocityFps,
  elevationHeadPsi,
} from "./hydraulics";

describe("hydraulics primitives", () => {
  it("Hazen-Williams matches the closed-form expression", () => {
    const Q = 100;
    const C = 120;
    const d = 1.049; // 1" Sch.40 internal diameter
    const expected = (4.52 * Math.pow(Q, 1.85)) / (Math.pow(C, 1.85) * Math.pow(d, 4.87));
    expect(hazenWilliamsPsiPer100ft(Q, C, d)).toBeCloseTo(expected, 10);
    expect(hazenWilliamsLossPsi(Q, C, d, 100)).toBeCloseTo(expected, 10);
    expect(hazenWilliamsLossPsi(Q, C, d, 50)).toBeCloseTo(expected / 2, 10);
  });

  it("flow exponent is 1.85 (doubling flow ⇒ loss × 2^1.85)", () => {
    const a = hazenWilliamsPsiPer100ft(100, 120, 2);
    const b = hazenWilliamsPsiPer100ft(200, 120, 2);
    expect(b / a).toBeCloseTo(Math.pow(2, 1.85), 6);
  });

  it("diameter exponent is 4.87 (doubling diameter ⇒ loss ÷ 2^4.87)", () => {
    const a = hazenWilliamsPsiPer100ft(100, 120, 1);
    const b = hazenWilliamsPsiPer100ft(100, 120, 2);
    expect(a / b).toBeCloseTo(Math.pow(2, 4.87), 6);
  });

  it("K-factor discharge round-trips Q=K√P and P=(Q/K)²", () => {
    expect(kFactorFlowGpm(5.6, 7)).toBeCloseTo(5.6 * Math.sqrt(7), 10);
    const p = 25;
    const q = kFactorFlowGpm(8.0, p);
    expect(pressureFromFlowPsi(8.0, q)).toBeCloseTo(p, 10);
  });

  it("velocity and elevation head", () => {
    expect(velocityFps(100, 1.049)).toBeCloseTo((0.4085 * 100) / (1.049 * 1.049), 10);
    expect(elevationHeadPsi(10)).toBeCloseTo(4.33, 10);
    expect(elevationHeadPsi(-10)).toBeCloseTo(-4.33, 10);
  });

  it("no-flow / no-pressure guards return 0", () => {
    expect(hazenWilliamsPsiPer100ft(0, 120, 1)).toBe(0);
    expect(kFactorFlowGpm(5.6, 0)).toBe(0);
  });
});
