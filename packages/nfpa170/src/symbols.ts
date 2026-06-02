/**
 * NFPA 170 (2015) fire-safety symbol primitives, traced from Table 7.2 (Water
 * Supply & Distribution) and Table 7.6.2 (Fire Sprinklers).
 *
 * Each symbol is defined in a unit coordinate box (x,y ∈ [-1.4, 1.4], y DOWN),
 * centered on the device. Inline devices (valves) connect at (-1,0)…(1,0). A
 * renderer scales by a radius and translates to place it; this keeps the set
 * renderer-agnostic (SVG drawing sheet, @react-pdf, or a WebGL sprite atlas).
 */

export type Prim =
  | { k: "line"; x1: number; y1: number; x2: number; y2: number }
  | { k: "circle"; cx: number; cy: number; r: number; fill?: boolean }
  | { k: "rect"; x: number; y: number; w: number; h: number; fill?: boolean }
  | { k: "poly"; pts: [number, number][]; fill?: boolean; closed?: boolean };

export type SymbolCategory = "valve" | "device" | "sprinkler" | "pipe" | "equipment";

export interface SymbolDef {
  id: string;
  label: string;
  category: SymbolCategory;
  /** Sits on a pipe run (draw connecting stubs) vs a terminal/area device. */
  inline: boolean;
  prims: Prim[];
}

const L = (x1: number, y1: number, x2: number, y2: number): Prim => ({ k: "line", x1, y1, x2, y2 });
const C = (cx: number, cy: number, r: number, fill = false): Prim => ({ k: "circle", cx, cy, r, fill });
const R = (x: number, y: number, w: number, h: number, fill = false): Prim => ({ k: "rect", x, y, w, h, fill });
const P = (pts: [number, number][], fill = false, closed = true): Prim => ({ k: "poly", pts, fill, closed });

/** The valve "bowtie" base (two triangles meeting at center) + connection stubs. */
const bowtie = (): Prim[] => [
  P([[-0.55, -0.5], [0, 0], [-0.55, 0.5]]),
  P([[0.55, -0.5], [0, 0], [0.55, 0.5]]),
  L(-1, 0, -0.55, 0),
  L(0.55, 0, 1, 0),
];
const stem = (topY = -0.85): Prim[] => [L(0, -0.45, 0, topY)];

const SYMBOLS: SymbolDef[] = [
  // ── sprinklers (Table 7.6.2) ──
  { id: "sprinkler-upright", label: "Upright sprinkler", category: "sprinkler", inline: false, prims: [C(0, 0, 0.45), L(-1, 0, -0.45, 0), L(0.45, 0, 1, 0)] },
  { id: "sprinkler-pendent", label: "Pendent sprinkler", category: "sprinkler", inline: false, prims: [C(0, 0, 0.45, true), L(-1, 0, -0.45, 0), L(0.45, 0, 1, 0)] },
  { id: "sprinkler-upright-sprig", label: "Upright sprinkler on sprig", category: "sprinkler", inline: false, prims: [C(0, 0, 0.45), C(0, 0, 0.22), L(-1, 0, -0.45, 0), L(0.45, 0, 1, 0)] },
  { id: "sprinkler-sidewall", label: "Sidewall sprinkler", category: "sprinkler", inline: false, prims: [P([[-0.45, -0.4], [0.45, -0.4], [0, 0.4]]), L(-1, -0.4, 1, -0.4)] },
  { id: "sprinkler-generic", label: "Sprinkler", category: "sprinkler", inline: false, prims: [C(0, 0, 0.4), L(-0.4, 0, 0.4, 0), L(0, -0.4, 0, 0.4)] },

  // ── valves (Table 7.2) ──
  { id: "valve-gate", label: "Gate / general valve", category: "valve", inline: true, prims: bowtie() },
  { id: "valve-nonindicating", label: "Nonindicating (NRS) valve", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.8)] },
  { id: "valve-osy", label: "OS&Y valve (rising stem)", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.78), L(-0.22, -0.78, 0.22, -0.78), L(0, -0.6, 0, -0.98)] },
  { id: "valve-butterfly", label: "Indicating butterfly valve", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.7), R(-0.18, -1.04, 0.36, 0.34, true)] },
  { id: "valve-piv", label: "Post-indicator valve (PIV)", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.7), C(0, -0.88, 0.2, true)] },
  { id: "valve-key", label: "Key-operated valve", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.75), R(-0.12, -0.95, 0.24, 0.22, true)] },
  { id: "valve-prv", label: "Pressure-regulating valve", category: "valve", inline: true, prims: [...bowtie(), L(0, -0.5, 0, -0.7), P([[-0.24, -0.7], [0.24, -0.7], [0, -1.02]], true)] },
  { id: "valve-relief", label: "Pressure relief valve", category: "valve", inline: true, prims: [...bowtie(), ...stem(-0.7), P([[-0.24, -0.7], [0.24, -0.7], [0, -1.02]])] },
  { id: "valve-check", label: "Check valve", category: "valve", inline: true, prims: [L(-1, 0, 1, 0), L(0.35, -0.55, 0.35, 0.55), P([[-0.45, -0.5], [-0.45, 0.5], [0.35, 0]], false), L(-0.1, 0.72, 0.3, 0.72), P([[0.3, 0.62], [0.45, 0.72], [0.3, 0.82]], true)] },
  {
    id: "valve-backflow",
    label: "Backflow preventer (double check)",
    category: "valve",
    inline: true,
    prims: [
      L(-1, 0, 1, 0),
      // left bowtie
      P([[-0.72, -0.4], [-0.45, 0], [-0.72, 0.4]]),
      P([[-0.18, -0.4], [-0.45, 0], [-0.18, 0.4]]),
      // right bowtie
      P([[0.18, -0.4], [0.45, 0], [0.18, 0.4]]),
      P([[0.72, -0.4], [0.45, 0], [0.72, 0.4]]),
    ],
  },

  // ── devices (Table 7.2) ──
  { id: "riser", label: "Riser", category: "pipe", inline: false, prims: [C(0, 0, 0.6), L(-0.42, -0.42, 0.42, 0.42), L(-0.42, 0.42, 0.42, -0.42)] },
  { id: "fdc-single", label: "Fire department connection", category: "device", inline: false, prims: [L(0, 1, 0, -0.35), C(0, -0.62, 0.34)] },
  { id: "fdc-siamese", label: "Siamese fire department connection", category: "device", inline: false, prims: [L(0, 1, 0, 0.1), L(0, 0.1, -0.45, -0.4), L(0, 0.1, 0.45, -0.4), C(-0.55, -0.55, 0.28), C(0.55, -0.55, 0.28)] },
  { id: "hydrant-public", label: "Public hydrant", category: "device", inline: false, prims: [C(0, 0, 0.5, true), L(0.5, 0, 1, 0), L(0.7, -0.18, 0.7, 0.18)] },
  { id: "hydrant-private", label: "Private hydrant", category: "device", inline: false, prims: [C(0, 0, 0.5), L(0.5, 0, 1, 0), L(0.7, -0.18, 0.7, 0.18)] },
  { id: "pump", label: "Fire pump with driver", category: "equipment", inline: true, prims: [R(-0.95, -0.34, 0.85, 0.68, true), C(0.45, 0, 0.5, true)] },
  { id: "strainer", label: "Screen / strainer", category: "device", inline: true, prims: [L(-1, 0, -0.4, 0), L(0.4, 0, 1, 0), R(-0.4, -0.55, 0.8, 1.1), L(-0.4, 0.55, 0.4, -0.55)] },
  { id: "meter", label: "Meter", category: "device", inline: true, prims: [C(0, 0, 0.5), L(-0.3, 0.3, 0.25, -0.25), L(-1, 0, -0.5, 0), L(0.5, 0, 1, 0)] },
  { id: "flow-switch", label: "Waterflow switch", category: "device", inline: true, prims: [C(0, 0, 0.5), L(0, -0.5, 0, 0.5), P([[0, 0.5], [-0.16, 0.2], [0.16, 0.2]], true), L(-1, 0, -0.5, 0), L(0.5, 0, 1, 0)] },
  { id: "drain", label: "Drain", category: "device", inline: false, prims: [L(0, -0.8, 0, 0.2), P([[-0.3, 0.2], [0.3, 0.2], [0, 0.6]])] },
  { id: "tank", label: "Tank / reservoir", category: "equipment", inline: false, prims: [R(-1, -0.7, 2, 1.4), L(-1, -0.35, 1, -0.35)] },
];

export const SYMBOL_REGISTRY: Map<string, SymbolDef> = new Map(SYMBOLS.map((s) => [s.id, s]));

export function getSymbol(id: string): SymbolDef | undefined {
  return SYMBOL_REGISTRY.get(id);
}

export function allSymbols(): SymbolDef[] {
  return SYMBOLS.map((s) => s);
}

/** Map a scene/model device or sprinkler type id to an NFPA-170 symbol id. */
export function symbolIdFor(type: string): string {
  const t = type.toLowerCase();
  // sprinklers
  if (t.includes("pendent")) return "sprinkler-pendent";
  if (t.includes("sidewall")) return "sprinkler-sidewall";
  if (t.includes("sprig")) return "sprinkler-upright-sprig";
  if (t.includes("upright")) return "sprinkler-upright";
  // valves / devices (accept both scene ids like "valve-butterfly" and raw types)
  if (t.includes("butterfly")) return "valve-butterfly";
  if (t.includes("piv") || t.includes("post-indicator")) return "valve-piv";
  if (t.includes("osy") || t.includes("os&y")) return "valve-osy";
  if (t.includes("backflow")) return "valve-backflow";
  if (t.includes("prv") || t.includes("pressure-reducing") || t.includes("pressure-regulating")) return "valve-prv";
  if (t.includes("relief")) return "valve-relief";
  if (t.includes("check") || t.includes("alarm")) return "valve-check";
  if (t.includes("gate")) return "valve-gate";
  if (t.includes("flow")) return "flow-switch";
  if (t.includes("drain")) return "drain";
  if (t.includes("strainer")) return "strainer";
  if (t.includes("meter")) return "meter";
  if (t.includes("siamese")) return "fdc-siamese";
  if (t.includes("fdc")) return "fdc-single";
  if (t.includes("hydrant")) return t.includes("private") ? "hydrant-private" : "hydrant-public";
  if (t.includes("pump")) return "pump";
  if (t.includes("riser")) return "riser";
  if (t.includes("tank") || t.includes("reservoir")) return "tank";
  if (t.includes("valve")) return "valve-gate";
  return "valve-gate";
}
