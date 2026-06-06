import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { compareDesignAreas } from "./design-areas";

// Two 4-head branches off one junction: one near the source (10 ft feed), one
// far (200 ft feed). With a 4-head design area, the far branch must govern.
const twoBranch = parseProject({
  schemaVersion: 2,
  meta: { id: "DA", name: "Design areas", systemType: "sprinkler", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
  designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 4, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 0 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 100, residualPsi: 90, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1000, ratedPsi: 120, churnPsi: 140 } },
  network: (() => {
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "J", type: "junction", elevationFt: 0 }, { id: "CMN", type: "junction", elevationFt: 0 }, { id: "CMF", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [
      { id: "SUP", from: "SRC", to: "J", role: "supply-main", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 5 },
      { id: "FN", from: "J", to: "CMN", role: "feed-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 10 },
      { id: "FF", from: "J", to: "CMF", role: "feed-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 200 },
    ];
    for (const [pfx, cm] of [["N", "CMN"], ["F", "CMF"]] as const) {
      let prev: string = cm;
      for (let i = 1; i <= 4; i++) { const id = `${pfx}${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }); pipes.push({ id: `P-${id}`, from: prev, to: id, role: "branch-line", nominalSize: "1-1/4", internalDiameterIn: 1.38, cFactor: 120, lengthFt: 10 }); prev = id; }
    }
    return { nodes, pipes, valves: [] };
  })(),
});

describe("compareDesignAreas", () => {
  it("ranks candidate remote areas by required pressure, far area governing", () => {
    const areas = compareDesignAreas(twoBranch);
    expect(areas.length).toBeGreaterThanOrEqual(2); // near + far areas
    // governing (first) requires the most pressure and is the far branch
    expect(areas[0]!.anchor).toMatch(/^F/);
    expect(areas[0]!.sourcePressurePsi).toBeGreaterThan(areas[areas.length - 1]!.sourcePressurePsi);
    // sorted descending by required pressure
    for (let i = 1; i < areas.length; i++) expect(areas[i - 1]!.sourcePressurePsi).toBeGreaterThanOrEqual(areas[i]!.sourcePressurePsi);
    expect(areas[0]!.heads).toBe(4);
  });

  it("returns [] when only one design area is possible", () => {
    const single = parseProject({
      schemaVersion: 2,
      meta: { id: "S1", name: "single", standardId: "nfpa13", units: "imperial" },
      designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 4, minSprinklerPressurePsi: 7 },
      waterSupply: { type: "city", flowTest: { staticPsi: 80, residualPsi: 70, testFlowGpm: 2000 } },
      network: {
        nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }, { id: "S2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }],
        pipes: [{ id: "P0", from: "SRC", to: "S1", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }, { id: "P1", from: "S1", to: "S2", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }],
        valves: [],
      },
    });
    expect(compareDesignAreas(single)).toEqual([]); // 2 heads ≤ 4 operating → one area
  });
});
