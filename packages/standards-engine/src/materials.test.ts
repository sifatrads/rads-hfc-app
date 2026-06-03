import { describe, it, expect } from "vitest";
import { internalDiameterForMaterial, defaultCFactorForMaterial, resolveMaterialId, pipeMaterial, PIPE_MATERIALS } from "./materials";

describe("pipe material database", () => {
  it("looks up internal diameter by material + nominal size", () => {
    expect(internalDiameterForMaterial("steel-sch40", "2")).toBeCloseTo(2.067, 3);
    expect(internalDiameterForMaterial("steel-sch10", "2")).toBeCloseTo(2.157, 3);
    expect(internalDiameterForMaterial("copper-l", "1")).toBeCloseTo(1.025, 3);
    expect(internalDiameterForMaterial("copper-k", "1")).toBeCloseTo(0.995, 3);
    expect(internalDiameterForMaterial("cpvc", "1")).toBeCloseTo(1.101, 3);
  });

  it("defaults the C-factor from the material", () => {
    expect(defaultCFactorForMaterial("steel-sch40")).toBe(120);
    expect(defaultCFactorForMaterial("copper-l")).toBe(150);
    expect(defaultCFactorForMaterial("cpvc")).toBe(150);
    expect(defaultCFactorForMaterial("ductile-iron")).toBe(140);
  });

  it("resolves legacy/raw material strings", () => {
    expect(resolveMaterialId("copper")).toBe("copper-l");
    expect(resolveMaterialId("Sch 10 Steel")).toBe("steel-sch10");
    expect(resolveMaterialId(undefined)).toBe("steel-sch40");
    expect(resolveMaterialId("nonsense")).toBe("steel-sch40");
  });

  it("falls back to Sch-40 for a size the material doesn't list (copper > 8\")", () => {
    // copper-l has no 10"; Sch-40 10" = 10.02
    expect(internalDiameterForMaterial("copper-l", "10")).toBeCloseTo(10.02, 2);
  });

  it("every material has a non-empty diameter table + valid C", () => {
    for (const m of PIPE_MATERIALS) {
      expect(Object.keys(m.idIn).length).toBeGreaterThan(0);
      expect(m.defaultCFactor).toBeGreaterThanOrEqual(100);
      expect(pipeMaterial(m.id).id).toBe(m.id);
    }
  });
});
