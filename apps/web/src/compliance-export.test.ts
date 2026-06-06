import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { solveProject } from "@rads/solve";
import { buildComplianceSummary } from "./compliance-export";

const model = parseProject({
  schemaVersion: 2,
  meta: { id: "RMG-01", name: "Garment Factory", systemType: "sprinkler", standardId: "nfpa13", standard: "NFPA 13 (2019)", hazardClass: "oh2", units: "imperial", governingCode: "rsc", engineer: "S. Sarower", date: "2026-06-06" },
  designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, operatingSprinklers: 4, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250, durationMin: 60 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 72, residualPsi: 55, testFlowGpm: 2000 }, firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115 } },
  network: {
    nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ id: `S${i + 1}`, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }))],
    pipes: Array.from({ length: 6 }, (_, i) => ({ id: `P${i + 1}`, from: i === 0 ? "SRC" : `S${i}`, to: `S${i + 1}`, role: "branch-line", nominalSize: "1-1/4", internalDiameterIn: 1.38, cFactor: 120, lengthFt: 10 })),
    valves: [],
  },
});
const sol = solveProject(model);

describe("buildComplianceSummary", () => {
  const c = buildComplianceSummary(model, sol);

  it("bundles project, design basis, demand/supply and result", () => {
    expect(c.schema).toBe("rads-hfc-compliance/1");
    expect(c.project.standardId).toBe("nfpa13");
    expect(c.project.governingCode).toBe("rsc");
    expect(c.designBasis.hydraulicMethod).toBe("hazen-williams");
    expect(c.designBasis.densityGpmFt2).toBe(0.2);
    expect(typeof c.demand.requiredSourcePressurePsi).toBe("number");
    expect(c.result).toHaveProperty("pass");
    expect(typeof c.supply.passesSupply).toBe("boolean");
  });

  it("carries the cited standard + jurisdiction clauses (verified NFPA 13)", () => {
    expect(c.references?.verified).toBe(true);
    expect(c.references?.clauses.some((cl) => cl.clause.includes("Table 27.2.4.8.1"))).toBe(true);
    expect(c.jurisdiction?.code).toBe("RSC");
    expect(c.jurisdiction?.adopts).toMatch(/NFPA 13/);
  });

  it("includes the coverage/spacing + design-area + validation checks and is JSON-serializable", () => {
    expect(c.coverageSpacing.hazard).toBe("oh2");
    expect(c.coverageSpacing.headsChecked).toBe(6);
    expect(c.designAreaProof).not.toBeNull();
    expect(Array.isArray(c.validation.errors)).toBe(true);
    expect(() => JSON.stringify(c)).not.toThrow();
  });
});
