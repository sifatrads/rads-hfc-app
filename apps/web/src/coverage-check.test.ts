import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { checkCoverageSpacing } from "./coverage-check";

// OH2: one head over the 130 ft² area limit, one fed by a 20 ft run (> 15 ft).
const m = parseProject({
  schemaVersion: 2,
  meta: { id: "CS", name: "Coverage", systemType: "sprinkler", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
  designBasis: {},
  waterSupply: { type: "city", flowTest: { staticPsi: 70, residualPsi: 50, testFlowGpm: 1500 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "OK", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 },
      { id: "BIG", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 200 },
      { id: "FAR", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 },
    ],
    pipes: [
      { id: "P1", from: "SRC", to: "OK", role: "branch-line", nominalSize: "1", lengthFt: 10 },
      { id: "P2", from: "OK", to: "BIG", role: "branch-line", nominalSize: "1", lengthFt: 10 },
      { id: "P3", from: "BIG", to: "FAR", role: "branch-line", nominalSize: "1", lengthFt: 20 },
    ],
    valves: [],
  },
});

describe("checkCoverageSpacing", () => {
  it("flags heads over the NFPA 13 area and spacing limits for the hazard", () => {
    const r = checkCoverageSpacing(m);
    expect(r.maxAreaFt2).toBe(130); // ordinary hazard
    expect(r.maxSpacingFt).toBe(15);
    expect(r.overCoverage).toBe(1); // BIG: 200 > 130
    expect(r.overSpacing).toBe(1); // FAR: 20 ft feed > 15
    expect(r.heads.find((h) => h.id === "BIG")!.overCoverage).toBe(true);
    expect(r.heads.find((h) => h.id === "FAR")!.overSpacing).toBe(true);
    const ok = r.heads.find((h) => h.id === "OK")!;
    expect(ok.overCoverage).toBe(false);
    expect(ok.overSpacing).toBe(false);
  });

  it("uses light-hazard limits (225 ft²) for LH", () => {
    const lh = parseProject({ ...JSON.parse(JSON.stringify(m)), meta: { ...m.meta, hazardClass: "lh" } });
    const r = checkCoverageSpacing(lh);
    expect(r.maxAreaFt2).toBe(225);
    expect(r.overCoverage).toBe(0); // 200 ft² is within LH
  });

  it("sums head coverage and checks it against the protected floor area", () => {
    const r = checkCoverageSpacing(m);
    expect(r.totalCoverageFt2).toBe(420); // 100 + 200 + 120
    expect(r.protectedAreaFt2).toBeUndefined(); // not set → no building check
    const big = parseProject({ ...JSON.parse(JSON.stringify(m)), meta: { ...m.meta, protectedAreaFt2: 1000 } });
    expect(checkCoverageSpacing(big).buildingCoverageOk).toBe(false); // 420 < 1000
    const small = parseProject({ ...JSON.parse(JSON.stringify(m)), meta: { ...m.meta, protectedAreaFt2: 400 } });
    expect(checkCoverageSpacing(small).buildingCoverageOk).toBe(true); // 420 ≥ 400
  });
});
