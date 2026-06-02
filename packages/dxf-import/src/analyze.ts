/**
 * Analyze a parsed DXF so the import UI can present EVERY layer with a guessed
 * role and let the user re-map it. Drives the "selectable mapping" requirement.
 */
import type { DxfDoc, DxfEntity } from "./parse";
import { insunitName } from "./parse";

export type LayerRole = "pipes" | "heads" | "valves" | "node-id" | "pipe-size" | "length" | "pressure" | "coverage" | "annotation" | "ignore";

export interface LayerInfo {
  name: string;
  count: number;
  entityTypes: Record<string, number>;
  sampleTexts: string[];
  guessedRole: LayerRole;
}

export interface DxfAnalysis {
  layers: LayerInfo[];
  entityTypes: Record<string, number>;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  is3D: boolean;
  insunits: number;
  insunitsName: string;
  lineCount: number;
  circleCount: number;
  textCount: number;
  insertCount: number;
}

/** Common metric nominal bores (mm), used to recognise pipe-size text. */
const SIZE_SET = new Set([15, 20, 25, 32, 40, 50, 65, 80, 90, 100, 125, 150, 200, 250, 300, 350, 400]);

function classifyText(samples: string[]): LayerRole | undefined {
  if (samples.length === 0) return undefined;
  let sizes = 0, ints = 0, decimals = 0, coverage = 0, pressure = 0;
  for (const s of samples) {
    if (/m2|m²/i.test(s)) coverage++;
    else if (/bar|psi|kpa/i.test(s)) pressure++;
    else if (/^\d+$/.test(s)) {
      ints++;
      if (SIZE_SET.has(Number(s))) sizes++;
    } else if (/^\.?\d+\.?\d*$/.test(s)) decimals++;
  }
  const n = samples.length;
  if (coverage / n > 0.4) return "coverage";
  if (pressure / n > 0.4) return "pressure";
  if (sizes / Math.max(1, ints) > 0.6 && ints / n > 0.5) return "pipe-size";
  if (ints / n > 0.5) return "node-id";
  if (decimals / n > 0.4) return "length";
  return "annotation";
}

function guessRole(types: Record<string, number>, sampleTexts: string[]): LayerRole {
  const top = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === "LINE" || top === "LWPOLYLINE" || top === "POLYLINE") return "pipes";
  if (top === "CIRCLE" || top === "ARC") return "heads";
  if (top === "INSERT") return "valves";
  if (top === "TEXT" || top === "MTEXT") return classifyText(sampleTexts) ?? "annotation";
  return "annotation";
}

export function analyzeDxf(doc: DxfDoc): DxfAnalysis {
  const byLayer = new Map<string, DxfEntity[]>();
  const entityTypes: Record<string, number> = {};
  let min: [number, number, number] = [Infinity, Infinity, Infinity];
  let max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let nonzeroZ = 0;

  for (const e of doc.entities) {
    (byLayer.get(e.layer) ?? byLayer.set(e.layer, []).get(e.layer)!).push(e);
    entityTypes[e.type] = (entityTypes[e.type] ?? 0) + 1;
    for (const v of e.vertices) {
      min = [Math.min(min[0], v.x), Math.min(min[1], v.y), Math.min(min[2], v.z)];
      max = [Math.max(max[0], v.x), Math.max(max[1], v.y), Math.max(max[2], v.z)];
      if (Math.abs(v.z) > 1e-6) nonzeroZ++;
    }
  }
  if (!Number.isFinite(min[0])) { min = [0, 0, 0]; max = [0, 0, 0]; }

  const layers: LayerInfo[] = [];
  for (const [name, ents] of byLayer) {
    const types: Record<string, number> = {};
    const sampleTexts: string[] = [];
    for (const e of ents) {
      types[e.type] = (types[e.type] ?? 0) + 1;
      if ((e.type === "TEXT" || e.type === "MTEXT") && e.text && sampleTexts.length < 60) sampleTexts.push(e.text);
    }
    layers.push({ name, count: ents.length, entityTypes: types, sampleTexts: sampleTexts.slice(0, 12), guessedRole: guessRole(types, sampleTexts) });
  }
  layers.sort((a, b) => b.count - a.count);

  return {
    layers,
    entityTypes,
    bbox: { min, max },
    is3D: nonzeroZ > 0,
    insunits: doc.insunits,
    insunitsName: insunitName(doc.insunits),
    lineCount: entityTypes["LINE"] ?? 0,
    circleCount: entityTypes["CIRCLE"] ?? 0,
    textCount: (entityTypes["TEXT"] ?? 0) + (entityTypes["MTEXT"] ?? 0),
    insertCount: entityTypes["INSERT"] ?? 0,
  };
}
