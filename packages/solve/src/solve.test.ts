import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { cValueMultiplier, equivalentLengthModifier } from "@rads/standards-engine";
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

  it("checks the supply margin against a design target margin", () => {
    const base = JSON.parse(JSON.stringify(fmStorage));
    const sBase = solveProject(fmStorage).summary;
    expect(sBase.targetMarginPsi).toBeUndefined(); // no target set → not checked
    // a target below the actual margin passes
    base.designBasis.targetMarginPsi = Math.max(1, sBase.marginPsi - 5);
    expect(solveProject(parseProject(base)).summary.meetsTargetMargin).toBe(true);
    // a target above the actual margin fails
    base.designBasis.targetMarginPsi = sBase.marginPsi + 50;
    const tight = solveProject(parseProject(base)).summary;
    expect(tight.targetMarginPsi).toBe(sBase.marginPsi + 50);
    expect(tight.meetsTargetMargin).toBe(false);
  });

  it("reports peak pipe velocity vs the configured limit (default 20 ft/s)", () => {
    const s = solveProject(fmStorage).summary;
    expect(typeof s.maxVelocityFps).toBe("number");
    expect(s.velocityLimitFps).toBe(20);
    expect(s.velocityOk).toBe(s.maxVelocityFps! <= 20);
    // a tight configured limit flips the pass flag
    const base = JSON.parse(JSON.stringify(fmStorage));
    base.designBasis.maxVelocityFps = 1;
    const tight = solveProject(parseProject(base)).summary;
    expect(tight.velocityLimitFps).toBe(1);
    expect(tight.velocityOk).toBe(false);
  });

  it("increases the design area 30% for a dry / preaction system (NFPA 13 §19.2.3.2)", () => {
    // a long single branch so Auto-Peak fills heads up to the design area
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [];
    let prev = "SRC";
    for (let i = 1; i <= 30; i++) { const id = `S${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }); pipes.push({ id: `P${i}`, from: prev, to: id, role: "branch-line", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 10 }); prev = id; }
    const base = {
      schemaVersion: 2,
      meta: { id: "DRY", name: "dry area", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler", fillType: "wet" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 75, testFlowGpm: 4000 }, firePump: { ratedFlowGpm: 1500, ratedPsi: 130, churnPsi: 150 } },
      network: { nodes, pipes, valves: [] },
    };
    const wet = solveProject(parseProject(base)).summary; // 1500 ft² / 100 ft² = 15 heads
    const dry = solveProject(parseProject({ ...JSON.parse(JSON.stringify(base)), meta: { ...base.meta, fillType: "dry" } })).summary; // 1950 ft² → 20 heads
    expect(wet.dryAreaIncreasePct).toBeUndefined();
    expect(wet.operatingHeads).toBe(15);
    expect(dry.dryAreaIncreasePct).toBe(30);
    expect(dry.operatingHeads).toBe(20);
    expect(dry.designAreaFt2).toBe(1950); // 1500 × 1.3
  });

  it("reduces the design area for quick-response wet LH/OH systems (NFPA 13 §19.2.3.3)", () => {
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [];
    let prev = "SRC";
    for (let i = 1; i <= 30; i++) { const id = `S${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100, response: "quick" }); pipes.push({ id: `P${i}`, from: prev, to: id, role: "branch-line", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 10 }); prev = id; }
    const base = {
      schemaVersion: 2,
      meta: { id: "QR", name: "qr area", standardId: "nfpa13", hazardClass: "oh1", units: "imperial", systemType: "sprinkler", fillType: "wet" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.15, designAreaFt2: 1500, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250, qrAreaReductionPct: 40 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 75, testFlowGpm: 4000 }, firePump: { ratedFlowGpm: 1500, ratedPsi: 130, churnPsi: 150 } },
      network: { nodes, pipes, valves: [] },
    };
    const qr = solveProject(parseProject(base)).summary; // 1500 × 0.6 = 900 ft² → 9 heads
    expect(qr.qrAreaReductionPct).toBe(40);
    expect(qr.designAreaFt2).toBe(900);
    expect(qr.operatingHeads).toBe(9);
    // a dry system ignores the QR reduction (the +30% wins; QR requires wet)
    const dry = solveProject(parseProject({ ...JSON.parse(JSON.stringify(base)), meta: { ...base.meta, fillType: "dry" } })).summary;
    expect(dry.qrAreaReductionPct).toBeUndefined();
    expect(dry.dryAreaIncreasePct).toBe(30);
  });

  it("defaults the water-supply duration by hazard when none is entered (Table 19.3.3.1.2)", () => {
    const mk = (hz: string) => parseProject({
      schemaVersion: 2,
      meta: { id: "D", name: "d", standardId: "nfpa13", hazardClass: hz, units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, operatingSprinklers: 2, minSprinklerPressurePsi: 7 },
      waterSupply: { type: "city", flowTest: { staticPsi: 80, residualPsi: 65, testFlowGpm: 2000 } },
      network: { nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }, { id: "S2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }], pipes: [{ id: "P0", from: "SRC", to: "S1", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }, { id: "P1", from: "S1", to: "S2", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }], valves: [] },
    });
    expect(solveProject(mk("light")).summary.durationMin).toBe(30);
    expect(solveProject(mk("oh2")).summary.durationMin).toBe(60);
    expect(solveProject(mk("eh1")).summary.durationMin).toBe(90);
    const oh = solveProject(mk("oh2")).summary;
    expect(oh.requiredStoredGal).toBe(Math.round(oh.totalDemandGpm * 60)); // appears automatically
  });

  it("adjusts fitting equivalent length for the pipe C-factor + ID (NFPA 13 §27.2.3.1.1)", () => {
    // one pipe with a tee fitting (10 ft eq @ Sch-40 / C=120 for 2")
    const mk = (cFactor: number, internalDiameterIn = 2.067) => parseProject({
      schemaVersion: 2,
      meta: { id: "EQ", name: "eq", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 1, minSprinklerPressurePsi: 7 },
      waterSupply: { type: "city", flowTest: { staticPsi: 100, residualPsi: 90, testFlowGpm: 2000 } },
      network: {
        nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 130 }],
        pipes: [{ id: "P1", from: "SRC", to: "S1", role: "branch-line", nominalSize: "2", internalDiameterIn, cFactor, lengthFt: 10, fittings: [{ type: "tee", qty: 1, equivalentLengthFt: 10 }] }],
        valves: [],
      },
    });
    const eqOf = (cFactor: number, id?: number) => solveProject(mk(cFactor, id)).gga.links["P1"]!.equivalentLengthFt!;
    expect(eqOf(120)).toBeCloseTo(10, 6); // Sch-40 / C=120 → unchanged
    expect(eqOf(150)).toBeCloseTo(10 * cValueMultiplier(150), 4); // C-factor: ≈ 15.1 ft
    expect(eqOf(100)).toBeCloseTo(10 * cValueMultiplier(100), 4); // ≈ 7.1 ft
    // diameter modifier: copper 2" (ID 1.985) at C=120 → ×(1.985/2.067)^4.87
    expect(eqOf(120, 1.985)).toBeCloseTo(10 * equivalentLengthModifier(1.985, "2"), 4);
  });

  it("flags when the required pressure exceeds the component rating (175 psi)", () => {
    // a very long small branch forces a high required source pressure
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [];
    let prev = "SRC";
    for (let i = 1; i <= 8; i++) { const id = `S${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 130 }); pipes.push({ id: `P${i}`, from: prev, to: id, role: "branch-line", nominalSize: "1", internalDiameterIn: 1.049, cFactor: 120, lengthFt: 60 }); prev = id; }
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "HP", name: "high pressure", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 120, residualPsi: 110, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1500, ratedPsi: 200, churnPsi: 230 } },
      network: { nodes, pipes, valves: [] },
    });
    const s = solveProject(m).summary;
    expect(s.componentRatingPsi).toBe(175);
    expect(s.sourcePressurePsi).toBeGreaterThan(175);
    expect(s.withinComponentRating).toBe(false);
  });

  it("reports the density delivered at the most remote sprinkler ≥ design density", () => {
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "DD", name: "delivered density", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 75, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1000, ratedPsi: 110, churnPsi: 130 } },
      network: {
        nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, ...Array.from({ length: 4 }, (_, i) => ({ id: `S${i + 1}`, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }))],
        pipes: Array.from({ length: 4 }, (_, i) => ({ id: `P${i + 1}`, from: i === 0 ? "SRC" : `S${i}`, to: `S${i + 1}`, role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 })),
        valves: [],
      },
    });
    const s = solveProject(m).summary;
    expect(s.designDensityGpmFt2).toBe(0.2);
    expect(s.deliveredDensityGpmFt2).toBeGreaterThanOrEqual(0.2 - 1e-6); // delivers at least the design density
  });

  it("selects a 1.2·√A rectangular remote area across branch lines (NFPA 13 §27.2.4.2.2)", () => {
    // two 8-head branch lines: A off the far cross-main end, B off the near end.
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "CM1", type: "junction", elevationFt: 0 }, { id: "CM2", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [
      { id: "FEED", from: "SRC", to: "CM1", role: "feed-main", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 5 },
      { id: "XM", from: "CM1", to: "CM2", role: "cross-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 100 },
    ];
    for (const [pfx, root] of [["A", "CM2"], ["B", "CM1"]] as const) {
      let prev: string = root;
      for (let i = 1; i <= 8; i++) { const id = `${pfx}${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }); pipes.push({ id: `P-${id}`, from: prev, to: id, role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }); prev = id; }
    }
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "BA", name: "branch area", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 600, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 100, residualPsi: 85, testFlowGpm: 4000 }, firePump: { ratedFlowGpm: 2000, ratedPsi: 140, churnPsi: 160 } },
      network: { nodes, pipes, valves: [] },
    });
    const sol = solveProject(m);
    // 1.2·√600 = 29.4 ft → ceil(29.4/10) = 3 heads/branch; 600 ft² / 100 = 6 heads = 3 from each of the 2 most-remote branches
    expect(sol.summary.operatingHeads).toBe(6);
    expect(sol.summary.designAreaDimFt).toBeCloseTo(1.2 * Math.sqrt(600), 1); // 1.2√A ≈ 29.4 ft
    const flows = (id: string) => (sol.results.nodes[id]?.dischargeGpm ?? 0) > 1;
    const aFlow = ["A1", "A2", "A3", "A4", "A5", "A6", "A7", "A8"].filter(flows).length;
    const bFlow = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"].filter(flows).length;
    expect(aFlow).toBe(3); // capped at 3/branch — NOT all 6 from the most-remote branch
    expect(bFlow).toBe(3); // spread to the adjacent branch line
    expect(flows("A8") && flows("B8")).toBe(true); // the most-remote head on each
  });

  it("compounds sloped / dry / QR design-area adjustments (NFPA 13 §19.3.3.2.8)", () => {
    const mk = (extra: Record<string, unknown>, fillType = "wet") => {
      const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }];
      const pipes: Record<string, unknown>[] = [];
      let prev = "SRC";
      for (let i = 1; i <= 30; i++) { const id = `S${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 }); pipes.push({ id: `P${i}`, from: prev, to: id, role: "branch-line", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 10 }); prev = id; }
      return parseProject({
        schemaVersion: 2,
        meta: { id: "AA", name: "area adj", standardId: "nfpa13", hazardClass: "oh2", units: "imperial", systemType: "sprinkler", fillType },
        designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1000, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250, ...extra },
        waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 100, residualPsi: 85, testFlowGpm: 5000 }, firePump: { ratedFlowGpm: 2000, ratedPsi: 150, churnPsi: 170 } },
        network: { nodes, pipes, valves: [] },
      });
    };
    expect(solveProject(mk({})).summary.operatingHeads).toBe(10); // base 1000/100
    const slope = solveProject(mk({ steepSlope: true })).summary;
    expect(slope.slopeAreaIncreasePct).toBe(30);
    expect(slope.operatingHeads).toBe(13); // ×1.3 = 1300
    const drySlope = solveProject(mk({ steepSlope: true }, "dry")).summary;
    expect(drySlope.dryAreaIncreasePct).toBe(30);
    expect(drySlope.slopeAreaIncreasePct).toBe(30);
    expect(drySlope.operatingHeads).toBe(17); // ×1.69 = 1690
    const qrSlope = solveProject(mk({ steepSlope: true, qrAreaReductionPct: 40 })).summary;
    expect(qrSlope.qrAreaReductionPct).toBe(40);
    expect(qrSlope.slopeAreaIncreasePct).toBe(30);
    expect(qrSlope.operatingHeads).toBe(8); // ×0.6×1.3 = ×0.78 = 780
  });

  it("required stored water = total demand × duration", () => {
    const s = solveProject(fmStorage).summary;
    expect(s.requiredStoredGal).toBe(Math.round(s.totalDemandGpm * 60));
    expect(s.durationMin).toBe(60);
  });

  it("flags stored-water adequacy against the reservoir capacity", () => {
    const req = solveProject(fmStorage).summary.requiredStoredGal!;
    const base = JSON.parse(JSON.stringify(fmStorage));
    const ample = solveProject(parseProject({ ...base, network: { ...base.network, reservoir: { kind: "ground-tank", capacityGal: req + 5000 } } })).summary;
    expect(ample.availableStoredGal).toBe(req + 5000);
    expect(ample.storedWaterAdequate).toBe(true);
    const undersized = solveProject(parseProject({ ...base, network: { ...base.network, reservoir: { kind: "ground-tank", capacityGal: req - 1000 } } })).summary;
    expect(undersized.storedWaterAdequate).toBe(false);
    // no reservoir → adequacy is unknown (undefined)
    expect(solveProject(fmStorage).summary.storedWaterAdequate).toBeUndefined();
  });

  it("fixed-pressure source gives a flat supply curve (gravity / elevated tank)", () => {
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "GT", name: "Gravity tank", standardId: "nfpa13", hazardClass: "oh1", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 2, minSprinklerPressurePsi: 7 },
      waterSupply: { supplyType: "fixed-pressure", fixedPressurePsi: 65 },
      network: {
        nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }, { id: "S2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }],
        pipes: [{ id: "P1", from: "SRC", to: "S1", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }, { id: "P2", from: "S1", to: "S2", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }],
        valves: [],
      },
    });
    // a flat curve → available pressure is the tank head regardless of demand
    expect(solveProject(m).summary.availablePsi).toBeCloseTo(65, 3);
  });

  it("derives the fixed-pressure head from an elevated tank height (no explicit pressure)", () => {
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "ET", name: "Elevated tank", standardId: "nfpa13", hazardClass: "lh", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 1, minSprinklerPressurePsi: 7 },
      waterSupply: { supplyType: "fixed-pressure" }, // no pressure → derive from the tank
      network: {
        nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }],
        pipes: [{ id: "P1", from: "SRC", to: "S1", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 }],
        reservoir: { kind: "elevated-tank", heightFt: 100, baseElevationFt: 0, capacityGal: 30000 },
        valves: [],
      },
    });
    // 100 ft of head × 0.4335 psi/ft ≈ 43.35 psi
    expect(solveProject(m).summary.availablePsi).toBeCloseTo(43.35, 1);
  });

  it("locks the operating set to designBasis.designAreaNodeIds", () => {
    // two branches; auto would flow the far/most-remote, but we pin the near pair.
    const nodes: Record<string, unknown>[] = [{ id: "SRC", type: "junction", elevationFt: 0 }, { id: "J", type: "junction", elevationFt: 0 }];
    const pipes: Record<string, unknown>[] = [{ id: "SUP", from: "SRC", to: "J", role: "feed-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 5 }];
    for (const [pfx, feed] of [["N", 10], ["F", 200]] as const) {
      let prev = "J";
      for (let i = 1; i <= 2; i++) { const id = `${pfx}${i}`; nodes.push({ id, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }); pipes.push({ id: `P-${id}`, from: prev, to: id, role: "branch-line", nominalSize: "1-1/4", internalDiameterIn: 1.38, cFactor: 120, lengthFt: i === 1 ? feed : 10 }); prev = id; }
    }
    const m = parseProject({
      schemaVersion: 2,
      meta: { id: "LK", name: "locked area", standardId: "nfpa13", hazardClass: "oh1", units: "imperial", systemType: "sprinkler" },
      designBasis: { sprinklerKFactor: 5.6, operatingSprinklers: 2, minSprinklerPressurePsi: 7, designAreaNodeIds: ["N1", "N2"] },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 80, residualPsi: 60, testFlowGpm: 2000 }, firePump: { ratedFlowGpm: 1000, ratedPsi: 120, churnPsi: 140 } },
      network: { nodes, pipes, valves: [] },
    });
    const sol = solveProject(m);
    expect(sol.summary.manualDesignArea).toBe(true);
    expect(sol.summary.operatingHeads).toBe(2);
    expect(sol.results.nodes["N1"]!.dischargeGpm).toBeGreaterThan(1); // pinned heads flow
    expect(sol.results.nodes["F1"]!.dischargeGpm ?? 0).toBeLessThan(1); // far heads idle
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
