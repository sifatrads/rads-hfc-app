/**
 * Minimal, dependency-free DXF reader. Parses the ENTITIES section into a flat
 * record list (LINE / LWPOLYLINE / POLYLINE / CIRCLE / TEXT / MTEXT / INSERT),
 * each with its layer, vertices (x,y,z), and any text / block / attributes.
 * Enough to reconstruct a pipe network; not a full DXF implementation.
 */

export interface DxfPoint {
  x: number;
  y: number;
  z: number;
}

export type DxfEntityType = "LINE" | "LWPOLYLINE" | "POLYLINE" | "CIRCLE" | "ARC" | "TEXT" | "MTEXT" | "INSERT" | "POINT" | string;

export interface DxfEntity {
  type: DxfEntityType;
  layer: string;
  vertices: DxfPoint[];
  text?: string;
  radius?: number;
  blockName?: string;
  attribs?: { tag: string; value: string }[];
}

export interface DxfDoc {
  entities: DxfEntity[];
  insunits: number;
}

const INSUNIT_NAME: Record<number, string> = { 0: "unitless", 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m" };
export const insunitName = (n: number): string => INSUNIT_NAME[n] ?? "unitless";

type Pair = [number, string];

function pairs(text: string): Pair[] {
  const lines = text.split(/\r\n|\r|\n/);
  const out: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i]);
    if (Number.isFinite(code)) out.push([code, (lines[i + 1] ?? "").trim()]);
  }
  return out;
}

/** Decode MTEXT/TEXT formatting codes to plain text (strip \A;, \f…;, {}, \P→space). */
function plainText(s: string): string {
  return s
    .replace(/\\[A-Za-z][^;]*;/g, "")
    .replace(/\\P/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\\~/g, " ")
    .trim();
}

function finalize(type: string, codes: Map<number, string[]>): DxfEntity | undefined {
  const layer = codes.get(8)?.[0] ?? "0";
  const xs = (codes.get(10) ?? []).map(Number);
  const ys = (codes.get(20) ?? []).map(Number);
  const zs = (codes.get(30) ?? []).map(Number);
  const elev = Number(codes.get(38)?.[0] ?? "NaN");
  const point = (i: number): DxfPoint => ({ x: xs[i] ?? 0, y: ys[i] ?? 0, z: zs[i] ?? (Number.isFinite(elev) ? elev : 0) });

  switch (type) {
    case "LINE": {
      const a: DxfPoint = { x: xs[0] ?? 0, y: ys[0] ?? 0, z: zs[0] ?? 0 };
      const b: DxfPoint = { x: Number(codes.get(11)?.[0] ?? 0), y: Number(codes.get(21)?.[0] ?? 0), z: Number(codes.get(31)?.[0] ?? 0) };
      return { type, layer, vertices: [a, b] };
    }
    case "LWPOLYLINE":
    case "POLYLINE": {
      const n = Math.max(xs.length, ys.length);
      const verts: DxfPoint[] = [];
      for (let i = 0; i < n; i++) verts.push(point(i));
      const closed = (Number(codes.get(70)?.[0] ?? 0) & 1) === 1;
      if (closed && verts[0]) verts.push(verts[0]);
      return { type, layer, vertices: verts };
    }
    case "CIRCLE":
    case "ARC":
      return { type, layer, vertices: [point(0)], radius: Number(codes.get(40)?.[0] ?? 0) };
    case "TEXT":
    case "MTEXT":
      return { type, layer, vertices: [point(0)], text: plainText((codes.get(1) ?? []).join("")) };
    case "INSERT":
      return { type, layer, vertices: [point(0)], blockName: codes.get(2)?.[0] ?? "" };
    case "POINT":
      return { type, layer, vertices: [point(0)] };
    default:
      return undefined;
  }
}

export function parseDxf(text: string): DxfDoc {
  const ps = pairs(text);
  let insunits = 0;
  let inEntities = false;
  let sawEntitiesHeader = false;
  const entities: DxfEntity[] = [];
  let curType: string | null = null;
  let codes = new Map<number, string[]>();
  let pendingInsert: DxfEntity | null = null;

  const flush = () => {
    if (!curType) return;
    if (curType === "ATTRIB" && pendingInsert) {
      const tag = codes.get(2)?.[0] ?? "";
      const value = plainText((codes.get(1) ?? []).join(""));
      (pendingInsert.attribs ??= []).push({ tag, value });
    } else {
      const e = finalize(curType, codes);
      if (e) {
        entities.push(e);
        pendingInsert = e.type === "INSERT" ? e : null;
      }
    }
    codes = new Map();
  };

  for (let i = 0; i < ps.length; i++) {
    const [code, val] = ps[i]!;
    if (code === 9 && val === "$INSUNITS") {
      insunits = Number(ps[i + 1]?.[1] ?? "0");
      continue;
    }
    if (code === 0) {
      if (val === "SECTION") {
        const name = ps[i + 1]?.[1] ?? "";
        inEntities = name === "ENTITIES";
        if (inEntities) sawEntitiesHeader = true;
        flush();
        curType = null;
        continue;
      }
      if (val === "ENDSEC") {
        flush();
        curType = null;
        inEntities = false;
        continue;
      }
      if (!inEntities) {
        continue;
      }
      flush();
      curType = val;
      continue;
    }
    if (inEntities && curType) (codes.get(code) ?? codes.set(code, []).get(code)!).push(val);
  }
  flush();

  // Some exporters omit the section name pairing the way we expect; if nothing
  // was captured, retry treating every 0-record as an entity.
  if (!sawEntitiesHeader && entities.length === 0) {
    /* no-op: structure unsupported */
  }
  return { entities, insunits };
}
