/**
 * Render NFPA-170 symbol primitives to SVG. The same primitive list also feeds
 * the @react-pdf drawing sheets and (later) a WebGL sprite atlas for the viewer.
 */
import { getSymbol, type Prim, type SymbolDef } from "./symbols";

export interface RenderOptions {
  cx: number;
  cy: number;
  /** Symbol radius in px (half of the unit box). */
  r: number;
  color?: string;
  strokeWidth?: number;
  /** Rotation in degrees about (cx,cy) — e.g. align an inline valve to its pipe. */
  rotateDeg?: number;
}

const n = (v: number) => Number(v.toFixed(2));

function primSvg(p: Prim, cx: number, cy: number, r: number, color: string, sw: number): string {
  const X = (x: number) => n(cx + x * r);
  const Y = (y: number) => n(cy + y * r);
  switch (p.k) {
    case "line":
      return `<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(p.x2)}" y2="${Y(p.y2)}" stroke="${color}" stroke-width="${n(sw)}" stroke-linecap="round"/>`;
    case "circle":
      return `<circle cx="${X(p.cx)}" cy="${Y(p.cy)}" r="${n(p.r * r)}" fill="${p.fill ? color : "none"}" stroke="${color}" stroke-width="${n(sw)}"/>`;
    case "rect":
      return `<rect x="${X(p.x)}" y="${Y(p.y)}" width="${n(p.w * r)}" height="${n(p.h * r)}" fill="${p.fill ? color : "none"}" stroke="${color}" stroke-width="${n(sw)}"/>`;
    case "poly": {
      const pts = p.pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ");
      const tag = p.closed === false ? "polyline" : "polygon";
      return `<${tag} points="${pts}" fill="${p.fill ? color : "none"}" stroke="${color}" stroke-width="${n(sw)}" stroke-linejoin="round"/>`;
    }
  }
}

/** Render a symbol (by id) as an SVG `<g>` group string. Returns "" if unknown. */
export function renderSymbolSvg(id: string, opts: RenderOptions): string {
  const def = getSymbol(id);
  if (!def) return "";
  const color = opts.color ?? "#0b3d91";
  const sw = opts.strokeWidth ?? Math.max(0.6, opts.r * 0.13);
  const body = def.prims.map((p) => primSvg(p, opts.cx, opts.cy, opts.r, color, sw)).join("");
  if (opts.rotateDeg) return `<g transform="rotate(${n(opts.rotateDeg)} ${n(opts.cx)} ${n(opts.cy)})">${body}</g>`;
  return `<g>${body}</g>`;
}

export interface LegendItem {
  id: string;
  label: string;
}

/** Distinct symbols actually used (for the auto-legend), in registry order. */
export function symbolLegend(usedIds: Iterable<string>): LegendItem[] {
  const used = new Set(usedIds);
  const out: LegendItem[] = [];
  for (const id of used) {
    const def = getSymbol(id);
    if (def) out.push({ id, label: def.label });
  }
  out.sort((a, b) => a.label.localeCompare(b.label));
  return out;
}

export type { SymbolDef };
