import { describe, it, expect } from "vitest";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { allSymbols, getSymbol, symbolIdFor, renderSymbolSvg, symbolLegend } from "./index";

describe("@rads/nfpa170", () => {
  it("registers the core fire-protection symbols", () => {
    for (const id of ["valve-gate", "valve-osy", "valve-butterfly", "valve-piv", "valve-check", "valve-backflow", "valve-prv", "fdc-single", "pump", "riser", "flow-switch", "sprinkler-pendent"]) {
      expect(getSymbol(id), id).toBeDefined();
    }
  });

  it("maps device/sprinkler types to symbols", () => {
    expect(symbolIdFor("butterfly-valve")).toBe("valve-butterfly");
    expect(symbolIdFor("valve-piv")).toBe("valve-piv");
    expect(symbolIdFor("check-valve")).toBe("valve-check");
    expect(symbolIdFor("alarm-valve")).toBe("valve-check"); // alarm check
    expect(symbolIdFor("backflow-preventer")).toBe("valve-backflow");
    expect(symbolIdFor("pendent")).toBe("sprinkler-pendent");
    expect(symbolIdFor("sidewall")).toBe("sprinkler-sidewall");
    expect(symbolIdFor("anything-else")).toBe("valve-gate");
  });

  it("renders a symbol to SVG primitives", () => {
    const svg = renderSymbolSvg("valve-piv", { cx: 50, cy: 50, r: 12 });
    expect(svg.startsWith("<g")).toBe(true);
    expect(svg).toContain("<polygon"); // bowtie
    expect(svg).toContain("<circle"); // PIV topper
    expect(renderSymbolSvg("does-not-exist", { cx: 0, cy: 0, r: 5 })).toBe("");
  });

  it("builds an auto-legend of distinct used symbols", () => {
    const leg = symbolLegend(["valve-gate", "valve-gate", "valve-check", "pump"]);
    expect(leg.map((l) => l.id).sort()).toEqual(["pump", "valve-check", "valve-gate"]);
  });

  // Visual: render the full symbol set to one SVG sheet for review.
  it("writes a symbol sheet for visual review", () => {
    const cols = 5;
    const cell = 90, pad = 40, r = 22;
    const syms = allSymbols();
    const rows = Math.ceil(syms.length / cols);
    const W = cols * cell + pad, H = rows * cell + pad;
    const e: string[] = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" font-family="Arial"><rect width="${W}" height="${H}" fill="#fff"/>`];
    syms.forEach((s, i) => {
      const cx = pad + (i % cols) * cell + cell / 2 - pad / 2;
      const cy = pad + Math.floor(i / cols) * cell + cell / 2 - pad / 2;
      e.push(renderSymbolSvg(s.id, { cx, cy, r }));
      const label = s.label.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
      e.push(`<text x="${cx}" y="${cy + r + 14}" font-size="9" text-anchor="middle" fill="#333">${label}</text>`);
    });
    e.push("</svg>");
    const out = resolve(process.cwd(), "test_data", "out");
    if (existsSync(resolve(process.cwd(), "test_data"))) {
      mkdirSync(out, { recursive: true });
      writeFileSync(join(out, "nfpa170-symbols.svg"), e.join("\n"));
    }
    expect(syms.length).toBeGreaterThan(15);
  });
});
