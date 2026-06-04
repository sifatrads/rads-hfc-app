import { describe, it, expect } from "vitest";
import { getStandard, availableStandards, designBasisForHazard, storageSchemesFor, designBasisForScheme } from "./index";

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

  it("offers DS 8-9 storage count-at-pressure schemes", () => {
    const schemes = s.storageSchemes!();
    expect(schemes.length).toBeGreaterThan(0);
    const flagship = schemes.find((x) => x.id === "esfr-k25.2-12-50")!;
    expect(flagship).toMatchObject({ kFactor: 25.2, designSprinklers: 12, minPressurePsi: 50, mode: "suppression", hoseAllowanceGpm: 250, durationMin: 60 });
    // control-mode carries the larger hose / longer duration
    const cmsa = schemes.find((x) => x.mode === "control")!;
    expect(cmsa.hoseAllowanceGpm).toBe(500);
    expect(cmsa.durationMin).toBe(120);
  });

  it("resolves a storage scheme into an imperial design basis", () => {
    const b = designBasisForScheme("fmds", "esfr-k16.8-12-35");
    expect(b).toEqual({ operatingSprinklers: 12, minPressurePsi: 35, kFactor: 16.8, hoseAllowanceGpm: 250, durationMin: 60, method: "fm-storage", schemeLabel: "ESFR K16.8 — 12 @ 35 psi (≤30 ft ceiling)" });
    expect(designBasisForScheme("fmds", "bogus")).toBeUndefined();
  });

  it("storage methods are FM-only — other standards expose none", () => {
    expect(storageSchemesFor("nfpa13")).toEqual([]);
    expect(designBasisForScheme("nfpa13", "esfr-k16.8-12-35")).toBeUndefined();
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

describe("standards-engine: AS 2118 (Australia)", () => {
  const s = getStandard("as2118");

  it("is registered, metric, with AS/EN hazard classes", () => {
    expect(availableStandards()).toContain("as2118");
    expect(s.units).toBe("metric");
    expect(s.hazardClasses().map((h) => h.id)).toEqual(["elh", "lh", "oh1", "oh2", "oh3", "hh"]);
  });

  it("exposes metric density over AMAO + material-based C-factor", () => {
    expect(s.designDensity("oh2")).toEqual({ hazardClassId: "oh2", density: 5.0, area: 144 });
    expect(s.designDensity("lh")?.density).toBe(2.25);
    expect(s.cFactor("black-steel")).toBe(120);
    expect(s.cFactor("copper")).toBe(150);
    expect(s.minResidualPressure()).toBe(0.5); // bar
  });

  it("converts to an imperial design basis for the solver", () => {
    const basis = designBasisForHazard("as2118", "oh1");
    // 5.0 mm/min → ~0.123 gpm/ft²; 72 m² → ~775 ft²; 0.5 bar → ~7.25 psi
    expect(basis!.densityGpmFt2).toBeCloseTo(0.1227, 3);
    expect(basis!.designAreaFt2).toBe(775);
    expect(basis!.minPressurePsi).toBeCloseTo(7.3, 1);
  });
});
