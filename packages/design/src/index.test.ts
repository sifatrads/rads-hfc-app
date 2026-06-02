import { describe, it, expect } from "vitest";
import { runDesign } from "./index";
import { cityCurve } from "@rads/calc-engine";

const seg = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 12 };

describe("density/area design runner (NFPA 13)", () => {
  it("runs a single-branch OH1 remote area end-to-end", () => {
    const density = 0.15; // OH1
    const coverage = 130;
    const res = runDesign({
      standardId: "nfpa13",
      hazardClassId: "oh1",
      sprinklers: [
        { id: "S1", kFactor: 5.6, coverageAreaFt2: coverage, segment: seg },
        { id: "S2", kFactor: 5.6, coverageAreaFt2: coverage, segment: seg },
        { id: "S3", kFactor: 5.6, coverageAreaFt2: coverage, segment: seg },
        { id: "S4", kFactor: 5.6, coverageAreaFt2: coverage, segment: { cFactor: 120, internalDiameterIn: 2.067, lengthFt: 20 } },
      ],
      feedMain: { cFactor: 120, internalDiameterIn: 2.067, lengthFt: 50 },
      supply: cityCurve({ staticPsi: 75, residualPsi: 55, testFlowGpm: 1500 }),
      marginOptions: { minMarginPsi: 5 },
    });

    const remoteMinFlow = density * coverage; // 19.5 gpm
    expect(res.designDensityGpmFt2).toBe(0.15);
    expect(res.designAreaFt2).toBe(1500);
    expect(res.remoteSprinklerMinPressurePsi).toBeCloseTo((remoteMinFlow / 5.6) ** 2, 6);
    // remote sprinkler discharges exactly the minimum density flow
    expect(res.sprinklers[0]!.flowGpm).toBeCloseTo(remoteMinFlow, 4);
    expect(res.sprinklers[0]!.densityGpmFt2).toBeCloseTo(0.15, 4);
    // every sprinkler meets (or exceeds) the required density
    expect(res.meetsDensity).toBe(true);
    expect(res.minDensityAchievedGpmFt2).toBeGreaterThanOrEqual(0.15 - 1e-6);
    expect(res.sprinklers[3]!.flowGpm).toBeGreaterThan(res.sprinklers[0]!.flowGpm); // nearer source flows more

    // hose allowance OH1 = 250; total demand = system + hose
    expect(res.hoseAllowanceGpm).toBe(250);
    expect(res.totalDemandGpm).toBeCloseTo(res.systemFlowGpm + 250, 6);
    // required source pressure exceeds the remote min (friction + elevation + feed main)
    expect(res.requiredSourcePressurePsi).toBeGreaterThan(res.remoteSprinklerMinPressurePsi);

    // supply check populated and self-consistent
    expect(res.supply).toBeDefined();
    expect(res.supply!.demandGpm).toBeCloseTo(res.totalDemandGpm, 6);
    expect(res.supply!.requiredPsi).toBeCloseTo(res.requiredSourcePressurePsi, 6);
    expect(typeof res.passes).toBe("boolean");
  });

  it("flags an inadequate supply (tall riser + heavy hazard + weak city)", () => {
    const res = runDesign({
      standardId: "nfpa13",
      hazardClassId: "eh2", // 0.40 density + 500 gpm hose
      sprinklers: [
        { id: "S1", kFactor: 11.2, coverageAreaFt2: 100, segment: seg },
        { id: "S2", kFactor: 11.2, coverageAreaFt2: 100, segment: seg },
        { id: "S3", kFactor: 11.2, coverageAreaFt2: 100, segment: seg },
      ],
      // 100 ft riser ⇒ +43.3 psi of static head the supply must overcome
      feedMain: { cFactor: 120, internalDiameterIn: 4.026, lengthFt: 20, elevationChangeFt: 100 },
      supply: cityCurve({ staticPsi: 50, residualPsi: 40, testFlowGpm: 500 }),
    });
    expect(res.meetsDensity).toBe(true); // sprinklers themselves meet density
    expect(res.requiredSourcePressurePsi).toBeGreaterThan(50); // elevation dominates
    expect(res.supply).toBeDefined();
    // weak city (≈35 psi at this flow) can't meet ≈57 psi required ⇒ fails
    expect(res.supply!.passes).toBe(false);
    expect(res.passes).toBe(false);
  });

  it("throws for an unknown hazard class", () => {
    expect(() =>
      runDesign({
        standardId: "nfpa13",
        hazardClassId: "nope",
        sprinklers: [{ id: "S1", kFactor: 5.6, coverageAreaFt2: 100, segment: seg }],
      }),
    ).toThrow(/design density/i);
  });
});
