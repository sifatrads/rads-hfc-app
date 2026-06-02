/**
 * Drawing sheet (Isometric / Plan / Elevation) as a vector SVG: projects the
 * AnnotatedScene to paper space, colorizes, and runs the shared label engine in
 * paper space so every pipe/node/valve label is readable and overlap-free with
 * leader lines — at any paper size. This SVG is the basis for the @react-pdf
 * drawing sheets (react-pdf renders the same primitives as vector PDF).
 */
import type { AnnotatedScene, ColorMetric, LabelCategory } from "@rads/scene";
import { colorize, project, type ViewKind } from "@rads/scene";
import { placeLabels, type LabelRequest, type PlacedLabel } from "@rads/labeling";
import { renderSymbolSvg, symbolIdFor, symbolLegend } from "@rads/nfpa170";
import { sheetLayout, measureBox, mm, type SheetOptions } from "./paper";

export interface DrawingSheetOptions extends SheetOptions {
  view?: ViewKind;
  colorMetric?: ColorMetric;
  enabledCategories?: LabelCategory[];
  title?: string;
}

const DEFAULT_CATEGORIES: LabelCategory[] = ["nodeNo", "pipeNo", "pipeSize", "valve", "source", "pump", "reservoir"];
const ATTRIBUTION = "© Sifat Sarower — RADS-HFC-APP";
const DISCLAIMER = "Calculation aid — all results must be reviewed and stamped by a licensed fire protection engineer and accepted by the AHJ.";

const esc = (s: string): string => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const f = (n: number): string => n.toFixed(1);

function pipeWidthPx(sizeMm: number): number {
  return mm(Math.max(0.3, Math.min(1.6, 0.3 + sizeMm / 180)));
}

/** A text element with a white halo so it stays readable over lines. */
function text(x: number, y: number, s: string, fontPx: number, fill = "#10243e", weight = "400", anchor = "start"): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(fontPx)}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" paint-order="stroke" stroke="#ffffff" stroke-width="${f(fontPx * 0.28)}" stroke-linejoin="round">${esc(s)}</text>`;
}

export function renderDrawingSheetSvg(scene: AnnotatedScene, opts: DrawingSheetOptions = {}): string {
  const view = opts.view ?? "iso";
  const metric = opts.colorMetric ?? "size";
  const layout = sheetLayout(opts);
  const { draw } = layout;
  const enabled = new Set<LabelCategory>(opts.enabledCategories ?? DEFAULT_CATEGORIES);
  const { pipeColors, nodeColors, legend } = colorize(scene, metric);

  // project all geometry to 2D paper-pre-fit coordinates
  const nodeP = new Map(scene.nodes.map((n) => [n.id, project(n.pos, view)]));
  const pts = [
    ...nodeP.values(),
    ...scene.pipes.flatMap((p) => [project(p.a, view), project(p.b, view)]),
    ...scene.equipment.map((e) => project(e.pos, view)),
  ];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
  const scale = Math.min(draw.w / bw, draw.h / bh) * 0.94;
  const padX = (draw.w - bw * scale) / 2;
  const padY = (draw.h - bh * scale) / 2;
  const T = (p: { x: number; y: number }) => ({ x: draw.x + padX + (p.x - minX) * scale, y: draw.y + padY + (p.y - minY) * scale });
  const TN = (id: string) => T(nodeP.get(id) ?? { x: 0, y: 0 });

  const el: string[] = [];
  el.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f(layout.pageW)}" height="${f(layout.pageH)}" viewBox="0 0 ${f(layout.pageW)} ${f(layout.pageH)}" font-family="Helvetica, Arial, sans-serif">`);
  el.push(`<rect width="${f(layout.pageW)}" height="${f(layout.pageH)}" fill="#ffffff"/>`);
  el.push(`<rect x="${f(mm(4))}" y="${f(mm(4))}" width="${f(layout.pageW - mm(8))}" height="${f(layout.pageH - mm(8))}" fill="none" stroke="#9bb0c3" stroke-width="1"/>`);

  // ── pipes ──
  for (const p of scene.pipes) {
    const a = T(project(p.a, view)), b = T(project(p.b, view));
    el.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${pipeColors.get(p.id) ?? "#90a4ae"}" stroke-width="${f(pipeWidthPx(p.sizeMm))}" stroke-linecap="round"/>`);
  }
  // ── equipment glyphs ──
  for (const e of scene.equipment) {
    const c = T(project(e.pos, view));
    const r = mm(2.4);
    if (e.kind === "source") el.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" fill="#fff" stroke="#0b3d91" stroke-width="1.4"/><circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r * 0.5)}" fill="#0b3d91"/>`);
    else if (e.kind === "pump") el.push(`<rect x="${f(c.x - r)}" y="${f(c.y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="#fff" stroke="#0b3d91" stroke-width="1.4"/>${text(c.x, c.y + r * 0.45, "P", r * 1.1, "#0b3d91", "700", "middle")}`);
    else el.push(`<rect x="${f(c.x - r * 1.3)}" y="${f(c.y - r)}" width="${f(2.6 * r)}" height="${f(2 * r)}" fill="#e3f2fd" stroke="#0b3d91" stroke-width="1.2"/>`);
  }
  // ── nodes (sprinklers = NFPA-170 head symbols) ──
  const usedSymbols = new Set<string>();
  for (const n of scene.nodes) {
    const c = TN(n.id);
    if (n.kind === "sprinkler" || n.kind === "hose-station") {
      const sym = symbolIdFor(n.sprinklerType ?? "sprinkler-generic");
      usedSymbols.add(sym);
      el.push(renderSymbolSvg(sym, { cx: c.x, cy: c.y, r: mm(1.5), color: "#e53935", strokeWidth: 0.9 }));
    } else {
      el.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(mm(0.9))}" fill="${nodeColors.get(n.id) ?? "#263238"}"/>`);
    }
  }
  // ── device glyphs (NFPA-170 valves/devices, aligned to the host pipe) ──
  const pipeById = new Map(scene.pipes.map((p) => [p.id, p]));
  for (const d of scene.devices) {
    const c = T(project(d.pos, view));
    const sym = symbolIdFor(d.symbol || d.rawType);
    usedSymbols.add(sym);
    let rot = 0;
    const host = d.hostPipe ? pipeById.get(d.hostPipe) : undefined;
    if (host) {
      const a = T(project(host.a, view)), b = T(project(host.b, view));
      rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    }
    el.push(renderSymbolSvg(sym, { cx: c.x, cy: c.y, r: mm(2), color: "#b45309", strokeWidth: 1, rotateDeg: rot }));
  }

  // ── labels (shared engine, paper space, drawing-rect-local) ──
  const font = layout.labelFontPx;
  const reqs: LabelRequest[] = [];
  for (const lbl of scene.labels) {
    if (!enabled.has(lbl.category)) continue;
    const a = T(project(lbl.anchor, view));
    const box = measureBox(lbl.text, font);
    reqs.push({ id: lbl.id, x: a.x - draw.x, y: a.y - draw.y, text: lbl.text, category: lbl.category, priority: lbl.priority, width: box.width, height: box.height });
  }
  const { placed } = placeLabels(reqs, { width: draw.w, height: draw.h, margin: mm(1) }, { leaderLength: mm(2.5), gap: mm(0.6), thinCellSize: mm(14), thinPerCell: 4 });
  for (const p of placed as PlacedLabel[]) {
    if (p.leader) el.push(`<line x1="${f(p.leader.x1 + draw.x)}" y1="${f(p.leader.y1 + draw.y)}" x2="${f(p.leader.x2 + draw.x)}" y2="${f(p.leader.y2 + draw.y)}" stroke="#5b6b7b" stroke-width="0.5"/>`);
    el.push(text(p.x + draw.x + 1, p.y + draw.y + p.height - font * 0.32, p.text, font, "#10243e"));
  }

  // ── legend ──
  el.push(`<rect x="${f(layout.legend.x)}" y="${f(layout.legend.y)}" width="${f(layout.legend.w)}" height="${f(layout.legend.h)}" fill="#f7f9fb" stroke="#cfd8dc" stroke-width="0.8"/>`);
  const lf = mm(2.2);
  el.push(text(layout.legend.x + mm(2), layout.legend.y + mm(4), `${legend.title}${legend.units ? ` (${legend.units})` : ""}${legend.needsCalc ? " — run calc" : ""}`, lf, "#37474f", "700"));
  const sw = mm(5);
  if (layout.legend.horizontal) {
    let lx = layout.legend.x + mm(2);
    const ly = layout.legend.y + mm(7);
    for (const e of legend.entries) {
      el.push(`<rect x="${f(lx)}" y="${f(ly)}" width="${f(sw)}" height="${f(mm(2.6))}" fill="${e.swatch}"/>`);
      el.push(text(lx + sw + mm(1), ly + mm(2.4), e.label, lf, "#37474f"));
      lx += sw + mm(2) + e.label.length * lf * 0.56 + mm(3);
    }
  } else {
    let ly = layout.legend.y + mm(7);
    for (const e of legend.entries) {
      el.push(`<rect x="${f(layout.legend.x + mm(2))}" y="${f(ly)}" width="${f(sw)}" height="${f(mm(2.6))}" fill="${e.swatch}"/>`);
      el.push(text(layout.legend.x + mm(2) + sw + mm(1), ly + mm(2.4), e.label, lf, "#37474f"));
      ly += mm(4);
    }
  }

  // ── NFPA-170 symbol legend ──
  const symLeg = symbolLegend(usedSymbols);
  if (symLeg.length) {
    if (layout.legend.horizontal) {
      const sy = layout.legend.y + mm(20);
      el.push(text(layout.legend.x + mm(2), sy - mm(0.5), "Symbols (NFPA 170):", lf, "#37474f", "700"));
      let sx = layout.legend.x + mm(34);
      for (const s of symLeg) {
        el.push(renderSymbolSvg(s.id, { cx: sx + mm(2.5), cy: sy - mm(1.4), r: mm(2.4), color: "#10243e", strokeWidth: 0.8 }));
        el.push(text(sx + mm(6.5), sy, s.label, mm(1.9), "#37474f"));
        sx += mm(6.5) + s.label.length * mm(1.9) * 0.55 + mm(6);
      }
    } else {
      let sy = layout.legend.y + mm(7) + legend.entries.length * mm(4) + mm(5);
      el.push(text(layout.legend.x + mm(2), sy - mm(1), "Symbols (NFPA 170)", lf, "#37474f", "700"));
      sy += mm(3);
      for (const s of symLeg) {
        el.push(renderSymbolSvg(s.id, { cx: layout.legend.x + mm(4), cy: sy - mm(1), r: mm(2.2), color: "#10243e", strokeWidth: 0.8 }));
        el.push(text(layout.legend.x + mm(8), sy, s.label, mm(1.8), "#37474f"));
        sy += mm(5);
      }
    }
  }

  // ── title block ──
  const t = layout.title;
  el.push(`<rect x="${f(t.x)}" y="${f(t.y)}" width="${f(t.w)}" height="${f(t.h)}" fill="#ffffff" stroke="#9bb0c3" stroke-width="1"/>`);
  el.push(text(t.x + mm(3), t.y + mm(7), opts.title ?? scene.name, mm(4), "#0b3d91", "700"));
  const sub = [scene.projectId, scene.standardId?.toUpperCase(), scene.systemType, `${scene.units}`, `${view.toUpperCase()} — schematic, NTS`].filter(Boolean).join("  ·  ");
  el.push(text(t.x + mm(3), t.y + mm(12.5), sub, mm(2.6), "#37474f"));
  el.push(text(t.x + mm(3), t.y + mm(17), `${ATTRIBUTION}`, mm(2.4), "#546e7a", "600"));
  el.push(text(t.x + mm(3), t.y + mm(21), DISCLAIMER, mm(2.1), "#78909c"));
  el.push(text(t.x + t.w - mm(3), t.y + mm(7), layout.paper, mm(4.5), "#0b3d91", "700", "end"));

  el.push(`</svg>`);
  return el.join("\n");
}
