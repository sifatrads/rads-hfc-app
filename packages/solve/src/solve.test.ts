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
  it("throws on an unsolvable network instead of returning fake zeros", () => {
    const empty = parseProject({ schemaVersion: 2, meta: { id: "E", name: "Empty" }, network: { nodes: [], pipes: [], valves: [] } });
    expect(() => solveProject(empty)).toThrow(/nothing to solve/i);
    const noPipes = parseProject({ schemaVersion: 2, meta: { id: "N", name: "No pipes" }, network: { nodes: [{ id: "1", type: "junction" }], pipes: [], valves: [] } });
    expect(() => solveProject(noPipes)).toThrow(/nothing to solve/i);
  });

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

// FM DS 8-9 storage = count-at-pressure: the N most-remote heads are held at the
// scheme's minimum end-head pressure. A 3-branch / 6-head tree makes the
// most-remote selection observable (the 2 nearest heads must stay dry).
const fmStorage = parseProject({
  schemaVersion: 2,
  meta: { id: "FM", name: "FM ESFR storage", systemType: "sprinkler", standardId: "fmds", units: "imperial" },
  designBasis: { method: "fm-storage", operatingSprinklers: 4, minSprinklerPressurePsi: 50, sprinklerKFactor: 16.8, hoseAllowanceGpm: 250, durationMin: 60 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 70, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1500, ratedPsi: 100, churnPsi: 120 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "CM1", type: "junction", elevationFt: 0 },
      { id: "CM2", type: "junction", elevationFt: 0 },
      { id: "CM3", type: "junction", elevationFt: 0 },
      { id: "A1", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
      { id: "A2", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
      { id: "B1", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
      { id: "B2", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
      { id: "C1", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
      { id: "C2", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "F0", from: "SRC", to: "CM1", role: "feed-main", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 20 },
      { id: "X1", from: "CM1", to: "CM2", role: "cross-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 20 },
      { id: "X2", from: "CM2", to: "CM3", role: "cross-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 20 },
      { id: "A0", from: "CM1", to: "A1", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
      { id: "AA", from: "A1", to: "A2", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
      { id: "B0", from: "CM2", to: "B1", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
      { id: "BB", from: "B1", to: "B2", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
      { id: "C0", from: "CM3", to: "C1", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
      { id: "CC", from: "C1", to: "C2", role: "branch-line", nominalSize: "1-1/2", internalDiameterIn: 1.61, cFactor: 120, lengthFt: 8 },
    ],
    valves: [],
  },
});

describe("NFPA 750 water mist (all nozzles flow)", () => {
  const mist = parseProject({
    schemaVersion: 2,
    meta: { id: "WM", name: "Water mist", systemType: "water-mist", standardId: "nfpa750", units: "metric" },
    designBasis: { minSprinklerPressurePsi: 175, operatingSprinklers: 1, frictionMethod: "darcy-weisbach" },
    waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 200, residualPsi: 180, testFlowGpm: 500 }, firePump: { ratedFlowGpm: 200, ratedPsi: 250, churnPsi: 300 } },
    network: {
      nodes: [
        { id: "SRC", type: "junction", elevationFt: 0 },
        { id: "CM", type: "junction", elevationFt: 0 },
        { id: "M1", type: "sprinkler", elevationFt: 0, kFactor: 1.4, coverageAreaFt2: 50 },
        { id: "M2", type: "sprinkler", elevationFt: 0, kFactor: 1.4, coverageAreaFt2: 50 },
        { id: "M3", type: "sprinkler", elevationFt: 0, kFactor: 1.4, coverageAreaFt2: 50 },
      ],
      pipes: [
        { id: "P0", from: "SRC", to: "CM", role: "feed-main", nominalSize: "1", material: "stainless-sch10", cFactor: 120, lengthFt: 20 },
        { id: "P1", from: "CM", to: "M1", role: "branch-line", nominalSize: "1/2", material: "stainless-sch10", cFactor: 120, lengthFt: 8 },
        { id: "P2", from: "M1", to: "M2", role: "branch-line", nominalSize: "1/2", material: "stainless-sch10", cFactor: 120, lengthFt: 8 },
        { id: "P3", from: "M2", to: "M3", role: "branch-line", nominalSize: "1/2", material: "stainless-sch10", cFactor: 120, lengthFt: 8 },
      ],
      valves: [],
    },
  });

  it("opens every nozzle in the zone (ignores the operating-head count)", () => {
    const s = solveProject(mist).summary;
    expect(s.operatingHeads).toBe(3); // all 3 flow despite operatingSprinklers: 1
    expect(s.systemFlowGpm).toBeGreaterThan(0);
  });
});

describe("FM DS 8-9 storage (count-at-pressure)", () => {
  it("opens the N most-remote heads and holds them at the scheme minimum pressure", () => {
    const s = solveProject(fmStorage).summary;
    // N = 4 design heads
    expect(s.operatingHeads).toBe(4);
    // most-remote design head sits at the scheme minimum (binary search target)
    expect(s.minSprinklerPressurePsi).toBe(50);
    expect(s.meetsMinPressure).toBe(true);
    expect(s.mostRemoteSprinkler!.pressurePsi).toBeCloseTo(50, 0);
    // Q = K·√P at the governing head; system flow ≥ N·K·√50 (closer heads run higher)
    expect(s.mostRemoteSprinkler!.flowGpm).toBeCloseTo(16.8 * Math.sqrt(50), 0);
    expect(s.systemFlowGpm).toBeGreaterThanOrEqual(4 * 16.8 * Math.sqrt(50) - 1);
  });

  it("selects the 4 farthest heads — the 2 nearest branch heads stay dry", () => {
    const sol = solveProject(fmStorage);
    const dry = (id: string) => (sol.results.nodes[id]?.dischargeGpm ?? 0) < 1;
    const flowing = (id: string) => (sol.results.nodes[id]?.dischargeGpm ?? 0) > 1;
    expect(dry("A1")).toBe(true); // nearest branch
    expect(dry("A2")).toBe(true);
    expect(flowing("B1") && flowing("B2") && flowing("C1") && flowing("C2")).toBe(true);
  });

  it("required stored water = total demand × duration", () => {
    const s = solveProject(fmStorage).summary;
    expect(s.requiredStoredGal).toBe(Math.round(s.totalDemandGpm * 60));
    expect(s.durationMin).toBe(60);
  });

  it("a stray density does not inflate the scheme minimum pressure (method guard)", () => {
    const withDensity = parseProject({
      ...JSON.parse(JSON.stringify(fmStorage)),
      designBasis: { method: "fm-storage", operatingSprinklers: 4, minSprinklerPressurePsi: 50, sprinklerKFactor: 16.8, hoseAllowanceGpm: 250, durationMin: 60, densityGpmFt2: 2.0 },
    });
    // density 2.0×100/16.8 → 141 psi if it leaked in; the guard keeps it at 50
    expect(solveProject(withDensity).summary.minSprinklerPressurePsi).toBe(50);
  });
});
