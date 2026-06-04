import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { solveProject } from "@rads/solve";
import { autoSizeVelocity, autoSizeToPass, economizeSizes } from "./auto-size";

// A 1" feed-main carrying a 200 gpm fixed demand → ~74 ft/s, well over the limit.
const undersized = parseProject({
  schemaVersion: 2,
  meta: { id: "AS", name: "Auto-size test" },
  waterSupply: { type: "city", flowTest: { staticPsi: 80, residualPsi: 60, testFlowGpm: 2000 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "N1", type: "junction", elevationFt: 0, flowGpm: 200 },
    ],
    pipes: [{ id: "P1", from: "SRC", to: "N1", role: "feed-main", nominalSize: "1", material: "steel-sch40", cFactor: 120, lengthFt: 50 }],
    valves: [],
  },
});

describe("autoSizeVelocity", () => {
  it("upsizes pipes until velocity is within the limit", () => {
    expect(solveProject(undersized).results.pipes["P1"]!.velocityFps!).toBeGreaterThan(20); // starts over

    const res = autoSizeVelocity(undersized, 20);
    expect(res.changed).toBeGreaterThanOrEqual(1);
    expect(res.remaining).toBe(0);
    expect(res.model.network.pipes[0]!.nominalSize).not.toBe("1"); // grew

    const v = solveProject(res.model).results.pipes["P1"]!.velocityFps!;
    expect(v).toBeLessThanOrEqual(20);
  });

  it("is a no-op when every pipe is already within the limit", () => {
    const ok = parseProject({
      ...JSON.parse(JSON.stringify(undersized)),
      network: {
        nodes: undersized.network.nodes,
        pipes: [{ id: "P1", from: "SRC", to: "N1", role: "feed-main", nominalSize: "6", material: "steel-sch40", cFactor: 120, lengthFt: 50 }],
        valves: [],
      },
    });
    const res = autoSizeVelocity(ok, 20);
    expect(res.changed).toBe(0);
    expect(res.remaining).toBe(0);
    expect(res.model.network.pipes[0]!.nominalSize).toBe("6");
  });
});

// A weak supply through a long, thin (1") main → required pressure exceeds what
// the supply can deliver, so the system fails until the main is upsized.
const failing = parseProject({
  schemaVersion: 2,
  meta: { id: "AP", name: "Auto-pass test", standardId: "nfpa13", hazardClass: "oh2" },
  designBasis: { minSprinklerPressurePsi: 7, operatingSprinklers: 1, hoseAllowanceGpm: 100 },
  waterSupply: { type: "city", flowTest: { staticPsi: 22, residualPsi: 19, testFlowGpm: 500 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "CM", type: "junction", elevationFt: 0 },
      { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "P0", from: "SRC", to: "CM", role: "feed-main", nominalSize: "1", material: "steel-sch40", cFactor: 120, lengthFt: 220 },
      { id: "P1", from: "CM", to: "S1", role: "branch-line", nominalSize: "1", material: "steel-sch40", cFactor: 120, lengthFt: 10 },
    ],
    valves: [],
  },
});

describe("autoSizeToPass", () => {
  it("upsizes the highest-friction pipes until the system passes", () => {
    const before = solveProject(failing).summary;
    expect(before.passesSupply).toBe(false); // starts short

    const res = autoSizeToPass(failing);
    expect(res.changed).toBeGreaterThanOrEqual(1);
    expect(res.passed).toBe(true);

    const after = solveProject(res.model).summary;
    expect(after.passesSupply).toBe(true);
    expect(after.sourcePressurePsi).toBeLessThan(before.sourcePressurePsi); // required dropped
  });

  it("is a no-op when the system already passes", () => {
    const res = autoSizeToPass(failing);
    const again = autoSizeToPass(res.model); // already adequate now
    expect(again.changed).toBe(0);
    expect(again.passed).toBe(true);
  });
});

// Strong supply + oversized (6") pipes carrying a light demand → passes with a
// huge margin, so the pipes can be trimmed down.
const oversized = parseProject({
  schemaVersion: 2,
  meta: { id: "EC", name: "Economize test", standardId: "nfpa13", hazardClass: "oh2" },
  designBasis: { minSprinklerPressurePsi: 7, operatingSprinklers: 1, hoseAllowanceGpm: 100 },
  waterSupply: { type: "city", flowTest: { staticPsi: 100, residualPsi: 90, testFlowGpm: 2000 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "CM", type: "junction", elevationFt: 0 },
      { id: "S1", type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "P0", from: "SRC", to: "CM", role: "feed-main", nominalSize: "6", material: "steel-sch40", cFactor: 120, lengthFt: 30 },
      { id: "P1", from: "CM", to: "S1", role: "branch-line", nominalSize: "6", material: "steel-sch40", cFactor: 120, lengthFt: 10 },
    ],
    valves: [],
  },
});

describe("economizeSizes", () => {
  it("downsizes an oversized passing design while keeping it passing", () => {
    expect(solveProject(oversized).summary.passesSupply).toBe(true); // starts passing, oversized
    const res = economizeSizes(oversized, 20);
    expect(res.changed).toBeGreaterThanOrEqual(1);
    expect(res.model.network.pipes.some((p) => p.nominalSize !== "6")).toBe(true); // shrank
    const s = solveProject(res.model).summary;
    expect(s.passesSupply && s.meetsMinPressure).toBe(true); // still passes
  });

  it("is a no-op on a non-passing design (only trims a passing system)", () => {
    expect(economizeSizes(failing).changed).toBe(0);
  });
});
