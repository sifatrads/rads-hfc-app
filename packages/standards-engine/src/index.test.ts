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

  it("C-factors match NFPA 13 (2019) Table 27.2.4.8.1", () => {
    expect(s.cFactor("black-steel-wet")).toBe(120);
    expect(s.cFactor("black-steel-dry")).toBe(100);
    expect(s.cFactor("galvanized-dry")).toBe(100);
    expect(s.cFactor("ductile-iron")).toBe(100); // unlined
    expect(s.cFactor("cement-lined")).toBe(140);
    expect(s.cFactor("plastic")).toBe(150);
    expect(s.cFactor("stainless")).toBe(150);
    expect(s.cFactor("concrete")).toBe(140);
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

  it("registry lists implemented standards and rejects unimplemented ones", () => {
    expect(availableStandards()).toContain("nfpa13");
    expect(availableStandards()).toContain("en12845");
    expect(() => getStandard("fmds")).toThrow(/not implemented/i);
  });
});

describe("standards-engine: EN 12845", () => {
  const s = getStandard("en12845");

  it("is metric with a flat C = 100 for all materials", () => {
    expect(s.units).toBe("metric");
    expect(s.cFactor("steel")).toBe(100);
    expect(s.cFactor("copper")).toBe(100);
    expect(s.cFactor("anything")).toBe(100);
  });

  it("exposes metric density/area and stricter minimum pressure", () => {
    expect(s.designDensity("oh1")).toEqual({ hazardClassId: "oh1", density: 5.0, area: 72 });
    expect(s.designDensity("lh")?.density).toBe(2.25);
    expect(s.minResidualPressure()).toBe(0.5); // bar
    expect(s.standardKFactors()).toContain(80); // metric K80 ≈ NFPA K5.6
  });
});
