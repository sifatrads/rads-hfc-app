import { describe, it, expect } from "vitest";
import {
  hazenWilliamsPsiPerFoot,
  hazenWilliamsLossPsi,
  kFactorFlowGpm,
  pressureFromFlowPsi,
  velocityFps,
  velocityPressurePsi,
  normalPressurePsi,
  elevationHeadPsi,
} from "./hydraulics";

describe("hydraulics primitives (NFPA 13 §27.2.2)", () => {
  it("Hazen-Williams resistance is psi/ft and loss scales with length (§27.2.2.1.1)", () => {
    const Q = 100;
    const C = 120;
    const d = 1.049; // 1" Sch.40 internal diameter
    const p = (4.52 * Math.pow(Q, 1.85)) / (Math.pow(C, 1.85) * Math.pow(d, 4.87)); // psi/ft
    expect(hazenWilliamsPsiPerFoot(Q, C, d)).toBeCloseTo(p, 10);
    expect(hazenWilliamsLossPsi(Q, C, d, 1)).toBeCloseTo(p, 10); // 1 ft
    expect(hazenWilliamsLossPsi(Q, C, d, 100)).toBeCloseTo(p * 100, 8); // 100 ft
    expect(hazenWilliamsLossPsi(Q, C, d, 50)).toBeCloseTo(p * 50, 8);
  });

  it("flow exponent is 1.85 (doubling flow ⇒ loss × 2^1.85)", () => {
    const a = hazenWilliamsPsiPerFoot(100, 120, 2);
    const b = hazenWilliamsPsiPerFoot(200, 120, 2);
    expect(b / a).toBeCloseTo(Math.pow(2, 1.85), 6);
  });

  it("diameter exponent is 4.87 (doubling diameter ⇒ loss ÷ 2^4.87)", () => {
    const a = hazenWilliamsPsiPerFoot(100, 120, 1);
    const b = hazenWilliamsPsiPerFoot(100, 120, 2);
    expect(a / b).toBeCloseTo(Math.pow(2, 4.87), 6);
  });

  it("K-factor discharge round-trips Q=K√P and P=(Q/K)² (§27.2.2.5)", () => {
    expect(kFactorFlowGpm(5.6, 7)).toBeCloseTo(5.6 * Math.sqrt(7), 10);
    const p = 25;
    const q = kFactorFlowGpm(8.0, p);
    expect(pressureFromFlowPsi(8.0, q)).toBeCloseTo(p, 10);
  });

  it("velocity, velocity pressure (§27.2.2.2) and normal pressure (§27.2.2.3)", () => {
    expect(velocityFps(100, 1.049)).toBeCloseTo((0.4085 * 100) / (1.049 * 1.049), 10);
    // P_v = 0.001123·Q²/d⁴
    expect(velocityPressurePsi(100, 1.049)).toBeCloseTo((0.001123 * 100 * 100) / Math.pow(1.049, 4), 10);
    const pv = velocityPressurePsi(120, 2.067);
    expect(normalPressurePsi(50, pv)).toBeCloseTo(50 - pv, 10);
  });

  it("elevation head is 0.433 psi/ft", () => {
    expect(elevationHeadPsi(10)).toBeCloseTo(4.33, 10);
    expect(elevationHeadPsi(-10)).toBeCloseTo(-4.33, 10);
  });

  it("no-flow / no-pressure guards return 0", () => {
    expect(hazenWilliamsPsiPerFoot(0, 120, 1)).toBe(0);
    expect(velocityPressurePsi(0, 1)).toBe(0);
    expect(kFactorFlowGpm(5.6, 0)).toBe(0);
  });
});
