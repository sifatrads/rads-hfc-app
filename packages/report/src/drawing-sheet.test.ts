import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { buildScene } from "@rads/scene";
import { renderDrawingSheetSvg } from "./index";

const inline = parseProject({
  schemaVersion: 2,
  meta: { id: "T1", name: "Inline Test", systemType: "sprinkler", standardId: "nfpa13", units: "imperial" },
  network: {
    nodes: [
      { id: "BFP-OUT", type: "junction", elevationFt: 0 },
      { id: "CM-0", type: "junction", elevationFt: 12 },
      { id: "S-1", type: "sprinkler", elevationFt: 12, kFactor: 5.6, coverageAreaFt2: 100 },
      { id: "S-2", type: "sprinkler", elevationFt: 12, kFactor: 5.6, coverageAreaFt2: 100 },
    ],
    pipes: [
      { id: "P-1", from: "BFP-OUT", to: "CM-0", role: "feed-main", nominalSize: "2-1/2", lengthFt: 20 },
      { id: "P-2", from: "CM-0", to: "S-1", role: "branch-line", nominalSize: "1", lengthFt: 12 },
      { id: "P-3", from: "S-1", to: "S-2", role: "branch-line", nominalSize: "1", lengthFt: 12 },
    ],
    valves: [{ id: "BV-1", type: "butterfly-valve", onPipe: "feed-main", sizeIn: "4" }],
  },
});

describe("renderDrawingSheetSvg", () => {
  it("renders a valid A3 SVG with pipes, labels, legend, title block", () => {
    const svg = renderDrawingSheetSvg(buildScene(inline), { paper: "A3", view: "iso", colorMetric: "size" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("</svg>");
    expect(svg).toContain("RADS-HFC-APP"); // attribution
    expect(svg).toContain("<line"); // pipes
    expect(svg).toContain("Pipe size"); // legend title for size metric
    expect(svg).toContain("Inline Test"); // title block
  });

  it("supports plan and elevation views and every paper size", () => {
    for (const view of ["plan", "front", "iso"] as const) {
      for (const paper of ["A4", "A3", "A2", "A1", "A0"] as const) {
        const svg = renderDrawingSheetSvg(buildScene(inline), { paper, view });
        expect(svg.startsWith("<svg")).toBe(true);
      }
    }
  });

  // Local-only: write labeled sheets for visual review.
  const root = resolve(process.cwd(), "test_data");
  const spk = join(root, "sprinkler", "SPK-001.json");
  it.skipIf(!existsSync(spk))("writes SPK-001 sheets (A3 + A0) for visual review", () => {
    const scene = buildScene(parseProject(JSON.parse(readFileSync(spk, "utf8"))));
    const out = join(root, "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "SPK-001.sheet-A3.svg"), renderDrawingSheetSvg(scene, { paper: "A3", view: "iso", colorMetric: "size" }));
    writeFileSync(join(out, "SPK-001.sheet-A0.svg"), renderDrawingSheetSvg(scene, { paper: "A0", view: "iso", colorMetric: "role" }));
    writeFileSync(join(out, "SPK-001.sheet-plan.svg"), renderDrawingSheetSvg(scene, { paper: "A3", view: "plan", colorMetric: "size" }));
    expect(existsSync(join(out, "SPK-001.sheet-A3.svg"))).toBe(true);
  });
});
