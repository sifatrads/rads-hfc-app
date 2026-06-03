import { describe, it, expect } from "vitest";
import { solveProject } from "@rads/solve";
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

  it("setNodeGeometryInModel pins a node so auto-layout honours it", () => {
    const out = setNodeGeometryInModel(line3(), "3", { x: 42, y: 7, z: 10 });
    const n3 = out.network.nodes.find((n) => n.id === "3")!;
    expect(n3.geometry).toEqual({ x: 42, y: 7, z: 10 });
    expect(out.network.nodes.length).toBe(3); // no nodes added; ids unchanged
    expect(out.network.pipes.length).toBe(2);
  });
});
