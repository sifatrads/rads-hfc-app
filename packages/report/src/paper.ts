/**
 * Paper sizes + sheet layout. Text is sized in millimetres so it stays the same
 * PHYSICAL size — and therefore equally readable — on A4 through A0.
 */
export type PaperName = "A4" | "A3" | "A2" | "A1" | "A0";
export type Orientation = "landscape" | "portrait";

/** ISO 216 sizes, mm (portrait w×h). */
const PAPER_MM: Record<PaperName, [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A2: [420, 594],
  A1: [594, 841],
  A0: [841, 1189],
};

export const PX_PER_MM = 96 / 25.4; // 96 dpi
export const mm = (v: number): number => v * PX_PER_MM;

export interface SheetLayout {
  paper: PaperName;
  orientation: Orientation;
  /** Full page px. */
  pageW: number;
  pageH: number;
  /** Drawing area (px). */
  draw: { x: number; y: number; w: number; h: number };
  /** Legend strip (px) — bottom in landscape, right in portrait. */
  legend: { x: number; y: number; w: number; h: number; horizontal: boolean };
  /** Title block (px) — bottom strip. */
  title: { x: number; y: number; w: number; h: number };
  /** Physical label font size, px. */
  labelFontPx: number;
}

export interface SheetOptions {
  paper?: PaperName;
  orientation?: Orientation;
  marginMm?: number;
  labelFontMm?: number;
}

/** Compute the sheet layout (drawing area, legend strip, title block). */
export function sheetLayout(opts: SheetOptions = {}): SheetLayout {
  const paper = opts.paper ?? "A3";
  const orientation = opts.orientation ?? "landscape";
  const [pw, ph] = PAPER_MM[paper];
  const [wmm, hmm] = orientation === "landscape" ? [ph, pw] : [pw, ph];
  const M = mm(opts.marginMm ?? 12);
  const pageW = mm(wmm);
  const pageH = mm(hmm);
  const titleH = mm(24);
  const legendH = mm(30); // two rows: colour scale + NFPA-170 symbols
  const legendW = mm(46);

  if (orientation === "landscape") {
    // legend strip along the bottom (above the title block)
    const title = { x: M, y: pageH - M - titleH, w: pageW - 2 * M, h: titleH };
    const legend = { x: M, y: title.y - mm(4) - legendH, w: pageW - 2 * M, h: legendH, horizontal: true };
    const draw = { x: M, y: M, w: pageW - 2 * M, h: legend.y - mm(4) - M };
    return { paper, orientation, pageW, pageH, draw, legend, title, labelFontPx: mm(opts.labelFontMm ?? 2.3) };
  }
  // portrait: legend column on the right, title block across the bottom
  const title = { x: M, y: pageH - M - titleH, w: pageW - 2 * M, h: titleH };
  const legend = { x: pageW - M - legendW, y: M, w: legendW, h: title.y - mm(4) - M, horizontal: false };
  const draw = { x: M, y: M, w: legend.x - mm(4) - M, h: title.y - mm(4) - M };
  return { paper, orientation, pageW, pageH, draw, legend, title, labelFontPx: mm(opts.labelFontMm ?? 2.3) };
}

/** Rough text-box size for a string at a given font px (Arial-ish metrics). */
export function measureBox(text: string, fontPx: number): { width: number; height: number } {
  return { width: text.length * fontPx * 0.56 + 4, height: fontPx * 1.25 + 2 };
}
