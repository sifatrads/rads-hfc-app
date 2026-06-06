import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { compareSupplyScenarios } from "./supply-scenarios";

const withPump = parseProject({
  schemaVersion: 2,
  meta: { id: "SR", name: "Supply robustness", systemType: "sprinkler", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
  designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, operatingSprinklers: 4, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 60, residualPsi: 45, testFlowGpm: 1500 }, firePump: { ratedFlowGpm: 1000, ratedPsi: 110, churnPsi: 130 } },
  network: {
    nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ id: `S${i + 1}`, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }))],
    pipes: Array.from({ length: 6 }, (_, i) => ({ id: `P${i + 1}`, from: i === 0 ? "SRC" : `S${i}`, to: `S${i + 1}`, role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 })),
    valves: [],
  },
});

describe("compareSupplyScenarios", () => {
  it("includes a pump-off and a degraded scenario, each with less available pressure", () => {
    const sc = compareSupplyScenarios(withPump);
    expect(sc[0]!.label).toBe("As designed");
    const off = sc.find((x) => x.label === "Fire pump off")!;
    const deg = sc.find((x) => x.label === "Supply −15%")!;
    expect(off).toBeTruthy();
    expect(deg).toBeTruthy();
    // removing the pump / weakening the city lowers the available pressure
    expect(off.availablePsi).toBeLessThan(sc[0]!.availablePsi);
    expect(deg.availablePsi).toBeLessThan(sc[0]!.availablePsi);
  });

  it("omits the pump-off scenario when there is no pump", () => {
    const noPump = parseProject({ ...JSON.parse(JSON.stringify(withPump)), waterSupply: { type: "city", flowTest: { staticPsi: 90, residualPsi: 75, testFlowGpm: 3000 } } });
    const sc = compareSupplyScenarios(noPump);
    expect(sc.some((x) => x.label === "Fire pump off")).toBe(false);
    expect(sc.some((x) => x.label === "Supply −15%")).toBe(true);
  });
});
