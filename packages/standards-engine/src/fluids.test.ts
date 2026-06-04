import { describe, it, expect } from "vitest";
import { fluidViscosityCst } from "./fluids";

describe("fluidViscosityCst", () => {
  it("returns water kinematic viscosity vs temperature", () => {
    expect(fluidViscosityCst("water", 68)).toBeCloseTo(1.0, 2); // 20 °C
    expect(fluidViscosityCst("water", 32)).toBeCloseTo(1.79, 2); // 0 °C — thicker
    expect(fluidViscosityCst("water", 104)).toBeCloseTo(0.66, 2); // 40 °C — thinner
    // water ignores any concentration
    expect(fluidViscosityCst("water", 68, 40)).toBeCloseTo(1.0, 2);
  });

  it("antifreeze is much more viscous, rising with concentration and falling with temp", () => {
    expect(fluidViscosityCst("propylene-glycol", 32, 40)).toBeCloseTo(11.0, 2);
    expect(fluidViscosityCst("propylene-glycol", 68, 40)).toBeCloseTo(4.3, 2);
    // colder is thicker; more concentrated is thicker
    expect(fluidViscosityCst("propylene-glycol", 32, 50)).toBeGreaterThan(fluidViscosityCst("propylene-glycol", 32, 40));
    expect(fluidViscosityCst("propylene-glycol", 32, 40)).toBeGreaterThan(fluidViscosityCst("propylene-glycol", 68, 40));
    // ethylene glycol is thinner than propylene glycol at the same point
    expect(fluidViscosityCst("ethylene-glycol", 32, 40)).toBeLessThan(fluidViscosityCst("propylene-glycol", 32, 40));
  });

  it("interpolates between concentration rows and clamps outside the grid", () => {
    const v25 = fluidViscosityCst("propylene-glycol", 68, 25); // between 20% (1.9) and 30% (2.8)
    expect(v25).toBeGreaterThan(1.9);
    expect(v25).toBeLessThan(2.8);
    // below 0 °C and above the grid clamp to the edge values
    expect(fluidViscosityCst("water", -20)).toBeCloseTo(1.79, 2);
    expect(fluidViscosityCst("water", 200)).toBeCloseTo(0.66, 2);
  });
});
