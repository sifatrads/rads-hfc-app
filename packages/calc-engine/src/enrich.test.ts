import { describe, it, expect } from "vitest";
import { solveGga, hwPipeLink, emitterLink, type GgaNetwork } from "./gga";
import { solveBranchLine } from "./branch";
import { velocityPressurePsi } from "./hydraulics";

describe("GGA result enrichment", () => {
  it("splits friction vs elevation, reports Pv/Pn, discharge, and ~zero imbalance", () => {
    const net: GgaNetwork = {
      nodes: [
        { id: "SRC", fixed: true, headPsi: 60, elevationFt: 0 },
        { id: "J", elevationFt: 10 },
        { id: "SINK", fixed: true, headPsi: 0, elevationFt: 10 },
      ],
      links: [
        { ...hwPipeLink("P1", "SRC", "J", { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 20 }), nominalSize: "1", cFactorUsed: 120, lengthFt: 20, equivalentLengthFt: 0 },
        emitterLink("E1", "J", "SINK", 5.6),
      ],
    };
    const r = solveGga(net);
    expect(r.converged).toBe(true);

    const p1 = r.links["P1"]!;
    // GGA head loss is pure friction; total = friction + elevation(0.433·Δz)
    expect(p1.frictionLossPsi).toBeCloseTo(p1.headlossPsi, 9);
    expect(p1.elevationLossPsi).toBeCloseTo(0.433 * 10, 6); // SRC(0) → J(10)
    expect(p1.totalLossPsi).toBeCloseTo(p1.frictionLossPsi + p1.elevationLossPsi, 9);
    expect(p1.velocityFps).toBeGreaterThan(0);
    expect(p1.velocityPressurePsi).toBeCloseTo(velocityPressurePsi(p1.flowGpm, 1.049), 6);
    expect(p1.nominalSize).toBe("1");
    expect(p1.cFactorUsed).toBe(120);

    const j = r.nodes["J"]!;
    expect(j.elevationFt).toBe(10);
    expect(j.normalPressurePsi).toBeCloseTo(j.pressurePsi - (j.velocityPressurePsi ?? 0), 6);
    expect(j.dischargeGpm).toBeCloseTo(r.links["E1"]!.flowGpm, 6); // emitter draw at J

    expect(r.maxImbalanceGpm).toBeLessThan(1e-3); // continuity holds
  });
});

describe("branch worksheet enrichment", () => {
  it("segment loss = friction + elevation and Pn = Pt − Pv", () => {
    const res = solveBranchLine([
      { id: "S1", kFactor: 5.6, minPressurePsi: 7, segment: { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 12, equivalentLengthFt: 2, elevationChangeFt: 3 } },
      { id: "S2", kFactor: 5.6, segment: { cFactor: 120, internalDiameterIn: 1.38, lengthFt: 12 } },
    ]);
    const row = res.rows[0]!;
    expect(row.frictionLossPsi + row.elevationLossPsi).toBeCloseTo(row.segmentLossPsi, 9);
    expect(row.elevationLossPsi).toBeCloseTo(0.433 * 3, 6);
    expect(row.totalLengthFt).toBe(14); // 12 + 2 equiv
    expect(row.equivalentLengthFt).toBe(2);
    expect(row.normalPressurePsi).toBeCloseTo(row.pressurePsi - row.velocityPressurePsi, 9);
    expect(row.frictionPsiPerFt).toBeGreaterThan(0);
  });
});
