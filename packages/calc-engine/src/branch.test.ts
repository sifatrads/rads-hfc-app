import { describe, it, expect } from "vitest";
import { solveBranchLine } from "./branch";
import { hazenWilliamsLossPsi, kFactorFlowGpm } from "./hydraulics";

describe("branch-line solver (NFPA tip-to-source)", () => {
  it("matches a step-by-step hand calculation for two K5.6 heads", () => {
    // Most-remote head: 7 psi minimum, K=5.6. 1" Sch.40 (d=1.049, C=120), 10 ft spans.
    const seg = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 10 };
    const res = solveBranchLine([
      { id: "S1", kFactor: 5.6, minPressurePsi: 7.0, segment: seg },
      { id: "S2", kFactor: 5.6, segment: { ...seg } },
    ]);

    // Independent hand trace using the same primitives.
    const p1 = 7.0;
    const q1 = kFactorFlowGpm(5.6, p1);
    const loss1 = hazenWilliamsLossPsi(q1, 120, 1.049, 10);
    const p2 = p1 + loss1;
    const q2 = kFactorFlowGpm(5.6, p2);
    const cum2 = q1 + q2;
    const loss2 = hazenWilliamsLossPsi(cum2, 120, 1.049, 10);
    const pSource = p2 + loss2;

    expect(res.rows[0]!.sprinklerFlowGpm).toBeCloseTo(q1, 8);
    expect(res.rows[1]!.pressurePsi).toBeCloseTo(p2, 8);
    expect(res.rows[1]!.sprinklerFlowGpm).toBeCloseTo(q2, 8);
    expect(res.totalFlowGpm).toBeCloseTo(cum2, 8);
    expect(res.pressureAtSourceConnectionPsi).toBeCloseTo(pSource, 8);
  });

  it("pressure and flow rise toward the source", () => {
    const seg = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 12 };
    const res = solveBranchLine([
      { id: "S1", kFactor: 5.6, minPressurePsi: 7.0, segment: seg },
      { id: "S2", kFactor: 5.6, segment: seg },
      { id: "S3", kFactor: 5.6, segment: seg },
    ]);
    // each successive head sees higher pressure ⇒ higher flow
    expect(res.rows[1]!.sprinklerFlowGpm).toBeGreaterThan(res.rows[0]!.sprinklerFlowGpm);
    expect(res.rows[2]!.sprinklerFlowGpm).toBeGreaterThan(res.rows[1]!.sprinklerFlowGpm);
    expect(res.pressureAtSourceConnectionPsi).toBeGreaterThan(7.0);
    // cumulative flow is the sum of the three head flows
    const sum = res.rows.reduce((a, r) => a + r.sprinklerFlowGpm, 0);
    expect(res.totalFlowGpm).toBeCloseTo(sum, 8);
  });

  it("adds elevation head when the branch rises", () => {
    const flat = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 10 };
    const rising = { ...flat, elevationChangeFt: 10 }; // +4.33 psi
    const flatRes = solveBranchLine([{ id: "S1", kFactor: 5.6, minPressurePsi: 10, segment: flat }]);
    const riseRes = solveBranchLine([{ id: "S1", kFactor: 5.6, minPressurePsi: 10, segment: rising }]);
    expect(riseRes.pressureAtSourceConnectionPsi - flatRes.pressureAtSourceConnectionPsi).toBeCloseTo(4.33, 6);
  });
});
