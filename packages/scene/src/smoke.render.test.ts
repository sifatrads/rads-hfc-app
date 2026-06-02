/**
 * Smoke renderer (not an assertion of geometry, a visual artifact): build a
 * scene for SPK-001, project iso, and write a minimal colored SVG so the
 * foundational model→geometry→scene→projection chain can be eyeballed. Skips
 * when test_data is absent (CI). The real, label-placed renderer is @rads/report.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { buildScene, colorize, isoProject, bounds2 } from "./index";

const root = resolve(process.cwd(), "test_data");
const spk = join(root, "sprinkler", "SPK-001.json");

describe.skipIf(!existsSync(spk))("scene smoke render", () => {
  it("writes a colored iso SVG for SPK-001", () => {
    const scene = buildScene(parseProject(JSON.parse(readFileSync(spk, "utf8"))));
    const { pipeColors, nodeColors } = colorize(scene, "size");

    const proj = new Map(scene.nodes.map((n) => [n.id, isoProject(n.pos)]));
    const pts = [...proj.values(), ...scene.pipes.flatMap((p) => [isoProject(p.a), isoProject(p.b)])];
    const b = bounds2(pts);
    const PAD = 40, W = 1100;
    const s = (W - 2 * PAD) / Math.max(1, b.width);
    const H = Math.round(b.height * s) + 2 * PAD;
    const tx = (x: number) => PAD + (x - b.minX) * s;
    const ty = (y: number) => PAD + (y - b.minY) * s;
    const widthFor = (mm: number) => Math.max(1.3, Math.min(7, (mm || 40) / 22));

    const e: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial">`, `<rect width="${W}" height="${H}" fill="#fff"/>`];
    for (const p of scene.pipes) {
      const a = isoProject(p.a), c = isoProject(p.b);
      e.push(`<line x1="${tx(a.x).toFixed(1)}" y1="${ty(a.y).toFixed(1)}" x2="${tx(c.x).toFixed(1)}" y2="${ty(c.y).toFixed(1)}" stroke="${pipeColors.get(p.id)}" stroke-width="${widthFor(p.sizeMm).toFixed(1)}" stroke-linecap="round"/>`);
    }
    for (const n of scene.nodes) {
      const q = proj.get(n.id)!;
      const x = tx(q.x), y = ty(q.y);
      if (n.kind === "sprinkler" || n.kind === "hose-station") {
        e.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="#fff" stroke="#e53935" stroke-width="1.3"/>`);
      } else {
        e.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.6" fill="${nodeColors.get(n.id)}"/>`);
        e.push(`<text x="${(x + 4).toFixed(1)}" y="${(y - 4).toFixed(1)}" font-size="10" fill="#37474f">${n.id}</text>`);
      }
    }
    e.push(`</svg>`);
    const out = join(root, "out");
    mkdirSync(out, { recursive: true });
    const file = join(out, "SPK-001.scene.svg");
    writeFileSync(file, e.join("\n"));
    expect(existsSync(file)).toBe(true);
    expect(scene.pipes.length).toBeGreaterThan(0);
  });
});
