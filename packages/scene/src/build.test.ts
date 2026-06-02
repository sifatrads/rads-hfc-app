import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { buildScene, colorize, formatterFor } from "./index";

const sample = parseProject({
  schemaVersion: 2,
  meta: { id: "T1", name: "Test", systemType: "sprinkler", standardId: "nfpa13", units: "imperial" },
  designBasis: { densityGpmFt2: 0.2 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 72, residualPsi: 53, testFlowGpm: 1944 }, firePump: { listed: "NFPA 20", ratedFlowGpm: 750, ratedPsi: 93 } },
  network: {
    nodes: [
      { id: "BFP-OUT", type: "junction", elevationFt: 0 },
      { id: "CM-0", type: "junction", elevationFt: 12 },
      { id: "S-1", type: "sprinkler", elevationFt: 12, kFactor: 5.6, coverageAreaFt2: 100, sprinkler: "pendent" },
    ],
    pipes: [
      { id: "P-1", from: "BFP-OUT", to: "CM-0", role: "feed-main", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, material: "black-steel-wet", lengthFt: 20 },
      { id: "P-2", from: "CM-0", to: "S-1", role: "branch-line", nominalSize: "1", internalDiameterIn: 1.049, cFactor: 120, lengthFt: 15 },
    ],
    valves: [{ id: "BV-1", type: "butterfly-valve", onPipe: "feed-main", sizeIn: "4", equivalentLengthFt: 12 }],
  },
});

describe("buildScene", () => {
  it("builds nodes, pipes, devices, equipment, and labels with 3D anchors", () => {
    const scene = buildScene(sample);
    expect(scene.nodes).toHaveLength(3);
    expect(scene.pipes).toHaveLength(2);
    expect(scene.devices).toHaveLength(1);
    expect(scene.devices[0]?.symbol).toBe("valve-butterfly");
    // source + fire pump from waterSupply
    expect(scene.equipment.map((e) => e.kind).sort()).toEqual(["pump", "source"]);
    // pipe size in mm for stroke scaling
    expect(scene.pipes.find((p) => p.id === "P-1")?.sizeMm).toBe(65);
    // every label anchor is finite 3D
    for (const l of scene.labels) {
      expect(Number.isFinite(l.anchor.x) && Number.isFinite(l.anchor.y) && Number.isFinite(l.anchor.z)).toBe(true);
    }
    // categories present without calc: pipeNo, nodeNo, pipeSize, valve, source, pump
    const cats = new Set(scene.labels.map((l) => l.category));
    for (const c of ["pipeNo", "nodeNo", "pipeSize", "valve", "source", "pump"]) expect(cats.has(c as never)).toBe(true);
  });

  it("attaches calc results and emits flow/velocity/pressure labels", () => {
    const scene = buildScene(sample, {
      results: {
        nodes: { "S-1": { totalPressurePsi: 12.3, normalPressurePsi: 12.0, dischargeGpm: 19.6 } },
        pipes: { "P-2": { flowGpm: 19.6, velocityFps: 7.3, frictionLossPsi: 1.1, totalLossPsi: 1.1 } },
      },
    });
    const cats = new Set(scene.labels.map((l) => l.category));
    expect(cats.has("pressureTotal")).toBe(true);
    expect(cats.has("velocity")).toBe(true);
    expect(cats.has("pressureDrop")).toBe(true);
  });

  it("colorizes by role and size (categorical) and flags needsCalc for velocity without results", () => {
    const scene = buildScene(sample);
    const role = colorize(scene, "role");
    expect(role.legend.kind).toBe("categorical");
    expect(role.pipeColors.get("P-2")).toBe("#78909c"); // branch-line
    const size = colorize(scene, "size");
    expect(size.legend.entries.length).toBeGreaterThan(0);
    const vel = colorize(scene, "velocity");
    expect(vel.legend.needsCalc).toBe(true);
  });

  it("converts imperial-stored values to metric for display", () => {
    const imp = formatterFor("imperial");
    expect(imp.len(10)).toBe("10 ft");
    expect(imp.pressure(7)).toBe("7 psi");
    expect(imp.flow(100)).toBe("100 gpm");
    const met = formatterFor("metric");
    expect(met.len(3.28084)).toBe("1 m"); // 3.28 ft → 1 m
    expect(met.pressure(14.5038)).toBe("1 bar"); // 14.5 psi → 1 bar
    expect(met.flow(264.172)).toBe("1000 L/min"); // 264 gpm → 1000 L/min
  });

  it("colorizes velocity as a gradient when results are present", () => {
    const scene = buildScene(sample, { results: { pipes: { "P-1": { velocityFps: 4 }, "P-2": { velocityFps: 12 } } } });
    const vel = colorize(scene, "velocity");
    expect(vel.legend.needsCalc).toBeFalsy();
    expect(vel.pipeColors.get("P-1")).not.toBe(vel.pipeColors.get("P-2"));
  });

  // Local-only: every sample builds a scene with finite label anchors.
  const testDataDir = resolve(process.cwd(), "test_data");
  const dirs = ["sprinkler", "standpipe"].map((d) => join(testDataDir, d));
  const hasSamples = existsSync(testDataDir) && dirs.some((d) => existsSync(d));
  it.skipIf(!hasSamples)("builds a scene for every sample", () => {
    let files = 0;
    for (const dir of dirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const scene = buildScene(parseProject(JSON.parse(readFileSync(join(dir, f), "utf8"))));
        expect(scene.pipes.length, f).toBeGreaterThan(0);
        expect(scene.labels.length, f).toBeGreaterThan(0);
        for (const l of scene.labels) expect(Number.isFinite(l.anchor.x), `${f}:${l.id}`).toBe(true);
        files++;
      }
    }
    expect(files).toBeGreaterThanOrEqual(60);
  });
});
