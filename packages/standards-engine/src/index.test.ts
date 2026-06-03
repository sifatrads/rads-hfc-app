import { describe, it, expect } from "vitest";
import { getStandard, availableStandards, designBasisForHazard } from "./index";

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
    expect(availableStandards()).toContain("fmds");
    expect(() => getStandard("iso")).toThrow(/not implemented/i);
  });
});

describe("standards-engine: FM Global Data Sheets", () => {
  const s = getStandard("fmds");

  it("is imperial with FM hazard categories HC-1/2/3", () => {
    expect(s.units).toBe("imperial");
    expect(s.hazardClasses().map((h) => h.id)).toEqual(["hc-1", "hc-2", "hc-3"]);
  });

  it("exposes DS 3-26 density over 2500 ft² and hose demand", () => {
    expect(s.designDensity("hc-1")).toEqual({ hazardClassId: "hc-1", density: 0.1, area: 2500 });
    expect(s.designDensity("hc-3")).toEqual({ hazardClassId: "hc-3", density: 0.3, area: 2500 });
    expect(s.hoseAllowance("hc-1")).toBe(250);
    expect(s.hoseAllowance("hc-3")).toBe(500);
  });

  it("uses C = 120 for steel, 150 for copper/plastic", () => {
    expect(s.cFactor("black-steel")).toBe(120);
    expect(s.cFactor("copper")).toBe(150);
    expect(s.cFactor("cpvc")).toBe(150);
  });

  it("design basis stays imperial (no metric conversion)", () => {
    const db = designBasisForHazard("fmds", "hc-2");
    expect(db).toEqual({ densityGpmFt2: 0.2, designAreaFt2: 2500, minPressurePsi: 7, hoseAllowanceGpm: 250 });
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
