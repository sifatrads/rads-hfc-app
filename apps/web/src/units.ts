/**
 * Unit-aware display helpers for the web tabs — the model is imperial-internal
 * (psi/gpm/ft/ft²/gal), so result tabs convert for display when
 * model.meta.units === "metric". Mirrors the report's units() so the in-app
 * Summary/Analysis/Graph read the same as the exported report.
 */
import type { ProjectModel } from "@rads/model";

export function units(model: ProjectModel) {
  const metric = model.meta.units === "metric";
  // density: 1 gpm/ft² = 40.746 mm/min; area: 1 ft² = 0.092903 m²; 1 gal = 3.78541 L.
  const k = { p: metric ? 0.0689476 : 1, q: metric ? 3.785412 : 1, l: metric ? 0.3048 : 1, v: metric ? 0.3048 : 1, dens: metric ? 40.7458 : 1, area: metric ? 0.092903 : 1, gal: metric ? 3.785412 : 1 };
  const U = { p: metric ? "bar" : "psi", q: metric ? "L/min" : "gpm", l: metric ? "m" : "ft", v: metric ? "m/s" : "ft/s", dens: metric ? "mm/min" : "gpm/ft²", area: metric ? "m²" : "ft²", gal: metric ? "L" : "gal" };
  const fmt = (val: number | undefined, factor: number, d: number) => (val === undefined || !Number.isFinite(val) ? "—" : (val * factor).toFixed(d));
  return {
    metric,
    U,
    // numeric converters (for chart data points that must be plotted in display units)
    pN: (v: number) => v * k.p,
    qN: (v: number) => v * k.q,
    p: (v?: number, d = metric ? 2 : 1) => fmt(v, k.p, d),
    q: (v?: number, d = metric ? 0 : 1) => fmt(v, k.q, d),
    l: (v?: number, d = 1) => fmt(v, k.l, d),
    v: (v?: number, d = 1) => fmt(v, k.v, d),
    area: (v?: number, d = metric ? 1 : 0) => fmt(v, k.area, d),
    pU: (v?: number, d?: number) => `${fmt(v, k.p, d ?? (metric ? 2 : 1))} ${U.p}`,
    qU: (v?: number, d?: number) => `${fmt(v, k.q, d ?? (metric ? 0 : 1))} ${U.q}`,
    vU: (v?: number, d = 1) => `${fmt(v, k.v, d)} ${U.v}`,
    densU: (v?: number, d?: number) => `${fmt(v, k.dens, d ?? (metric ? 1 : 3))} ${U.dens}`,
    areaU: (v?: number, d?: number) => `${fmt(v, k.area, d ?? (metric ? 1 : 0))} ${U.area}`,
    galU: (v?: number, d = 0) => `${(v === undefined || !Number.isFinite(v) ? "—" : Math.round(v * k.gal).toLocaleString())} ${U.gal}`,
  };
}
