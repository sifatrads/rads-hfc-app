import { describe, it, expect } from "vitest";
import { solveProject } from "@rads/solve";
import { newProject, renumberNetwork, normalizePipe, internalDiameterFor, withModel } from "./network-edit";
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
});
