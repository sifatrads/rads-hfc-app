/**
 * Drawing sheet (Isometric / Plan / Elevation) as a vector SVG, styled to match
 * the report theme: a branded header band + metadata strip on top, a footer with
 * attribution + page number, a FULL-WIDTH drawing area, and a compact horizontal
 * legend strip at the bottom. The drawing is a NUMBERED SCHEMATIC — only node
 * numbers + pipe numbers are labelled (the cross-reference keys); sizes,
 * pressures and flows live in the Node-Analysis / Pipe-Information tables — so it
 * stays readable instead of drowning in 100+ overlapping tags. The shared label
 * engine places the remaining labels overlap-free with leaders, at any paper size.
 */
import type { AnnotatedScene, ColorMetric, LabelCategory } from "@rads/scene";
import { colorize, project, type ViewKind } from "@rads/scene";
import { placeLabels, type LabelRequest, type PlacedLabel } from "@rads/labeling";
import { renderSymbolSvg, symbolIdFor, symbolLegend } from "@rads/nfpa170";
import { mm, measureBox, type PaperName, type Orientation, type SheetOptions } from "./paper";

export interface DrawingSheetOptions extends SheetOptions {
  view?: ViewKind;
  colorMetric?: ColorMetric;
  enabledCategories?: LabelCategory[];
  title?: string;
  /** Sheet position in the report (for the metadata strip + footer). */
  page?: number;
  total?: number;
}

// A numbered schematic: node + pipe reference numbers (the table keys) + the
// supply/pump/reservoir callouts. Sizes/pressures/flows are in the tables.
const DEFAULT_CATEGORIES: LabelCategory[] = ["nodeNo", "pipeNo", "source", "pump", "reservoir"];
const ATTRIBUTION = "© Sifat Sarower — RADS-HFC-APP";
const DISCLAIMER = "Calculation aid — must be reviewed & stamped by a licensed fire protection engineer and accepted by the AHJ.";

const PAPER_MM: Record<PaperName, [number, number]> = { A4: [210, 297], A3: [297, 420], A2: [420, 594], A1: [594, 841], A0: [841, 1189] };
const C = { ink: "#16243a", primary: "#0b3d91", accent: "#2563b8", muted: "#64748b", faint: "#94a3b8", line: "#d7dee6", band: "#eef3f8", white: "#ffffff" };

const esc = (s: unknown): string => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const f = (n: number): string => n.toFixed(1);

function pipeWidthPx(sizeMm: number): number {
  return mm(Math.max(0.35, Math.min(1.4, 0.35 + sizeMm / 200)));
}
function rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; rx?: number } = {}): string {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.rx ? ` rx="${f(o.rx)}"` : ""} fill="${o.fill ?? "none"}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${f(o.sw ?? 0.5)}"` : ""}/>`;
}
function line(x1: number, y1: number, x2: number, y2: number, stroke: string, sw: number): string {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
}
/** Plain text. */
function t(x: number, y: number, s: unknown, size: number, fill = C.ink, weight = "400", anchor = "start"): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`;
}
/** Text with a white halo so labels stay readable over the drawing. */
function halo(x: number, y: number, s: string, size: number, fill = C.ink, weight = "600"): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-weight="${weight}" text-anchor="start" fill="${fill}" paint-order="stroke" stroke="#ffffff" stroke-width="${f(size * 0.3)}" stroke-linejoin="round">${esc(s)}</text>`;
}

export function renderDrawingSheetSvg(scene: AnnotatedScene, opts: DrawingSheetOptions = {}): string {
  const view = opts.view ?? "iso";
  const metric = opts.colorMetric ?? "size";
  const paper = opts.paper ?? "A4";
  const orientation: Orientation = opts.orientation ?? "portrait";
  const [pwMm, phMm] = PAPER_MM[paper];
  const [wmm, hmm] = orientation === "landscape" ? [phMm, pwMm] : [pwMm, phMm];
  const pageW = mm(wmm), pageH = mm(hmm);

  const M = mm(9);
  const innerX = M, innerW = pageW - 2 * M;
  const bandH = mm(10), stripH = mm(8.5);
  const headerBottom = M + bandH + stripH;            // band + metadata strip
  const footerY = pageH - M;
  const legendH = mm(14.5);
  const legendY = footerY - mm(6) - legendH;
  const draw = { x: innerX, y: headerBottom + mm(3.5), w: innerW, h: legendY - mm(3.5) - (headerBottom + mm(3.5)) };

  const enabled = new Set<LabelCategory>(opts.enabledCategories ?? DEFAULT_CATEGORIES);
  const { pipeColors, nodeColors, legend } = colorize(scene, metric);
  const labelFontPx = mm(opts.labelFontMm ?? 2.15);

  // project geometry → fit into the (now full-width) drawing rect
  const nodeP = new Map(scene.nodes.map((n) => [n.id, project(n.pos, view)]));
  const pts = [...nodeP.values(), ...scene.pipes.flatMap((p) => [project(p.a, view), project(p.b, view)]), ...scene.equipment.map((e) => project(e.pos, view))];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of pts) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  if (!Number.isFinite(minX)) { minX = minY = 0; maxX = maxY = 1; }
  const bw = Math.max(1e-6, maxX - minX), bh = Math.max(1e-6, maxY - minY);
  const scale = Math.min(draw.w / bw, draw.h / bh) * 0.92;
  const padX = (draw.w - bw * scale) / 2, padY = (draw.h - bh * scale) / 2;
  const T = (p: { x: number; y: number }) => ({ x: draw.x + padX + (p.x - minX) * scale, y: draw.y + padY + (p.y - minY) * scale });
  const TN = (id: string) => T(nodeP.get(id) ?? { x: 0, y: 0 });

  const el: string[] = [];
  el.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${f(pageW)}" height="${f(pageH)}" viewBox="0 0 ${f(pageW)} ${f(pageH)}" font-family="Helvetica, Arial, sans-serif">`);
  el.push(rect(0, 0, pageW, pageH, { fill: C.white }));

  // ── header band ──
  el.push(rect(innerX, M, innerW, bandH, { fill: C.primary, rx: mm(1.2) }));
  el.push(t(innerX + mm(4), M + mm(4.4), "RADS·HFC", mm(3.9), C.white, "800"));
  el.push(t(innerX + mm(4), M + mm(7.9), "Fire Sprinkler Hydraulics", mm(2), "#aec3e8"));
  el.push(t(innerX + innerW - mm(4), M + mm(4.8), opts.title ?? scene.name, mm(3.1), C.white, "700", "end"));
  el.push(t(innerX + innerW - mm(4), M + mm(8.2), `${view.toUpperCase()} · schematic · NTS`, mm(2.05), "#d3e2ff", "400", "end"));
  // metadata strip
  const sy = M + bandH + mm(5);
  const pairs: [string, string][] = [
    ["Project No", String(scene.projectId ?? "—")],
    ["Standard", String(scene.standardId?.toUpperCase() ?? "—")],
    ["System", String(scene.systemType ?? "—")],
    ["Units", String(scene.units ?? "—")],
    ["View", view],
    ["Sheet", opts.page && opts.total ? `${opts.page} / ${opts.total}` : "—"],
  ];
  const colW = innerW / pairs.length;
  pairs.forEach(([k, v], i) => {
    const mx = innerX + i * colW;
    el.push(t(mx + mm(1.5), sy - mm(1.5), k.toUpperCase(), mm(1.65), C.muted, "700"));
    el.push(t(mx + mm(1.5), sy + mm(1.7), v, mm(2.2), C.ink, "600"));
    if (i) el.push(line(mx, sy - mm(3.8), mx, sy + mm(2.4), C.line, 0.4));
  });
  el.push(line(innerX, sy + mm(3.4), innerX + innerW, sy + mm(3.4), C.line, 0.7));

  // ── drawing frame ──
  el.push(rect(draw.x, draw.y, draw.w, draw.h, { stroke: C.line, sw: 0.7, rx: mm(1) }));

  // ── pipes ──
  for (const p of scene.pipes) {
    const a = T(project(p.a, view)), b = T(project(p.b, view));
    el.push(`<line x1="${f(a.x)}" y1="${f(a.y)}" x2="${f(b.x)}" y2="${f(b.y)}" stroke="${pipeColors.get(p.id) ?? "#90a4ae"}" stroke-width="${f(pipeWidthPx(p.sizeMm))}" stroke-linecap="round"/>`);
  }
  // ── equipment glyphs ──
  for (const e of scene.equipment) {
    const c = T(project(e.pos, view));
    const r = mm(2.4);
    if (e.kind === "source") el.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r)}" fill="#fff" stroke="${C.primary}" stroke-width="1.4"/><circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(r * 0.5)}" fill="${C.primary}"/>`);
    else if (e.kind === "pump") el.push(`<rect x="${f(c.x - r)}" y="${f(c.y - r)}" width="${f(2 * r)}" height="${f(2 * r)}" fill="#fff" stroke="${C.primary}" stroke-width="1.4"/>${halo(c.x - r * 0.35, c.y + r * 0.45, "P", r * 1.1, C.primary, "700")}`);
    else el.push(`<rect x="${f(c.x - r * 1.3)}" y="${f(c.y - r)}" width="${f(2.6 * r)}" height="${f(2 * r)}" fill="#e3f2fd" stroke="${C.primary}" stroke-width="1.2"/>`);
  }
  // ── nodes (sprinklers = NFPA-170 head symbols) ──
  const usedSymbols = new Set<string>();
  let anyFlowing = false;
  for (const n of scene.nodes) {
    const c = TN(n.id);
    if (n.kind === "sprinkler" || n.kind === "hose-station") {
      const sym = symbolIdFor(n.sprinklerType ?? "sprinkler-generic");
      usedSymbols.add(sym);
      // operating heads (in the design / remote area) discharge — highlight them
      // with a halo; idle heads render in grey so the calculated area stands out.
      const flowing = (n.result?.dischargeGpm ?? 0) > 0.5;
      anyFlowing ||= flowing;
      if (flowing) el.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(mm(2.3))}" fill="#fde2e2" stroke="#e5393566" stroke-width="0.4"/>`);
      el.push(renderSymbolSvg(sym, { cx: c.x, cy: c.y, r: mm(1.4), color: flowing ? "#e53935" : "#9aa6b2", strokeWidth: 0.9 }));
    } else {
      el.push(`<circle cx="${f(c.x)}" cy="${f(c.y)}" r="${f(mm(0.85))}" fill="${nodeColors.get(n.id) ?? "#263238"}"/>`);
    }
  }
  // ── device glyphs (NFPA-170 valves, aligned to the host pipe) ──
  const pipeById = new Map(scene.pipes.map((p) => [p.id, p]));
  for (const d of scene.devices) {
    const c = T(project(d.pos, view));
    const sym = symbolIdFor(d.symbol || d.rawType);
    usedSymbols.add(sym);
    let rot = 0;
    const host = d.hostPipe ? pipeById.get(d.hostPipe) : undefined;
    if (host) { const a = T(project(host.a, view)), b = T(project(host.b, view)); rot = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI; }
    el.push(renderSymbolSvg(sym, { cx: c.x, cy: c.y, r: mm(1.9), color: "#b45309", strokeWidth: 1, rotateDeg: rot }));
  }

  // ── labels (shared engine, paper space, drawing-rect-local) ──
  // Equipment callouts (supply / pump / reservoir) are long and cluster at the
  // source junction where the node/pipe numbers already crowd — divert their
  // text to a corner key (the glyphs stay on the drawing) so neither overlaps.
  const EQUIP_CATS = new Set<LabelCategory>(["source", "pump", "reservoir"]);
  const reqs: LabelRequest[] = [];
  const equipCallouts: string[] = [];
  for (const lbl of scene.labels) {
    if (!enabled.has(lbl.category)) continue;
    if (EQUIP_CATS.has(lbl.category)) { if (!equipCallouts.includes(lbl.text)) equipCallouts.push(lbl.text); continue; }
    const a = T(project(lbl.anchor, view));
    const box = measureBox(lbl.text, labelFontPx);
    reqs.push({ id: lbl.id, x: a.x - draw.x, y: a.y - draw.y, text: lbl.text, category: lbl.category, priority: lbl.priority, width: box.width, height: box.height });
  }
  const { placed } = placeLabels(reqs, { width: draw.w, height: draw.h, margin: mm(1) }, { leaderLength: mm(2.4), gap: mm(0.7), thinCellSize: mm(11), thinPerCell: 5 });
  for (const p of placed as PlacedLabel[]) {
    if (p.leader) el.push(line(p.leader.x1 + draw.x, p.leader.y1 + draw.y, p.leader.x2 + draw.x, p.leader.y2 + draw.y, "#7a8aa0", 0.5));
    el.push(halo(p.x + draw.x + 1, p.y + draw.y + p.height - labelFontPx * 0.32, p.text, labelFontPx, C.ink, "600"));
  }

  // ── equipment key (top-left of the drawing rect) ──
  if (equipCallouts.length) {
    const pad = mm(2.5), lh = labelFontPx * 1.75;
    const boxW = Math.max(mm(28), ...equipCallouts.map((s) => measureBox(s, labelFontPx).width)) + pad * 2;
    const boxH = mm(3) + lh * equipCallouts.length + mm(2);
    const bx = draw.x + mm(3), by = draw.y + mm(3);
    el.push(`<rect x="${f(bx)}" y="${f(by)}" width="${f(boxW)}" height="${f(boxH)}" rx="${f(mm(1))}" fill="#f8fafc" fill-opacity="0.92" stroke="${C.line}" stroke-width="0.5"/>`);
    el.push(t(bx + pad, by + mm(3.3), "EQUIPMENT", mm(1.7), C.muted, "700"));
    equipCallouts.forEach((txt, i) => el.push(t(bx + pad, by + mm(3.3) + lh * (i + 1), txt, labelFontPx, C.ink, "500")));
  }

  // ── legend strip (horizontal, bottom) ──
  el.push(rect(innerX, legendY, innerW, legendH, { fill: "#f8fafc", stroke: C.line, sw: 0.7, rx: mm(1) }));
  const lf = mm(2.05);
  el.push(t(innerX + mm(3), legendY + mm(4), `${legend.title}${legend.units ? ` (${legend.units})` : ""}${legend.needsCalc ? " — run calc" : ""}`, lf, C.primary, "700"));
  let lx = innerX + mm(3);
  const ly = legendY + mm(8);
  const sw = mm(5);
  for (const e of legend.entries) {
    el.push(rect(lx, ly - mm(2.3), sw, mm(2.6), { fill: e.swatch }));
    el.push(t(lx + sw + mm(1), ly, e.label, lf, C.ink));
    lx += sw + mm(1.5) + e.label.length * lf * 0.56 + mm(4);
  }
  if (anyFlowing) {
    el.push(`<circle cx="${f(lx + mm(2))}" cy="${f(ly - mm(1))}" r="${f(mm(1.7))}" fill="#fde2e2" stroke="#e53935" stroke-width="0.5"/>`);
    el.push(t(lx + mm(4.5), ly, "Operating (design area)", lf, C.ink));
  }
  // NFPA-170 symbol legend on the right of the strip
  const symLeg = symbolLegend(usedSymbols);
  if (symLeg.length) {
    let sx = innerX + mm(3);
    const symY = legendY + mm(12.6);
    el.push(t(sx, symY, "Symbols (NFPA 170):", lf, C.muted, "700"));
    sx += mm(28);
    for (const s of symLeg) {
      el.push(renderSymbolSvg(s.id, { cx: sx + mm(2), cy: symY - mm(1.1), r: mm(1.9), color: C.ink, strokeWidth: 0.8 }));
      el.push(t(sx + mm(5), symY, s.label, mm(1.8), C.muted));
      sx += mm(5) + s.label.length * mm(1.8) * 0.55 + mm(5);
    }
  }

  // ── footer ──
  el.push(line(innerX, footerY - mm(4.5), innerX + innerW, footerY - mm(4.5), C.line, 0.6));
  el.push(t(innerX, footerY - mm(1.6), ATTRIBUTION, mm(2.1), C.muted, "600"));
  el.push(t(innerX + innerW / 2, footerY - mm(1.6), DISCLAIMER, mm(1.85), C.faint, "400", "middle"));
  el.push(t(innerX + innerW, footerY - mm(1.6), opts.page && opts.total ? `Page ${opts.page} / ${opts.total}` : paper, mm(2.1), C.muted, "600", "end"));

  el.push(`</svg>`);
  return el.join("\n");
}
