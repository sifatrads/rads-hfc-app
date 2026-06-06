/**
 * End-to-end regression harness — exercises the full pipeline on a realistic
 * RMG design (NFPA 13 · OH2 · RSC governing · city+pump · elevated tank · all
 * configurable criteria) and asserts the solve, the §27.4 report and the
 * machine-readable compliance summary stay mutually consistent. Locks in the
 * design-criteria + report + handoff work so a regression in any one surface
 * trips here.
 */
import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { solveProject } from "@rads/solve";
import { reportSheets } from "@rads/report";
import { buildComplianceSummary } from "./compliance-export";

const model = parseProject({
  schemaVersion: 2,
  meta: { id: "RMG-INT", name: "Integration Factory", systemType: "sprinkler", standardId: "nfpa13", standard: "NFPA 13 (2019)", hazardClass: "oh2", units: "imperial", governingCode: "rsc", engineer: "QA", date: "2026-06-06", designNotes: "Loading-dock antifreeze loop excluded.\nSeismic bracing by others." },
  designBasis: { sprinklerKFactor: 5.6, densityGpmFt2: 0.2, designAreaFt2: 1500, operatingSprinklers: 4, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250, durationMin: 60, maxVelocityFps: 20, targetMarginPsi: 10 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 75, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1000, ratedPsi: 120, churnPsi: 140 } },
  network: {
    nodes: [{ id: "SRC", type: "junction", elevationFt: 0 }, ...Array.from({ length: 6 }, (_, i) => ({ id: `S${i + 1}`, type: "sprinkler", elevationFt: 0, kFactor: 5.6, coverageAreaFt2: 120 }))],
    pipes: Array.from({ length: 6 }, (_, i) => ({ id: `P${i + 1}`, from: i === 0 ? "SRC" : `S${i}`, to: `S${i + 1}`, role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 })),
    reservoir: { kind: "ground-tank", capacityGal: 60000 },
    valves: [],
  },
});

describe("end-to-end: solve → report → compliance summary", () => {
  const sol = solveProject(model);
  const sheets = reportSheets(model, sol);
  const cc = buildComplianceSummary(model, sol);

  it("produces a complete, navigable report", () => {
    const titles = sheets.map((s) => s.title);
    expect(titles[0]).toBe("Cover");
    expect(titles[1]).toBe("Contents");
    for (const t of ["Basis of Design", "Compliance Checklist", "Riser Nameplate", "Critical Path", "Report of Utilities"]) expect(titles).toContain(t);
    for (const s of sheets) { expect(s.svg).toContain("<svg"); expect(s.svg.length).toBeGreaterThan(500); }
    // the TOC names every sheet (SVG text escapes &, <, > etc.)
    const esc = (str: string) => str.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
    const toc = sheets[1]!.svg;
    for (const t of titles) expect(toc).toContain(esc(t));
  });

  it("the compliance summary matches the solve", () => {
    const s = sol.summary;
    expect(cc.schema).toBe("rads-hfc-compliance/1");
    expect(cc.demand.requiredSourcePressurePsi).toBeCloseTo(s.sourcePressurePsi, 1);
    expect(cc.supply.passesSupply).toBe(s.passesSupply);
    expect(cc.designBasis.operatingSprinklers).toBe(s.operatingHeads);
    expect(cc.references?.verified).toBe(true); // NFPA 13 grounded
    expect(cc.jurisdiction?.code).toBe("RSC");
    expect(cc.project.designNotes).toContain("excluded");
    // every configurable criterion is present
    expect(typeof cc.result.velocityOk).toBe("boolean");
    expect(typeof cc.supply.storedWaterAdequate).toBe("boolean");
    expect(typeof cc.supply.meetsTargetMargin).toBe("boolean");
    expect(typeof cc.result.withinComponentRating).toBe("boolean");
    expect(cc.result.componentRatingPsi).toBe(175);
    expect(cc.designBasis.deliveredDensityGpmFt2).toBeGreaterThanOrEqual((cc.designBasis.densityGpmFt2 ?? 0) - 1e-4);
    expect(cc.designAreaProof).not.toBeNull();
    // JSON round-trips with no NaN / non-finite leaks
    const round = JSON.parse(JSON.stringify(cc));
    expect(round.schema).toBe("rads-hfc-compliance/1");
    for (const v of [cc.demand.requiredSourcePressurePsi, cc.supply.availablePsi, cc.supply.marginPsi, cc.designBasis.minSprinklerPressurePsi]) expect(Number.isFinite(v)).toBe(true);
  });

  it("an overall PASS implies every sub-check passes (coherence)", () => {
    expect(cc.result.pass).toBe(true); // the model is sized to pass everything
    expect(cc.supply.passesSupply).toBe(true);
    expect(cc.result.meetsMinPressure).toBe(true);
    expect(cc.coverageSpacing.overCoverage).toBe(0);
    expect(cc.coverageSpacing.overSpacing).toBe(0);
    expect(cc.result.velocityOk).not.toBe(false);
    expect(cc.supply.storedWaterAdequate).toBe(true);
    expect(cc.supply.meetsTargetMargin).toBe(true);
    expect(cc.result.withinComponentRating).toBe(true);
  });
});
