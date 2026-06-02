/**
 * Unit-aware label formatting. Values are assumed to already be in the
 * project's unit system (imperial for NFPA, metric for EN) — we only choose the
 * suffix and rounding, matching the "match project units" decision.
 */
import type { Units } from "@rads/model";

const IMPERIAL_MM: Record<string, number> = {
  "1/2": 15,
  "3/4": 20,
  "1": 25,
  "1-1/4": 32,
  "1-1/2": 40,
  "2": 50,
  "2-1/2": 65,
  "3": 80,
  "3-1/2": 90,
  "4": 100,
  "5": 125,
  "6": 150,
  "8": 200,
  "10": 250,
  "12": 300,
};

/** Nominal bore in mm, for stroke-width/radius scaling. Returns 0 if unknown. */
export function nominalSizeToMm(nominalSize: string | undefined, units: Units): number {
  if (!nominalSize) return 0;
  if (units === "metric") {
    const n = parseFloat(nominalSize);
    return Number.isFinite(n) ? n : 0;
  }
  return IMPERIAL_MM[nominalSize] ?? 0;
}

const round = (v: number, d = 1) => {
  const f = 10 ** d;
  return Math.round(v * f) / f;
};

export interface UnitFormatter {
  pressure(v: number | undefined): string;
  flow(v: number | undefined): string;
  len(v: number | undefined): string;
  size(nominalSize: string | undefined): string;
  velocity(v: number | undefined): string;
}

export function formatterFor(units: Units): UnitFormatter {
  const metric = units === "metric";
  const u = {
    p: metric ? "bar" : "psi",
    q: metric ? "L/min" : "gpm",
    l: metric ? "m" : "ft",
    s: metric ? "mm" : '"',
    v: metric ? "m/s" : "ft/s",
  };
  // Values are stored/computed in imperial (the calc engine is US-customary);
  // for metric display we convert imperial → metric here.
  const C = metric ? { p: 0.0689476, q: 3.785412, l: 0.3048, v: 0.3048 } : { p: 1, q: 1, l: 1, v: 1 };
  const opt = (v: number | undefined, factor: number, d: number, suffix: string, sep = " ") =>
    v === undefined || !Number.isFinite(v) ? "" : `${round(v * factor, d)}${sep}${suffix}`;
  return {
    pressure: (v) => opt(v, C.p, metric ? 2 : 1, u.p),
    flow: (v) => opt(v, C.q, metric ? 0 : 1, u.q),
    len: (v) => opt(v, C.l, metric ? 2 : 1, u.l),
    velocity: (v) => opt(v, C.v, 1, u.v),
    size: (nominalSize) => (nominalSize ? (metric ? `${nominalSize} ${u.s}` : `${nominalSize}${u.s}`) : ""),
  };
}
