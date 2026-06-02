import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseDxf, analyzeDxf, defaultMapping, importNetwork } from "./index";

const INLINE = [
  "0", "SECTION", "2", "ENTITIES",
  "0", "LINE", "8", "PIPE", "10", "0", "20", "0", "30", "0", "11", "1000", "21", "0", "31", "0",
  "0", "LINE", "8", "PIPE", "10", "1000", "20", "0", "30", "0", "11", "1000", "21", "0", "31", "500",
  "0", "CIRCLE", "8", "HEAD", "10", "1000", "20", "0", "30", "500", "40", "50",
  "0", "TEXT", "8", "SIZE", "10", "500", "20", "0", "30", "0", "1", "50",
  "0", "TEXT", "8", "NODEID", "10", "0", "20", "0", "30", "0", "1", "1",
  "0", "TEXT", "8", "NODEID", "10", "1000", "20", "0", "30", "0", "1", "2",
  "0", "TEXT", "8", "NODEID", "10", "1000", "20", "0", "30", "500", "1", "3",
  "0", "TEXT", "8", "COVER", "10", "1000", "20", "0", "30", "500", "1", "11.00m2",
  "0", "ENDSEC", "0", "EOF",
].join("\n");

describe("DXF import", () => {
  it("parses entities and classifies layer roles", () => {
    const a = analyzeDxf(parseDxf(INLINE));
    expect(a.lineCount).toBe(2);
    expect(a.circleCount).toBe(1);
    expect(a.is3D).toBe(true);
    const role = (n: string) => a.layers.find((l) => l.name === n)?.guessedRole;
    expect(role("PIPE")).toBe("pipes");
    expect(role("HEAD")).toBe("heads");
    expect(role("SIZE")).toBe("pipe-size");
    expect(role("NODEID")).toBe("node-id");
    expect(role("COVER")).toBe("coverage");
  });

  it("builds a network with true 3D geometry, ids, sizes, and heads", () => {
    const doc = parseDxf(INLINE);
    const { model, stats } = importNetwork(doc, defaultMapping(analyzeDxf(doc), { sourceUnit: "mm" }));
    expect(stats.pipes).toBe(2);
    expect(stats.nodes).toBe(3);
    expect(stats.heads).toBe(1);
    // node ids read from text
    expect(model.network.nodes.map((n) => n.id).sort()).toEqual(["1", "2", "3"]);
    // size text "50" mm → metric DN "50" for display, internal dia = Sch-40 2"
    expect(model.network.pipes[0]?.nominalSize).toBe("50");
    expect(model.network.pipes[0]?.internalDiameterIn).toBeCloseTo(2.067, 2);
    // true geometry in feet (1000 mm ≈ 3.28 ft)
    const n2 = model.network.nodes.find((n) => n.id === "2")!;
    expect(n2.geometry?.x).toBeCloseTo(3.281, 2);
    expect(model.network.pipes[0]?.direction).toBe("E");
    expect(model.network.pipes[1]?.direction).toBe("U");
    // head + coverage (11 m² → ~118 ft²)
    const head = model.network.nodes.find((n) => n.id === "3")!;
    expect(head.type).toBe("sprinkler");
    expect(head.coverageAreaFt2).toBeGreaterThan(115);
  });

  // Real Canute DXF export of the TED Bernhardtz job.
  const dxfPath = resolve(process.cwd(), "test_data", "240827 7F-MR.dxf");
  it.skipIf(!existsSync(dxfPath))("imports the real Canute DXF (91 pipes, ~15 heads, true geometry)", async () => {
    const doc = parseDxf(readFileSync(dxfPath, "latin1"));
    const analysis = analyzeDxf(doc);
    expect(analysis.lineCount).toBe(91);
    expect(analysis.circleCount).toBe(15);
    expect(analysis.is3D).toBe(true);
    expect(analysis.insertCount).toBe(0);

    const mapping = defaultMapping(analysis, { projectName: "TED Bernhardtz 7F-MR", projectId: "15008099" });
    expect(mapping.sourceUnit).toBe("mm");
    const { model, stats, warnings } = importNetwork(doc, mapping);
    // 89 pipe centerlines are on the dominant pipe layer; 2 stray lines sit on a
    // text-dominant layer and are excluded by default (re-mappable in the UI).
    expect(stats.pipes).toBeGreaterThanOrEqual(89);
    expect(stats.pipes).toBeLessThanOrEqual(91);
    expect(stats.heads).toBeGreaterThanOrEqual(12);
    expect(stats.pipesWithMatchedSize).toBeGreaterThan(70); // most pipes get a size from text
    for (const n of model.network.nodes) expect(n.geometry).toBeDefined();
    // longest pipe ≈ the 40.841 m run from the Canute schedule
    const maxLen = Math.max(...model.network.pipes.map((p) => p.lengthFt ?? 0));
    expect(maxLen).toBeGreaterThan(120); // 40.8 m ≈ 134 ft
    expect(maxLen).toBeLessThan(150);
    console.log(`DXF import: ${stats.nodes} nodes, ${stats.pipes} pipes, ${stats.heads} heads, ${stats.pipesWithMatchedSize} sized; warnings: ${warnings.length}`);

    // render the imported model's TRUE-geometry iso for visual comparison
    const { buildScene } = await import("@rads/scene");
    const { renderDrawingSheetSvg } = await import("@rads/report");
    const svg = renderDrawingSheetSvg(buildScene(model), { paper: "A2", view: "iso", colorMetric: "size", title: "Imported from DXF — TED Bernhardtz 7F-MR" });
    const out = resolve(process.cwd(), "test_data", "out");
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, "DXF-import.iso.svg"), svg);
    expect(svg).toContain("</svg>");
  });
});
