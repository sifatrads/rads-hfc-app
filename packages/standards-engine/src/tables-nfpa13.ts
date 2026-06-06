/**
 * NFPA 13 (2019) Chapter 27 reference tables for equivalent pipe lengths and
 * C-value adjustment. Transcribed from
 * NFPA/NFPA_13_2019_Chapter_27_Plans_and_Calculations.md.
 *
 * ⚠ AUDIT: these tables are flagged for an independent snapshot audit against
 * the printed code before production use (the actual per-fitting equivalent
 * lengths used in a calc come from the project model; this is the reference
 * table for the "Equivalent Pipe Lengths of Valves and Fittings" report sheet
 * and for computing equivalent length when a fitting has none).
 */

/** Table 27.2.3.2.1 — C value multiplier (Table 27.2.3.1.1 is tabulated at C = 120). */
export const C_VALUE_MULTIPLIER: Record<number, number> = {
  100: 0.713,
  120: 1.0,
  130: 1.16,
  140: 1.33,
  150: 1.51,
};

/** Multiply Table 27.2.3.1.1 equivalent lengths by this for a given C (interpolated). */
export function cValueMultiplier(cFactor: number): number {
  const exact = C_VALUE_MULTIPLIER[cFactor];
  if (exact !== undefined) return exact;
  const cs = Object.keys(C_VALUE_MULTIPLIER).map(Number).sort((a, b) => a - b);
  if (cFactor <= cs[0]!) return C_VALUE_MULTIPLIER[cs[0]!]!;
  if (cFactor >= cs[cs.length - 1]!) return C_VALUE_MULTIPLIER[cs[cs.length - 1]!]!;
  for (let i = 0; i < cs.length - 1; i++) {
    const lo = cs[i]!, hi = cs[i + 1]!;
    if (cFactor >= lo && cFactor <= hi) {
      const t = (cFactor - lo) / (hi - lo);
      return C_VALUE_MULTIPLIER[lo]! + t * (C_VALUE_MULTIPLIER[hi]! - C_VALUE_MULTIPLIER[lo]!);
    }
  }
  return 1;
}

/** Schedule 40 steel internal diameters, in. (Schedule 30 for ≥ 8 in.). */
export const SCH40_ID_IN: Record<string, number> = {
  "1/2": 0.622,
  "3/4": 0.824,
  "1": 1.049,
  "1-1/4": 1.38,
  "1-1/2": 1.61,
  "2": 2.067,
  "2-1/2": 2.469,
  "3": 3.068,
  "3-1/2": 3.548,
  "4": 4.026,
  "5": 5.047,
  "6": 6.065,
  "8": 7.981,
  "10": 10.02,
  "12": 11.938,
};

/**
 * §27.2.3.1.3.1 — equivalent-length modifier for an internal diameter different
 * from Schedule 40:  (actual ID / Sch-40 ID)^4.87.
 */
export function equivalentLengthModifier(actualIdIn: number, nominalSize: string): number {
  const sch40 = SCH40_ID_IN[nominalSize];
  if (!sch40 || !actualIdIn) return 1;
  return Math.pow(actualIdIn / sch40, 4.87);
}

const SIZES = ["1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4", "5", "6", "8", "10", "12"] as const;

/** Build a {size → ft} row; `null` marks "not tabulated" for that size. */
function row(values: (number | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  SIZES.forEach((s, i) => {
    const v = values[i];
    if (typeof v === "number") out[s] = v;
  });
  return out;
}

/**
 * Table 27.2.3.1.1 — equivalent Schedule-40 length (ft) at C = 120, keyed by a
 * normalized fitting id then nominal size. Elbow/tee rows use the canonical
 * published values; valve rows follow the provided source and are AUDIT-flagged.
 */
// Verified against NFPA 13, 2019 Edition, Table 27.2.3.1.1 "Equivalent Schedule 40
// Steel Pipe Length Chart" (equivalent feet at C = 120). Sizes 1/2" and 3/4" are
// omitted (sprinkler fittings start at 1"); "—" = not listed for that size.
export const FITTING_EQUIV_LENGTH_FT: Record<string, Record<string, number>> = {
  //               1   1¼  1½  2   2½  3   3½  4   5   6   8   10  12
  "elbow-45": row([1, 1, 2, 2, 3, 3, 3, 4, 5, 7, 9, 11, 13]),
  "elbow-90": row([2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 18, 22, 27]),
  "elbow-90-long": row([2, 2, 2, 3, 4, 5, 5, 6, 8, 9, 13, 16, 18]),
  tee: row([5, 6, 8, 10, 12, 15, 17, 20, 25, 30, 35, 50, 60]), // tee/cross, flow turned 90°
  "gate-valve": row([null, null, null, 1, 1, 1, 1, 2, 2, 3, 4, 5, 6]),
  "butterfly-valve": row([null, null, null, 6, 7, 10, null, 12, 9, 10, 12, 19, 21]),
  "check-valve": row([5, 7, 9, 11, 14, 16, 19, 22, 27, 32, null, null, null]), // swing check
  "flow-switch": row([6, 9, 10, 14, 17, 22, null, 30, null, 16, 22, 29, 36]), // vane-type — ⚠ AUDIT (table row hard to read)
};

/** Core rows verified vs NFPA 13 2019 Table 27.2.3.1.1; the vane-type flow
 * switch row is still approximate (confirm against the printed table). */
export const FITTING_TABLE_AUDIT_REQUIRED = false;

/** Map a model fitting/valve `type` string to a Table 27.2.3.1.1 row id. */
export function normalizeFittingId(type: string): string | undefined {
  const t = type.toLowerCase();
  if (t.includes("45")) return "elbow-45";
  if (t.includes("long") && t.includes("elbow")) return "elbow-90-long";
  if (t.includes("elbow") || (t.includes("90") && !t.includes("tee"))) return "elbow-90";
  if (t.includes("tee") || t.includes("cross")) return "tee";
  if (t.includes("butterfly")) return "butterfly-valve";
  if (t.includes("gate")) return "gate-valve";
  if (t.includes("check")) return "check-valve";
  if (t.includes("flow") || t.includes("switch")) return "flow-switch";
  return undefined; // coupling / reducer / unlisted → negligible
}

export interface EquivLengthOptions {
  /** Apply the C-value multiplier (Table 27.2.3.2.1). */
  cFactor?: number;
  /** Apply the diameter modifier (§27.2.3.1.3.1) for non-Sch-40 ID. */
  actualIdIn?: number;
}

/**
 * Equivalent Schedule-40 length (ft) for a fitting at a nominal size, with the
 * C-value multiplier and (optional) diameter modifier applied. Returns
 * `undefined` for unlisted fittings/sizes.
 */
export function fittingEquivalentLengthFt(fitting: string, nominalSize: string, opts: EquivLengthOptions = {}): number | undefined {
  const id = normalizeFittingId(fitting);
  if (!id) return undefined;
  const base = FITTING_EQUIV_LENGTH_FT[id]?.[nominalSize];
  if (base === undefined) return undefined;
  const cm = opts.cFactor !== undefined ? cValueMultiplier(opts.cFactor) : 1;
  const dm = opts.actualIdIn !== undefined ? equivalentLengthModifier(opts.actualIdIn, nominalSize) : 1;
  return base * cm * dm;
}

/** Alphanumeric fitting codes → fitting type (Canute-style: 2E = 2×elbow). */
export const FITTING_CODE_MAP: Record<string, string> = {
  E: "elbow-90", LE: "elbow-90-long", FE: "elbow-45", T: "tee", X: "tee",
  GV: "gate-valve", BV: "butterfly-valve", CV: "check-valve", FS: "flow-switch",
};

export interface ParsedFitting { type: string; qty: number; equivalentLengthFt: number }

/**
 * Parse a fitting-code string (e.g. "2E 1T", "E,GV") into fitting entries with
 * total Sch-40 equivalent length at a nominal size. Unknown tokens are skipped.
 */
export function parseFittingCodes(code: string, nominalSize: string): ParsedFitting[] {
  const out: ParsedFitting[] = [];
  for (const tok of (code ?? "").toUpperCase().split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d*)([A-Z]+)$/.exec(tok);
    if (!m) continue;
    const qty = m[1] ? parseInt(m[1], 10) : 1;
    const type = FITTING_CODE_MAP[m[2]!];
    if (!type || qty <= 0) continue;
    const each = fittingEquivalentLengthFt(type, nominalSize) ?? 0;
    out.push({ type, qty, equivalentLengthFt: Math.round(each * qty * 100) / 100 });
  }
  return out;
}
