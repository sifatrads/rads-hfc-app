import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { solveProject } from "./solve";

const tree = parseProject({
  schemaVersion: 2,
  meta: { id: "T", name: "Solve test", systemType: "sprinkler", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
  designBasis: { minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
  waterSupply: { type: "city", flowTest: { staticPsi: 70, residualPsi: 50, testFlowGpm: 1500 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "CM", type: "junction", elevationFt: 0 },
      { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 },
      { id: "S2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "P0", from: "SRC", to: "CM", role: "feed-main", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 40 },
      { id: "P1", from: "CM", to: "S1", role: "branch-line", nominalSize: "1", internalDiameterIn: 1.049, cFactor: 120, lengthFt: 12 },
      { id: "P2", from: "S1", to: "S2", role: "branch-line", nominalSize: "1", internalDiameterIn: 1.049, cFactor: 120, lengthFt: 12 },
    ],
    valves: [],
  },
});

describe("solveProject", () => {
  it("solves the network to a converged operating point", () => {
    const sol = solveProject(tree);
    expect(sol.summary.converged).toBe(true);
    expect(sol.summary.systemFlowGpm).toBeGreaterThan(0);
    expect(sol.gga.maxImbalanceGpm).toBeLessThan(1); // mass continuity
    expect(Object.keys(sol.results.pipes).length).toBe(3);
    expect(sol.results.nodes["S1"]?.totalPressurePsi).toBeDefined();
  });

  it("emitter discharge obeys Q = K·√P at each sprinkler", () => {
    const sol = solveProject(tree);
    const r = sol.summary.mostRemoteSprinkler!;
    expect(r).toBeDefined();
    expect(r.pressurePsi).toBeGreaterThan(0);
    expect(r.flowGpm).toBeCloseTo(5.6 * Math.sqrt(r.pressurePsi), 1);
    // pipe carrying both heads has more flow than the tip pipe
    expect(sol.results.pipes["P1"]!.flowGpm!).toBeGreaterThan(sol.results.pipes["P2"]!.flowGpm!);
  });

  it("a fire pump improves the supply margin (required pressure is design-driven)", () => {
    const withPump = parseProject({
      ...JSON.parse(JSON.stringify(tree)),
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 70, residualPsi: 50, testFlowGpm: 1500 }, firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 120 } },
    });
    const a = solveProject(tree).summary;
    const b = solveProject(withPump).summary;
    // required source pressure (design) is the same; the pump raises availability → bigger margin
    expect(b.sourcePressurePsi).toBeCloseTo(a.sourcePressurePsi, 0);
    expect(b.marginPsi).toBeGreaterThan(a.marginPsi);
  });

  // Local-only: every sprinkler sample solves with populated results.
  const dirs = ["sprinkler"].map((d) => resolve(process.cwd(), "test_data", d));
  const has = dirs.some((d) => existsSync(d));
  it.skipIf(!has)("solves generated sprinkler samples", () => {
    let n = 0;
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).slice(0, 10)) {
        const sol = solveProject(parseProject(JSON.parse(readFileSync(join(dir, f), "utf8"))));
        expect(sol.summary.converged, f).toBe(true);
        expect(sol.summary.mostRemoteSprinkler, f).toBeDefined();
        expect(sol.gga.maxImbalanceGpm, f).toBeLessThan(2);
        n++;
      }
    }
    expect(n).toBeGreaterThan(0);
  });
});
