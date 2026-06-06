import { describe, it, expect } from "vitest";
import { cValueMultiplier, equivalentLengthModifier, fittingEquivalentLengthFt, normalizeFittingId, SCH40_ID_IN } from "./tables-nfpa13";
import { nfpa13 } from "./nfpa13";

describe("NFPA 13 §27.2.3 reference tables", () => {
  it("C value multiplier matches Table 27.2.3.2.1 and interpolates", () => {
    expect(cValueMultiplier(120)).toBe(1.0);
    expect(cValueMultiplier(100)).toBe(0.713);
    expect(cValueMultiplier(140)).toBe(1.33);
    expect(cValueMultiplier(150)).toBe(1.51);
    const mid = cValueMultiplier(135);
    expect(mid).toBeGreaterThan(1.16);
    expect(mid).toBeLessThan(1.33);
  });

  it("equivalent-length modifier is 1 at Sch-40 ID and grows for larger ID", () => {
    expect(equivalentLengthModifier(SCH40_ID_IN["2"]!, "2")).toBeCloseTo(1, 6);
    expect(equivalentLengthModifier(2.2, "2")).toBeGreaterThan(1); // larger bore → longer equiv length
  });

  it("fitting equivalent length applies base × C-multiplier", () => {
    expect(fittingEquivalentLengthFt("elbow-90", "2")).toBe(5); // base at C=120
    expect(fittingEquivalentLengthFt("elbow-90", "2", { cFactor: 100 })).toBeCloseTo(5 * 0.713, 6);
    expect(fittingEquivalentLengthFt("tee-branch", "2")).toBe(10); // Table 27.2.3.1.1 (was wrongly 8)
    expect(fittingEquivalentLengthFt("coupling", "2")).toBeUndefined(); // unlisted → negligible
  });

  it("Sch-40 internal diameters match NFPA 13 2019 Table A.16.3.2", () => {
    expect(SCH40_ID_IN["1"]).toBe(1.049);
    expect(SCH40_ID_IN["2"]).toBe(2.067);
    expect(SCH40_ID_IN["2-1/2"]).toBe(2.469);
    expect(SCH40_ID_IN["4"]).toBe(4.026);
    expect(SCH40_ID_IN["6"]).toBe(6.065);
    expect(SCH40_ID_IN["8"]).toBe(7.981);
    expect(SCH40_ID_IN["10"]).toBe(10.02);
    expect(SCH40_ID_IN["12"]).toBe(11.938);
  });

  it("C-value multipliers match NFPA 13 2019 Table 27.2.3.2.1", () => {
    expect(cValueMultiplier(100)).toBe(0.713);
    expect(cValueMultiplier(120)).toBe(1.0);
    expect(cValueMultiplier(130)).toBe(1.16);
    expect(cValueMultiplier(140)).toBe(1.33);
    expect(cValueMultiplier(150)).toBe(1.51);
  });

  it("matches NFPA 13 2019 Table 27.2.3.1.1 (verified rows)", () => {
    expect(fittingEquivalentLengthFt("tee", "3")).toBe(15); // tee/cross 3"
    expect(fittingEquivalentLengthFt("tee", "8")).toBe(35); // tee/cross 8"
    expect(fittingEquivalentLengthFt("elbow-90-long", "1")).toBe(2); // long-turn 1"
    expect(fittingEquivalentLengthFt("gate-valve", "4")).toBe(2); // gate 4"
    expect(fittingEquivalentLengthFt("gate-valve", "6")).toBe(3); // gate 6"
    expect(fittingEquivalentLengthFt("butterfly-valve", "3")).toBe(10); // butterfly 3"
    expect(fittingEquivalentLengthFt("check-valve", "2")).toBe(11); // swing check 2"
    expect(fittingEquivalentLengthFt("check-valve", "3")).toBe(16); // swing check 3"
  });

  it("normalizes fitting type strings to table rows", () => {
    expect(normalizeFittingId("elbow-90")).toBe("elbow-90");
    expect(normalizeFittingId("45-elbow")).toBe("elbow-45");
    expect(normalizeFittingId("tee-branch")).toBe("tee");
    expect(normalizeFittingId("butterfly-valve")).toBe("butterfly-valve");
    expect(normalizeFittingId("reducer")).toBeUndefined();
  });

  it("is reachable through the StandardModule interface", () => {
    expect(nfpa13.cValueMultiplier?.(140)).toBe(1.33);
    expect(nfpa13.fittingEquivalentLength?.("elbow-90", "4")).toBe(10);
    expect(nfpa13.schedule40IdIn?.("4")).toBe(4.026);
    expect(nfpa13.hazenWilliamsCValues?.()["copper"]).toBe(150);
  });
});
