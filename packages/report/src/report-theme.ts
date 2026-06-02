/**
 * Report design system — a consistent, professional look for every sheet:
 * a branded header band + project metadata strip, a footer with attribution +
 * page number, stat cards, section headers, and zebra tables with units in the
 * column header. All A4 portrait so the printed PDF is uniform.
 */
import type { ProjectModel } from "@rads/model";
import { mm } from "./paper";

export const PAGE = { w: mm(210), h: mm(297), m: mm(11) };
export const INNER = { x: PAGE.m, w: PAGE.w - 2 * PAGE.m };
export const CONTENT_TOP = PAGE.m + mm(11) + mm(10.5); // header band + metadata strip
export const CONTENT_BOTTOM = PAGE.h - PAGE.m - mm(7);

export const C = {
  ink: "#16243a",
  primary: "#0b3d91",
  accent: "#2563b8",
  muted: "#64748b",
  faint: "#94a3b8",
  line: "#d7dee6",
  band: "#eef3f8",
  zebra: "#f5f9fd",
  good: "#15803d",
  warn: "#c2410c",
  bad: "#b91c1c",
  white: "#ffffff",
};

const f = (n: number): string => n.toFixed(2);
const esc = (s: unknown): string => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);

export interface TextOpts {
  size?: number;
  fill?: string;
  weight?: string;
  anchor?: "start" | "middle" | "end";
}
export function T(x: number, y: number, s: unknown, o: TextOpts = {}): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(o.size ?? mm(2.6))}" font-weight="${o.weight ?? "400"}" text-anchor="${o.anchor ?? "start"}" fill="${o.fill ?? C.ink}">${esc(s)}</text>`;
}
export function rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; sw?: number; rx?: number } = {}): string {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}"${o.rx ? ` rx="${f(o.rx)}"` : ""} fill="${o.fill ?? "none"}"${o.stroke ? ` stroke="${o.stroke}" stroke-width="${f(o.sw ?? 0.5)}"` : ""}/>`;
}
export function line(x1: number, y1: number, x2: number, y2: number, stroke = C.line, sw = 0.5): string {
  return `<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="${stroke}" stroke-width="${f(sw)}"/>`;
}

export interface SheetMeta {
  title: string;
  page?: number;
  total?: number;
}

function metaPairs(model: ProjectModel, m: SheetMeta): [string, string][] {
  return [
    ["Project No", String(model.meta.id)],
    ["Engineer", String(model.meta.engineer ?? "—")],
    ["Standard", String(model.meta.standard ?? model.meta.standardId ?? "—")],
    ["System", String(model.meta.systemType ?? "—")],
    ["Units", String(model.meta.units)],
    ["Date", String(model.meta.date ?? "—")],
    ["Sheet", m.page && m.total ? `${m.page} / ${m.total}` : "—"],
  ];
}

export function header(model: ProjectModel, m: SheetMeta): string {
  const { x, w } = INNER;
  const y = PAGE.m;
  const bandH = mm(11);
  const el: string[] = [];
  el.push(rect(x, y, w, bandH, { fill: C.primary, rx: mm(1.2) }));
  el.push(T(x + mm(4), y + mm(4.8), "RADS·HFC", { size: mm(4.2), fill: C.white, weight: "800" }));
  el.push(T(x + mm(4), y + mm(8.7), "Fire Sprinkler Hydraulics", { size: mm(2.1), fill: "#aec3e8" }));
  el.push(T(x + w - mm(4), y + mm(5.2), m.title, { size: mm(3.4), fill: C.white, weight: "700", anchor: "end" }));
  el.push(T(x + w - mm(4), y + mm(8.9), model.meta.name, { size: mm(2.3), fill: "#d3e2ff", anchor: "end" }));
  // metadata strip
  const sy = y + bandH + mm(5);
  const pairs = metaPairs(model, m);
  const colW = w / pairs.length;
  pairs.forEach(([k, v], i) => {
    const mx = x + i * colW;
    el.push(T(mx + mm(1.5), sy - mm(1.6), k.toUpperCase(), { size: mm(1.7), fill: C.muted, weight: "700" }));
    el.push(T(mx + mm(1.5), sy + mm(1.8), v, { size: mm(2.3), fill: C.ink, weight: "600" }));
    if (i) el.push(line(mx, sy - mm(4), mx, sy + mm(2.6), C.line, 0.4));
  });
  el.push(line(x, sy + mm(3.8), x + w, sy + mm(3.8), C.line, 0.7));
  return el.join("");
}

export function footer(model: ProjectModel, m: SheetMeta): string {
  const { x, w } = INNER;
  const y = PAGE.h - PAGE.m;
  void model;
  return [
    line(x, y - mm(4.5), x + w, y - mm(4.5), C.line, 0.6),
    T(x, y - mm(1.6), "© Sifat Sarower — RADS-HFC-APP", { size: mm(2.1), fill: C.muted, weight: "600" }),
    T(x + w / 2, y - mm(1.6), "Calculation aid — must be reviewed & stamped by a licensed fire protection engineer and accepted by the AHJ.", { size: mm(1.85), fill: C.faint, anchor: "middle" }),
    T(x + w, y - mm(1.6), m.page && m.total ? `Page ${m.page} / ${m.total}` : "", { size: mm(2.1), fill: C.muted, anchor: "end" }),
  ].join("");
}

export function sheetSvg(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(PAGE.w)}" height="${f(PAGE.h)}" viewBox="0 0 ${f(PAGE.w)} ${f(PAGE.h)}" font-family="Helvetica, Arial, sans-serif">${rect(0, 0, PAGE.w, PAGE.h, { fill: C.white })}${inner}</svg>`;
}

export function frame(model: ProjectModel, m: SheetMeta, inner: string): string {
  return sheetSvg(header(model, m) + inner + footer(model, m));
}

export function sectionTitle(x: number, y: number, w: number, title: string): string {
  return rect(x, y - mm(3.4), mm(1.3), mm(4.2), { fill: C.accent }) + T(x + mm(3), y, title, { size: mm(3.4), fill: C.primary, weight: "700" }) + line(x, y + mm(2), x + w, y + mm(2), C.line, 0.6);
}

export interface StatCard {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}
export function statCards(x: number, y: number, w: number, cards: StatCard[], h = mm(21)): string {
  const gap = mm(3.5);
  const cw = (w - gap * (cards.length - 1)) / cards.length;
  const el: string[] = [];
  cards.forEach((c, i) => {
    const cx = x + i * (cw + gap);
    const tone = c.tone ?? C.primary;
    el.push(rect(cx, y, cw, h, { fill: "#f8fafc", stroke: C.line, sw: 0.7, rx: mm(1.4) }));
    el.push(rect(cx, y, cw, mm(1.4), { fill: tone, rx: mm(0.7) }));
    el.push(T(cx + mm(4), y + mm(6.5), c.label.toUpperCase(), { size: mm(2.1), fill: C.muted, weight: "700" }));
    el.push(T(cx + mm(4), y + mm(14), c.value, { size: mm(6.2), fill: tone, weight: "800" }));
    if (c.sub) el.push(T(cx + mm(4), y + mm(18.5), c.sub, { size: mm(2.1), fill: C.muted }));
  });
  return el.join("");
}

export interface Column {
  label: string;
  unit?: string;
  /** fraction of table width (columns sum to ~1). */
  w: number;
  align?: "l" | "r";
}

/** Render a zebra table (one page slice). Returns SVG + the y after the table. */
export function table(x: number, y: number, w: number, cols: Column[], rows: string[][]): { svg: string; endY: number } {
  const headH = mm(7.5);
  const rowH = mm(5.6);
  const el: string[] = [];
  // header band
  el.push(rect(x, y, w, headH, { fill: C.primary, rx: mm(0.8) }));
  let cx = x;
  for (const c of cols) {
    const colW = c.w * w;
    const tx = c.align === "r" ? cx + colW - mm(2) : cx + mm(2);
    el.push(T(tx, y + mm(3.4), c.label, { size: mm(2.3), fill: C.white, weight: "700", anchor: c.align === "r" ? "end" : "start" }));
    if (c.unit) el.push(T(tx, y + mm(6), c.unit, { size: mm(1.9), fill: "#bcd0f0", anchor: c.align === "r" ? "end" : "start" }));
    cx += colW;
  }
  let ry = y + headH;
  rows.forEach((r, i) => {
    if (i % 2 === 1) el.push(rect(x, ry, w, rowH, { fill: C.zebra }));
    let rx = x;
    r.forEach((cell, ci) => {
      const c = cols[ci]!;
      const colW = c.w * w;
      const tx = c.align === "r" ? rx + colW - mm(2) : rx + mm(2);
      el.push(T(tx, ry + mm(3.7), cell, { size: mm(2.4), fill: C.ink, anchor: c.align === "r" ? "end" : "start" }));
      rx += colW;
    });
    ry += rowH;
  });
  el.push(rect(x, y, w, ry - y, { stroke: C.line, sw: 0.6, rx: mm(0.8) }));
  return { svg: el.join(""), endY: ry };
}

export const ROWS_PER_PAGE = Math.floor((CONTENT_BOTTOM - CONTENT_TOP - mm(8)) / mm(5.6));
