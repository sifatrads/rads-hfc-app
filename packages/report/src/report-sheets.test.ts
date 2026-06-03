import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { solveProject } from "@rads/solve";
import { reportSheets, summarySheet, pipeWorksheetSheets } from "./index";

const model = parseProject({
  schemaVersion: 2,
  meta: { id: "R1", name: "Report Test", systemType: "sprinkler", standard: "NFPA 13 (2019)", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
  designBasis: { densityGpmFt2: 0.2, designAreaFt2: 1500, sprinklerKFactor: 5.6, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
  waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 72, residualPsi: 53, testFlowGpm: 1944 }, firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 120 } },
  network: {
    nodes: [
      { id: "SRC", type: "junction", elevationFt: 0 },
      { id: "CM", type: "junction", elevationFt: 10 },
      { id: "S1", type: "sprinkler", elevationFt: 10, kFactor: 5.6, coverageAreaFt2: 100 },
      { id: "S2", type: "sprinkler", elevationFt: 10, kFactor: 5.6, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "P0", from: "SRC", to: "CM", role: "riser", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 20, elevationChangeFt: 10 },
      { id: "P1", from: "CM", to: "S1", role: "branch-line", nominalSize: "1-1/4", internalDiameterIn: 1.38, cFactor: 120, lengthFt: 12 },
      { id: "P2", from: "S1", to: "S2", role: "branch-line", nominalSize: "1", internalDiameterIn: 1.049, cFactor: 120, lengthFt: 12 },
    ],
    valves: [],
  },
});

describe("NFPA §27.4 report sheets", () => {
  it("produces the ordered sheet set with valid SVGs", () => {
    const sol = solveProject(model);
    const sheets = reportSheets(model, sol);
    expect(sheets.length).toBeGreaterThanOrEqual(6); // cover, summary, graph, supply, node, pipe
    for (const s of sheets) {
      expect(s.svg.startsWith("<svg")).toBe(true);
      expect(s.svg).toContain("</svg>");
      expect(s.svg).toContain("RADS-HFC-APP"); // attribution
      expect(s.svg).toContain("Page "); // page numbering in the footer
    }
    expect(sheets[0]!.title).toBe("Cover");
    const summary = sheets.find((s) => s.title === "Summary Sheet")!.svg;
    expect(summary).toContain("Summary Sheet");
    expect(summary).toContain("Total demand");
    expect(sheets.some((s) => s.title.includes("Most-Unfavourable"))).toBe(true);
    expect(sheets.some((s) => s.title === "Riser Nameplate")).toBe(true);
  });

  it("adds an FM Storage Scheme sheet only for FM storage (count-at-pressure) runs", () => {
    // non-FM density model → no FM storage sheet
    const plain = reportSheets(model, solveProject(model));
    expect(plain.some((s) => s.title === "FM Storage Scheme")).toBe(false);

    // FM storage model → the scheme sheet appears, naming the scheme line
    const fm = parseProject({
      schemaVersion: 2,
      meta: { id: "FMR", name: "FM ESFR storage", systemType: "sprinkler", standardId: "fmds", units: "imperial" },
      designBasis: { method: "fm-storage", schemeLabel: "ESFR K16.8 — 12 @ 35 psi", operatingSprinklers: 12, minSprinklerPressurePsi: 35, sprinklerKFactor: 16.8, hoseAllowanceGpm: 250, durationMin: 60 },
      waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 90, residualPsi: 70, testFlowGpm: 3000 }, firePump: { ratedFlowGpm: 1500, ratedPsi: 100, churnPsi: 120 } },
      network: {
        nodes: [
          { id: "SRC", type: "junction", elevationFt: 0 },
          { id: "CM", type: "junction", elevationFt: 0 },
          { id: "H1", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
          { id: "H2", type: "sprinkler", elevationFt: 0, kFactor: 16.8, coverageAreaFt2: 100 },
        ],
        pipes: [
          { id: "P0", from: "SRC", to: "CM", role: "feed-main", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 20 },
          { id: "P1", from: "CM", to: "H1", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 },
          { id: "P2", from: "H1", to: "H2", role: "branch-line", nominalSize: "2", internalDiameterIn: 2.067, cFactor: 120, lengthFt: 10 },
        ],
        valves: [],
      },
    });
    const sheet = reportSheets(fm, solveProject(fm)).find((s) => s.title === "FM Storage Scheme");
    expect(sheet).toBeDefined();
    expect(sheet!.svg).toContain("FM Storage Design Scheme");
    expect(sheet!.svg).toContain("16.8");
  });

  it("renders computed flows/pressures into the worksheet", () => {
    const sol = solveProject(model);
    const pages = pipeWorksheetSheets(model, sol);
    expect(pages.length).toBe(1);
    // pipe P1 carries flow → its row shows a gpm value
    expect(pages[0]!.svg).toContain("P1");
    const sum = summarySheet(model, sol).svg;
    expect(sum).toMatch(/gpm/);
  });

  // A realistic, well-sized OH2 system (K5.6 on 1–1¼" branches) → sensible numbers.
  const demo = parseProject({
    schemaVersion: 2,
    meta: { id: "DEMO", name: "Demo OH2 — well-sized", systemType: "sprinkler", standard: "NFPA 13 (2019)", standardId: "nfpa13", hazardClass: "oh2", units: "imperial" },
    designBasis: { densityGpmFt2: 0.2, designAreaFt2: 1500, sprinklerKFactor: 5.6, operatingSprinklers: 12, minSprinklerPressurePsi: 7, hoseAllowanceGpm: 250 },
    waterSupply: { type: "city+fire-pump", flowTest: { staticPsi: 72, residualPsi: 55, testFlowGpm: 2000 }, firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115, overloadFlowGpm: 1125, overloadPsi: 65 } },
    network: (() => {
      const nodes: Record<string, unknown>[] = [
        { id: "BFP-OUT", type: "junction", elevationFt: 0 },
        { id: "BOR", type: "junction", elevationFt: 0 },
        { id: "RTOP", type: "junction", elevationFt: 12 },
      ];
      const pipes: Record<string, unknown>[] = [
        { id: "P-SUP", from: "BFP-OUT", to: "BOR", role: "supply-main", nominalSize: "6", internalDiameterIn: 6.065, cFactor: 120, lengthFt: 30 },
        { id: "P-RIS", from: "BOR", to: "RTOP", role: "riser", nominalSize: "4", internalDiameterIn: 4.026, cFactor: 120, lengthFt: 14, elevationChangeFt: 12 },
        { id: "P-FEED", from: "RTOP", to: "CM-0", role: "feed-main", nominalSize: "3", internalDiameterIn: 3.068, cFactor: 120, lengthFt: 10 },
      ];
      for (let cm = 0; cm < 3; cm++) {
        nodes.push({ id: `CM-${cm}`, type: "junction", elevationFt: 12 });
        if (cm > 0) pipes.push({ id: `P-CM${cm}`, from: `CM-${cm - 1}`, to: `CM-${cm}`, role: "cross-main", nominalSize: "2-1/2", internalDiameterIn: 2.469, cFactor: 120, lengthFt: 10 });
        let prev = `CM-${cm}`;
        for (let s = 1; s <= 4; s++) {
          const id = `S-${cm + 1}-${s}`;
          nodes.push({ id, type: "sprinkler", elevationFt: 12, kFactor: 5.6, coverageAreaFt2: 100, sprinkler: s % 2 ? "pendent" : "upright" });
          pipes.push({ id: `P-${cm + 1}-${s}`, from: prev, to: id, role: "branch-line", nominalSize: s <= 2 ? "1-1/2" : "1-1/4", internalDiameterIn: s <= 2 ? 1.61 : 1.38, cFactor: 120, lengthFt: 10 });
          prev = id;
        }
      }
      return { nodes, pipes, valves: [{ id: "BV-1", type: "butterfly-valve", onPipe: "riser", sizeIn: "4", equivalentLengthFt: 12 }, { id: "CV-1", type: "check-valve", onPipe: "supply-main", sizeIn: "6", equivalentLengthFt: 22 }] };
    })(),
  });

  const out = resolve(process.cwd(), "test_data", "out");
  const haveTestData = existsSync(resolve(process.cwd(), "test_data"));
  it.skipIf(!haveTestData)("writes report sheets for a realistic demo + SPK-001", () => {
    mkdirSync(out, { recursive: true });
    const dsol = solveProject(demo);
    reportSheets(demo, dsol).forEach((s, i) => writeFileSync(join(out, `DEMO.report-${String(i + 1).padStart(2, "0")}-${s.title.replace(/[^a-z0-9]+/gi, "_")}.svg`), s.svg));
    const spk = resolve(process.cwd(), "test_data", "sprinkler", "SPK-001.json");
    if (existsSync(spk)) {
      const m = parseProject(JSON.parse(readFileSync(spk, "utf8")));
      reportSheets(m, solveProject(m)).forEach((s, i) => writeFileSync(join(out, `SPK-001.report-${String(i + 1).padStart(2, "0")}-${s.title.replace(/[^a-z0-9]+/gi, "_")}.svg`), s.svg));
    }
    // realistic system: required pressure modest, supply adequate
    expect(dsol.summary.sourcePressurePsi).toBeLessThan(120);
    expect(dsol.summary.passesSupply).toBe(true);
    expect(dsol.summary.systemFlowGpm).toBeGreaterThan(0);
  });
});
