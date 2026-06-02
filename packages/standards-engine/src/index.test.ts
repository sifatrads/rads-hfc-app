import { describe, it, expect } from "vitest";
import { getStandard, availableStandards } from "./index";

describe("standards-engine: NFPA 13", () => {
  const s = getStandard("nfpa13");

  it("exposes C-factors per material", () => {
    expect(s.cFactor("steel")).toBe(120);
    expect(s.cFactor("copper")).toBe(150);
    expect(s.cFactor("CPVC")).toBe(150); // case-insensitive
    expect(s.cFactor("unobtanium")).toBeUndefined();
  });

  it("exposes density/area and hose allowance", () => {
    expect(s.designDensity("oh1")).toEqual({ hazardClassId: "oh1", density: 0.15, area: 1500 });
    expect(s.hoseAllowance("oh1")).toBe(250);
    expect(s.hoseAllowance("light")).toBe(100);
    expect(s.hoseAllowance("eh1")).toBe(500);
  });

  it("exposes min residual pressure and listed K-factors", () => {
    expect(s.minResidualPressure()).toBe(7);
    expect(s.standardKFactors()).toContain(5.6);
  });

  it("registry lists nfpa13 and rejects unimplemented standards", () => {
    expect(availableStandards()).toContain("nfpa13");
    expect(() => getStandard("en12845")).toThrow(/not implemented/i);
  });
});
