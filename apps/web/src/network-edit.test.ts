import { describe, it, expect } from "vitest";
import { solveProject } from "@rads/solve";
import { parseFittingCodes } from "@rads/standards-engine";
import { encodeJSON, decodeJSON } from "@rads/container";
import { parseProject } from "@rads/model";
import { newProject, renumberNetwork, normalizePipe, internalDiameterFor, withModel, splitPipeInModel, deleteNodeInModel, deletePipeInModel, addBranchInModel, addPipeBetweenInModel, setNodeGeometryInModel } from "./network-edit";
import type { NetworkNode, Pipe } from "@rads/model";

describe("in-app data entry → solve", () => {
  it("newProject is schema-valid with node 1 as source", () => {
    const m = newProject("2026-06-03T00:00:00.000Z");
    expect(m.network.nodes[0]!.id).toBe("1");
    expect(m.network.pipes.length).toBe(0);
  });

  it("renumberNetwork normalizes ids and remaps pipe refs", () => {
    const nodes: NetworkNode[] = [
      { id: "src", type: "junction", elevationFt: 0, fittings: [] } as unknown as NetworkNode,
      { id: "a", type: "sprinkler", elevationFt: 10, kFactor: 5.6, fittings: [] } as unknown as NetworkNode,
    ];
    const pipes: Pipe[] = [{ id: "x", from: "src", to: "a", role: "branch-line", nominalSize: "1", lengthFt: 10, fittings: [] }];
    const r = renumberNetwork(nodes, pipes);
    expect(r.nodes.map((n) => n.id)).toEqual(["1", "2"]);
    expect(r.pipes[0]!.id).toBe("P-1");
    expect(r.pipes[0]!.from).toBe("1");
    expect(r.pipes[0]!.to).toBe("2");
  });

  it("normalizePipe fills Sch-40 ID from nominal size", () => {
    expect(normalizePipe({ id: "P1", from: "1", to: "2", nominalSize: "1-1/4", lengthFt: 5, fittings: [] }).internalDiameterIn).toBe(internalDiameterFor("1-1/4"));
  });

  it("a hand-entered branch (5 nodes) solves to sensible numbers", () => {
    let m = newProject("2026-06-03T00:00:00.000Z");
    const nodes: NetworkNode[] = [m.network.nodes[0]!];
    const pipes: Pipe[] = [];
    nodes.push({ id: "2", type: "junction", elevationFt: 10, fittings: [] } as unknown as NetworkNode);
    pipes.push({ id: "P-1", from: "1", to: "2", role: "riser", nominalSize: "2", lengthFt: 10, elevationChangeFt: 10, direction: "U", fittings: [] });
    let prev = "2";
    for (let s = 1; s <= 4; s++) {
      const id = String(2 + s);
      nodes.push({ id, type: "sprinkler", elevationFt: 10, kFactor: 5.6, coverageAreaFt2: 100, fittings: [] } as unknown as NetworkNode);
      pipes.push({ id: `P-${s + 1}`, from: prev, to: id, role: "branch-line", nominalSize: s <= 2 ? "1-1/4" : "1", lengthFt: 10, direction: "E", fittings: [] });
      prev = id;
    }
    m = withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 4 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    const sol = solveProject(m);
    expect(sol.summary.systemFlowGpm).toBeGreaterThan(0);
    expect(sol.summary.sourcePressurePsi).toBeGreaterThan(7);
    expect(sol.summary.mostRemoteSprinkler).toBeDefined();
    expect(Object.keys(sol.results.pipes)).toContain("P-2");
  });

  it("saves + reloads a full project (.rhfc round-trip) with pump / valves / reservoir / suction", async () => {
    let m = newProject("2026-06-03T00:00:00.000Z");
    m = withModel(m, {
      network: {
        ...m.network,
        valves: [{ id: "V-1", type: "check-valve", onPipe: "P-1", sizeIn: "4", equivalentLengthFt: 22 }],
        reservoir: { kind: "ground-tank", capacityGal: 20000, heightFt: 12 },
        suction: { sizeIn: 6, lengthFt: 20, cFactor: 140, liftFt: 0, fittings: [] },
        pump: { datasheet: { make: "Patterson", ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115 }, ratedCurve: [{ flowGpm: 0, psi: 115 }, { flowGpm: 750, psi: 100 }], shopTest: [] },
      },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 70, residualPsi: 55, testFlowGpm: 1500 }, firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115 } },
    });
    const back = parseProject(await decodeJSON(await encodeJSON(m)));
    expect(back.network.pump?.datasheet?.ratedFlowGpm).toBe(750);
    expect(back.network.pump?.ratedCurve?.length).toBe(2);
    expect(back.network.reservoir?.capacityGal).toBe(20000);
    expect(back.network.suction?.sizeIn).toBe(6);
    expect(back.network.valves[0]!.type).toBe("check-valve");
  });

  // Build a 3-node line (1→2→3) to exercise the click-to-edit ops.
  const line3 = () => {
    let m = newProject("2026-06-03T00:00:00.000Z");
    const nodes: NetworkNode[] = [
      m.network.nodes[0]!,
      { id: "2", type: "junction", elevationFt: 10, fittings: [] } as unknown as NetworkNode,
      { id: "3", type: "sprinkler", elevationFt: 10, kFactor: 5.6, fittings: [] } as unknown as NetworkNode,
    ];
    const pipes: Pipe[] = [
      { id: "P-1", from: "1", to: "2", role: "riser", nominalSize: "2", lengthFt: 20, elevationChangeFt: 10, direction: "U", fittings: [] },
      { id: "P-2", from: "2", to: "3", role: "branch-line", nominalSize: "1", lengthFt: 10, direction: "E", fittings: [] },
    ];
    return withModel(m, { network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
  };

  it("splitPipeInModel inserts a node and halves length/elevation", () => {
    const out = splitPipeInModel(line3(), "P-1", 0.5);
    expect(out.network.nodes.length).toBe(4); // 3 + inserted
    expect(out.network.pipes.length).toBe(3); // P-1 (riser) became two
    const halves = out.network.pipes.filter((p) => p.role === "riser"); // the two halves of the 20-ft riser
    expect(halves.length).toBe(2);
    expect(halves.every((p) => Math.abs((p.lengthFt ?? 0) - 10) < 1e-6)).toBe(true);
    expect(halves.every((p) => Math.abs((p.elevationChangeFt ?? 0) - 5) < 1e-6)).toBe(true);
  });

  it("deleteNodeInModel removes the node and its pipes, renumbering 1..N", () => {
    const out = deleteNodeInModel(line3(), "2"); // middle node → both pipes go
    expect(out.network.nodes.length).toBe(2);
    expect(out.network.pipes.length).toBe(0);
    expect(out.network.nodes.map((n) => n.id)).toEqual(["1", "2"]);
  });

  it("deletePipeInModel removes one pipe, keeps nodes", () => {
    const out = deletePipeInModel(line3(), "P-2");
    expect(out.network.pipes.map((p) => p.id)).toEqual(["P-1"]);
    expect(out.network.nodes.length).toBe(3);
  });

  it("addBranchInModel extends a node with a new head + pipe (U sets elevation)", () => {
    const m = line3(); // node 3 at elev 10
    const up = addBranchInModel(m, "3", { direction: "U", lengthFt: 8, nominalSize: "1", nodeType: "sprinkler" });
    expect(up.network.nodes.length).toBe(4);
    expect(up.network.pipes.length).toBe(3);
    const added = up.network.nodes[up.network.nodes.length - 1]!;
    expect(added.type).toBe("sprinkler");
    expect(added.elevationFt).toBe(18); // 10 + 8 up
    const pipe = up.network.pipes[up.network.pipes.length - 1]!;
    expect(pipe.direction).toBe("U");
    expect(pipe.elevationChangeFt).toBe(8);
    expect(pipe.nominalSize).toBe("1");
  });

  it("addPipeBetweenInModel connects two nodes (and is a no-op for duplicates/self)", () => {
    const m = line3(); // 1→2→3
    const out = addPipeBetweenInModel(m, "1", "3", { lengthFt: 25, nominalSize: "2", role: "cross-main" });
    expect(out.network.pipes.length).toBe(3); // P-1, P-2 + the new 1↔3 connection
    const added = out.network.pipes.find((p) => (p.from === "1" && p.to === "3") || (p.from === "3" && p.to === "1"))!;
    expect(added.lengthFt).toBe(25);
    expect(added.internalDiameterIn).toBe(internalDiameterFor("2"));
    // duplicate (already 1→2) and self-connect are no-ops
    expect(addPipeBetweenInModel(m, "1", "2", { lengthFt: 5, nominalSize: "1" }).network.pipes.length).toBe(2);
    expect(addPipeBetweenInModel(m, "2", "2", { lengthFt: 5, nominalSize: "1" }).network.pipes.length).toBe(2);
  });

  it("pipe material changes the hydraulic result (copper vs steel)", () => {
    const base = (material: string) => {
      let m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [
        m.network.nodes[0]!,
        { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode,
      ];
      const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "1", material, lengthFt: 50, fittings: [] }];
      return withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 1 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    const steel = solveProject(base("steel-sch40"));
    const copper = solveProject(base("copper-l"));
    // copper's higher C (150 vs 120) dominates → lower required source pressure
    expect(copper.summary.sourcePressurePsi).toBeLessThan(steel.summary.sourcePressurePsi);
    // and the pipe carries the material's internal diameter into the result
    expect(steel.results.pipes["P-1"]).toBeDefined();
  });

  it("a pipe's fixed pressure-drop adds a constant loss to the demand", () => {
    const build = (drop?: number) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [m.network.nodes[0]!, { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode];
      const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "2", lengthFt: 5, ...(drop ? { fixedDropPsi: drop } : {}), fittings: [] }];
      return withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 1 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    const base = solveProject(build());
    const withDrop = solveProject(build(10));
    // a 10-psi backflow-preventer-style drop raises the required source pressure by ~10 psi
    expect(withDrop.summary.sourcePressurePsi - base.summary.sourcePressurePsi).toBeCloseTo(10, 0);
    expect(withDrop.summary.converged).toBe(true);
  });

  it("additional length adds to the effective pipe length", () => {
    const build = (addl?: number) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [m.network.nodes[0]!, { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode];
      const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "1", lengthFt: 20, ...(addl ? { additionalLengthFt: addl } : {}), fittings: [] }];
      return withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 1 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build(30)).summary.sourcePressurePsi).toBeGreaterThan(solveProject(build()).summary.sourcePressurePsi);
  });

  it("normalizePipe keeps a manual ID override but otherwise recomputes from material+size", () => {
    const overridden = normalizePipe({ id: "P1", from: "1", to: "2", nominalSize: "2", material: "steel-sch40", idOverride: true, internalDiameterIn: 1.5, lengthFt: 10, fittings: [] });
    expect(overridden.internalDiameterIn).toBe(1.5);
    const auto = normalizePipe({ id: "P1", from: "1", to: "2", nominalSize: "2", material: "steel-sch40", internalDiameterIn: 1.5, lengthFt: 10, fittings: [] });
    expect(auto.internalDiameterIn).toBeCloseTo(2.067, 3);
  });

  it("a dry system derates the steel C-factor (100 vs 120)", () => {
    const build = (fillType: string) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [m.network.nodes[0]!, { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode];
      const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "1", material: "steel-sch40", lengthFt: 100, fittings: [] }];
      return withModel(m, { meta: { ...m.meta, fillType }, designBasis: { ...m.designBasis, operatingSprinklers: 1 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build("dry")).summary.sourcePressurePsi).toBeGreaterThan(solveProject(build("wet")).summary.sourcePressurePsi);
  });

  it("a fixed-flow (hose/hydrant) node adds demand drawn through the source", () => {
    const build = (hose?: number) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [
        m.network.nodes[0]!,
        { id: "2", type: "hose-station", elevationFt: 0, ...(hose ? { flowGpm: hose } : {}), fittings: [] } as unknown as NetworkNode,
        { id: "3", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode,
      ];
      const pipes: Pipe[] = [
        { id: "P-1", from: "1", to: "2", role: "feed-main", nominalSize: "2", lengthFt: 50, fittings: [] },
        { id: "P-2", from: "2", to: "3", role: "branch-line", nominalSize: "1", lengthFt: 20, fittings: [] },
      ];
      return withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 1 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build(250)).summary.sourcePressurePsi).toBeGreaterThan(solveProject(build()).summary.sourcePressurePsi);
  });

  it("Auto-Peak derives the operating-head count + density flow from the design area", () => {
    const m = newProject("2026-06-03T00:00:00.000Z");
    const nodes: NetworkNode[] = [m.network.nodes[0]!];
    const pipes: Pipe[] = [];
    let prev = "1";
    for (let i = 2; i <= 21; i++) {
      nodes.push({ id: String(i), type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100, fittings: [] } as unknown as NetworkNode);
      pipes.push({ id: `P-${i}`, from: prev, to: String(i), role: "branch-line", nominalSize: "1", lengthFt: 10, fittings: [] });
      prev = String(i);
    }
    // 20 heads × 100 ft²; design area 1500 ft² and NO operatingSprinklers → Auto-Peak picks 15.
    const model = withModel(m, { designBasis: { densityGpmFt2: 0.1, designAreaFt2: 1500, sprinklerKFactor: 5.6, minSprinklerPressurePsi: 7 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    const sol = solveProject(model);
    expect(sol.summary.operatingHeads).toBe(15);
    expect(sol.summary.requiredHeadFlowGpm).toBeCloseTo(10, 3); // 0.1 gpm/ft² × 100 ft²
    expect(sol.summary.designAreaFt2).toBe(1500);
  });

  it("parses fitting codes into equivalent lengths", () => {
    const f = parseFittingCodes("2E 1T", "2"); // 2": elbow-90 = 5 ft, tee = 8 ft
    expect(f.find((x) => x.type === "elbow-90")!.qty).toBe(2);
    expect(f.find((x) => x.type === "elbow-90")!.equivalentLengthFt).toBeCloseTo(10, 1);
    expect(f.find((x) => x.type === "tee")!.equivalentLengthFt).toBeCloseTo(8, 1);
  });

  it("auto-fittings adds an elbow at a direction change", () => {
    const build = (auto: boolean) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [
        m.network.nodes[0]!,
        { id: "2", type: "junction", elevationFt: 0, fittings: [] } as unknown as NetworkNode,
        { id: "3", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode,
      ];
      const pipes: Pipe[] = [
        { id: "P-1", from: "1", to: "2", role: "feed-main", nominalSize: "1", lengthFt: 10, direction: "E", fittings: [] },
        { id: "P-2", from: "2", to: "3", role: "branch-line", nominalSize: "1", lengthFt: 10, direction: "N", fittings: [] },
      ];
      return withModel(m, { designBasis: { ...m.designBasis, operatingSprinklers: 1, autoFittings: auto }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build(true)).summary.sourcePressurePsi).toBeGreaterThan(solveProject(build(false)).summary.sourcePressurePsi);
  });

  it("NFPA 20 flags a fast pump suction velocity at 150% flow", () => {
    const m = newProject("2026-06-03T00:00:00.000Z");
    const nodes: NetworkNode[] = [m.network.nodes[0]!, { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode];
    const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "1", lengthFt: 10, fittings: [] }];
    const model = withModel(m, {
      designBasis: { ...m.designBasis, operatingSprinklers: 1 },
      network: { ...m.network, nodes, pipes: pipes.map(normalizePipe), suction: { sizeIn: 6, lengthFt: 20, material: "ductile-iron", fittings: [] }, pump: { datasheet: { ratedFlowGpm: 1000, ratedPsi: 100, churnPsi: 120 } } },
    });
    const c = solveProject(model).summary.suctionCheck!;
    expect(c).toBeDefined();
    expect(c.atFlowGpm).toBeCloseTo(1500, 0); // 150% of 1000
    expect(c.velocityFps).toBeGreaterThan(15);
    expect(c.ok).toBe(false);
  });

  it("NFPA 14 standpipe mode sizes for residual at the most-remote hose connection", () => {
    let m = newProject("2026-06-03T00:00:00.000Z");
    m = withModel(m, { meta: { ...m.meta, systemType: "standpipe", standpipeClass: "I" } });
    const nodes: NetworkNode[] = [
      m.network.nodes[0]!,
      { id: "2", type: "junction", elevationFt: 0, fittings: [] } as unknown as NetworkNode,
      { id: "3", type: "hose-station", elevationFt: 100, fittings: [] } as unknown as NetworkNode, // most-remote (tall riser)
      { id: "4", type: "hose-station", elevationFt: 50, fittings: [] } as unknown as NetworkNode,
    ];
    const pipes: Pipe[] = [
      { id: "P-1", from: "1", to: "2", role: "feed-main", nominalSize: "6", lengthFt: 10, fittings: [] },
      { id: "P-2", from: "2", to: "3", role: "standpipe-riser", nominalSize: "4", lengthFt: 100, elevationChangeFt: 100, direction: "U", fittings: [] },
      { id: "P-3", from: "2", to: "4", role: "standpipe-riser", nominalSize: "4", lengthFt: 50, elevationChangeFt: 50, direction: "U", fittings: [] },
    ];
    const sol = solveProject(withModel(m, { network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } }));
    expect(sol.summary.operatingHeads).toBe(2); // two hose connections
    expect(sol.summary.systemFlowGpm).toBeCloseTo(750, 0); // 500 (most-remote) + 250
    expect(sol.summary.minSprinklerPressurePsi).toBe(100); // Class I residual
    expect(sol.summary.converged).toBe(true);
    expect(sol.summary.mostRemoteSprinkler!.pressurePsi).toBeGreaterThan(99); // held at ~100 psi
  });

  it("residential codes set the design-head count (13D = 2, 13R = 4)", () => {
    const build = (standardId: string) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [m.network.nodes[0]!];
      const pipes: Pipe[] = [];
      let prev = "1";
      for (let i = 2; i <= 11; i++) {
        nodes.push({ id: String(i), type: "sprinkler", elevationFt: 0, kFactor: 4.9, coverageAreaFt2: 100, fittings: [] } as unknown as NetworkNode);
        pipes.push({ id: `P-${i}`, from: prev, to: String(i), role: "branch-line", nominalSize: "1", lengthFt: 8, fittings: [] });
        prev = String(i);
      }
      // no operatingSprinklers / designAreaFt2 → the standard's residential count governs
      return withModel(m, { meta: { ...m.meta, standardId }, designBasis: { sprinklerKFactor: 4.9, minSprinklerPressurePsi: 7 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build("nfpa13d")).summary.operatingHeads).toBe(2);
    expect(solveProject(build("nfpa13r")).summary.operatingHeads).toBe(4);
  });

  it("NFPA 15 deluge flows every nozzle (no remote area)", () => {
    const build = (deluge: boolean) => {
      const m = newProject("2026-06-03T00:00:00.000Z");
      const nodes: NetworkNode[] = [m.network.nodes[0]!];
      const pipes: Pipe[] = [];
      let prev = "1";
      for (let i = 2; i <= 9; i++) {
        nodes.push({ id: String(i), type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 100, fittings: [] } as unknown as NetworkNode);
        pipes.push({ id: `P-${i}`, from: prev, to: String(i), role: "branch-line", nominalSize: "1", lengthFt: 8, fittings: [] });
        prev = String(i);
      }
      // designAreaFt2 200 with 100-ft² heads → Auto-Peak would pick 2; deluge picks all 8
      return withModel(m, { meta: { ...m.meta, ...(deluge ? { fillType: "deluge" } : {}) }, designBasis: { densityGpmFt2: 0.2, designAreaFt2: 200, sprinklerKFactor: 5.6 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } });
    };
    expect(solveProject(build(false)).summary.operatingHeads).toBe(2); // area-density subset
    expect(solveProject(build(true)).summary.operatingHeads).toBe(8); // all nozzles
  });

  it("computes required stored water = total demand × supply duration", () => {
    const m = newProject("2026-06-03T00:00:00.000Z");
    const nodes: NetworkNode[] = [m.network.nodes[0]!, { id: "2", type: "sprinkler", elevationFt: 0, kFactor: 5.6, fittings: [] } as unknown as NetworkNode];
    const pipes: Pipe[] = [{ id: "P-1", from: "1", to: "2", role: "branch-line", nominalSize: "1", lengthFt: 10, fittings: [] }];
    const sol = solveProject(withModel(m, { designBasis: { operatingSprinklers: 1, hoseAllowanceGpm: 100, durationMin: 60, minSprinklerPressurePsi: 7 }, network: { ...m.network, nodes, pipes: pipes.map(normalizePipe) } }));
    expect(sol.summary.durationMin).toBe(60);
    expect(sol.summary.requiredStoredGal).toBe(Math.round(sol.summary.totalDemandGpm * 60));
  });

  it("setNodeGeometryInModel pins a node so auto-layout honours it", () => {
    const out = setNodeGeometryInModel(line3(), "3", { x: 42, y: 7, z: 10 });
    const n3 = out.network.nodes.find((n) => n.id === "3")!;
    expect(n3.geometry).toEqual({ x: 42, y: 7, z: 10 });
    expect(out.network.nodes.length).toBe(3); // no nodes added; ids unchanged
    expect(out.network.pipes.length).toBe(2);
  });
});
