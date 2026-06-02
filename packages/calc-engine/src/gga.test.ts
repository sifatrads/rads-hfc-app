import { describe, it, expect } from "vitest";
import { solveGga, hwResistance, hwPipeLink, emitterLink, HW_EXPONENT, type GgaNetwork } from "./gga";
import { solveBranchLine } from "./branch";
import { kFactorFlowGpm, hazenWilliamsLossPsi } from "./hydraulics";

describe("GGA nodal solver", () => {
  it("single pipe + emitter matches the closed-form supply solution", () => {
    // Source fixed at 50 psi; one sprinkler (K=5.6) fed by a pipe. Find P at the head.
    const seg = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 20 };
    const net: GgaNetwork = {
      nodes: [
        { id: "SRC", fixed: true, headPsi: 50 },
        { id: "n1" },
        { id: "sink", fixed: true, headPsi: 0 },
      ],
      links: [
        hwPipeLink("p1", "SRC", "n1", seg),
        emitterLink("e1", "n1", "sink", 5.6),
      ],
    };
    const g = solveGga(net);
    expect(g.converged).toBe(true);

    // Closed form: 50 = P + hL(K√P) where hL uses cumulative flow = the head flow.
    // Solve by fixed-point iteration independently.
    let P = 25;
    for (let i = 0; i < 200; i++) {
      const q = kFactorFlowGpm(5.6, P);
      const hl = hazenWilliamsLossPsi(q, 120, 1.049, 20);
      P = 50 - hl;
    }
    const q = kFactorFlowGpm(5.6, P);
    expect(g.nodes["n1"]!.pressurePsi).toBeCloseTo(P, 3);
    expect(g.links["e1"]!.flowGpm).toBeCloseTo(q, 3);
    expect(Math.abs(g.links["p1"]!.flowGpm)).toBeCloseTo(q, 3); // pipe carries the head flow
  });

  it("reproduces the exact branch-line solver on a 3-head tree", () => {
    const seg = { cFactor: 120, internalDiameterIn: 1.049, lengthFt: 12 };
    // Oracle: remote head at 7 psi → required source pressure + flows.
    const branch = solveBranchLine([
      { id: "S1", kFactor: 5.6, minPressurePsi: 7, segment: seg }, // most remote
      { id: "S2", kFactor: 5.6, segment: seg },
      { id: "S3", kFactor: 5.6, segment: seg },
    ]);

    const r = hwResistance(seg.cFactor, seg.internalDiameterIn, seg.lengthFt);
    // Topology: SRC —p3— n3(S3) —p2— n2(S2) —p1— n1(S1, remote). Emitters at n1,n2,n3 → sink.
    const net: GgaNetwork = {
      nodes: [
        { id: "SRC", fixed: true, headPsi: branch.pressureAtSourceConnectionPsi },
        { id: "n1" },
        { id: "n2" },
        { id: "n3" },
        { id: "sink", fixed: true, headPsi: 0 },
      ],
      links: [
        { id: "p3", from: "SRC", to: "n3", resistance: r, exponent: HW_EXPONENT, internalDiameterIn: seg.internalDiameterIn },
        { id: "p2", from: "n3", to: "n2", resistance: r, exponent: HW_EXPONENT, internalDiameterIn: seg.internalDiameterIn },
        { id: "p1", from: "n2", to: "n1", resistance: r, exponent: HW_EXPONENT, internalDiameterIn: seg.internalDiameterIn },
        emitterLink("e1", "n1", "sink", 5.6),
        emitterLink("e2", "n2", "sink", 5.6),
        emitterLink("e3", "n3", "sink", 5.6),
      ],
    };

    const g = solveGga(net);
    expect(g.converged).toBe(true);

    // GGA pressures at the heads must equal the branch oracle's pressures.
    expect(g.nodes["n1"]!.pressurePsi).toBeCloseTo(branch.rows[0]!.pressurePsi, 2); // ≈ 7
    expect(g.nodes["n2"]!.pressurePsi).toBeCloseTo(branch.rows[1]!.pressurePsi, 2);
    expect(g.nodes["n3"]!.pressurePsi).toBeCloseTo(branch.rows[2]!.pressurePsi, 2);
    // Sprinkler flows match.
    expect(g.links["e1"]!.flowGpm).toBeCloseTo(branch.rows[0]!.sprinklerFlowGpm, 2);
    expect(g.links["e2"]!.flowGpm).toBeCloseTo(branch.rows[1]!.sprinklerFlowGpm, 2);
    expect(g.links["e3"]!.flowGpm).toBeCloseTo(branch.rows[2]!.sprinklerFlowGpm, 2);
    // Total system flow into the main matches.
    expect(Math.abs(g.links["p3"]!.flowGpm)).toBeCloseTo(branch.totalFlowGpm, 2);
  });

  it("conserves mass at every junction", () => {
    const seg = { cFactor: 120, internalDiameterIn: 2.067, lengthFt: 15 };
    const net: GgaNetwork = {
      nodes: [
        { id: "SRC", fixed: true, headPsi: 60 },
        { id: "a" },
        { id: "b" },
        { id: "sink", fixed: true, headPsi: 0 },
      ],
      links: [
        hwPipeLink("p1", "SRC", "a", seg),
        hwPipeLink("p2", "a", "b", seg),
        emitterLink("ea", "a", "sink", 8.0),
        emitterLink("eb", "b", "sink", 8.0),
      ],
    };
    const g = solveGga(net);
    expect(g.converged).toBe(true);
    // node a: in (p1) = out (p2) + emitter ea
    const inA = g.links["p1"]!.flowGpm;
    const outA = g.links["p2"]!.flowGpm + g.links["ea"]!.flowGpm;
    expect(inA).toBeCloseTo(outA, 4);
    // node b: in (p2) = emitter eb
    expect(g.links["p2"]!.flowGpm).toBeCloseTo(g.links["eb"]!.flowGpm, 4);
  });

  it("splits flow evenly across a symmetric loop", () => {
    // Source → (two identical parallel pipes) → demand node with one emitter.
    const seg = { cFactor: 120, internalDiameterIn: 1.61, lengthFt: 25 };
    const net: GgaNetwork = {
      nodes: [
        { id: "SRC", fixed: true, headPsi: 55 },
        { id: "mid" },
        { id: "sink", fixed: true, headPsi: 0 },
      ],
      links: [
        hwPipeLink("up", "SRC", "mid", seg),
        hwPipeLink("down", "SRC", "mid", seg), // identical parallel path
        emitterLink("e", "mid", "sink", 11.2),
      ],
    };
    const g = solveGga(net);
    expect(g.converged).toBe(true);
    // identical parallel pipes carry equal flow
    expect(g.links["up"]!.flowGpm).toBeCloseTo(g.links["down"]!.flowGpm, 4);
    // their sum feeds the emitter
    expect(g.links["up"]!.flowGpm + g.links["down"]!.flowGpm).toBeCloseTo(g.links["e"]!.flowGpm, 4);
  });
});
