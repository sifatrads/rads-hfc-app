/**
 * Recolor pipes/nodes by a selectable metric and emit a legend model. Writes
 * plain hex strings consumed by the viewer (per-instance color) and the PDF
 * renderer (stroke). Continuous metrics need calc results; when absent the
 * legend is flagged `needsCalc` and elements fall back to a neutral color.
 */
import type { AnnotatedScene, ColorMetric, ColorizeResult, LegendModel, LegendEntry, ScenePipe } from "./types";

const NEUTRAL = "#9aa7b0";
const NODE_DEFAULT = "#263238";
const SPRINKLER = "#e53935";

/** Role categorical scale (matches the prototype ROLE_COLOR). */
const ROLE_COLOR: Record<string, string> = {
  "supply-main": "#0b3d91",
  riser: "#0b3d91",
  "standpipe-riser": "#0b3d91",
  "express-riser": "#0b3d91",
  "feed-main": "#1565c0",
  "cross-main": "#1976d2",
  "branch-line": "#78909c",
};
const ROLE_LABEL: Record<string, string> = {
  "supply-main": "Supply / riser",
  "feed-main": "Feed main",
  "cross-main": "Cross main",
  "branch-line": "Branch line",
  "standpipe-riser": "Standpipe riser",
};

/** Color-blind-safe diverging palette (blue → red). */
const GRADIENT = ["#2c7bb6", "#abd9e9", "#ffffbf", "#fdae61", "#d7191c"];

const SIZE_BANDS: { max: number; color: string; label: string }[] = [
  { max: 25, color: "#c6dbef", label: "≤ 1″ (25 mm)" },
  { max: 40, color: "#9ecae1", label: "1¼–1½″ (32–40 mm)" },
  { max: 65, color: "#6baed6", label: "2–2½″ (50–65 mm)" },
  { max: 100, color: "#3182bd", label: "3–4″ (80–100 mm)" },
  { max: 150, color: "#08519c", label: "5–6″ (125–150 mm)" },
  { max: Infinity, color: "#08306b", label: "≥ 8″ (200 mm)" },
];

function hex(n: number): string {
  const c = Math.max(0, Math.min(255, Math.round(n)));
  return c.toString(16).padStart(2, "0");
}
function parse(c: string): [number, number, number] {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}
/** Sample a multi-stop gradient at t ∈ [0,1]. */
export function gradientAt(t: number, stops = GRADIENT): string {
  const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = parse(stops[i]!);
  const b = parse(stops[Math.min(i + 1, stops.length - 1)]!);
  return `#${hex(a[0] + (b[0] - a[0]) * f)}${hex(a[1] + (b[1] - a[1]) * f)}${hex(a[2] + (b[2] - a[2]) * f)}`;
}

function sizeColor(mm: number): { color: string; label: string } {
  for (const b of SIZE_BANDS) if (mm <= b.max) return b;
  return SIZE_BANDS[SIZE_BANDS.length - 1]!;
}

function gradientLegend(title: string, units: string, min: number, max: number, needsCalc: boolean): LegendModel {
  const entries: LegendEntry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n;
    const lo = min + (max - min) * t0;
    const hi = min + (max - min) * t1;
    entries.push({ swatch: gradientAt((t0 + t1) / 2), label: `${lo.toFixed(1)}–${hi.toFixed(1)}`, range: [lo, hi] });
  }
  return { title, units, kind: "gradient", entries, needsCalc };
}

type PipeMetricFn = (p: ScenePipe) => number | undefined;

const PIPE_METRIC: Partial<Record<ColorMetric, { fn: PipeMetricFn; title: string; units: string }>> = {
  velocity: { fn: (p) => p.result?.velocityFps, title: "Velocity", units: "ft/s" },
  flow: { fn: (p) => p.result?.flowGpm, title: "Flow", units: "gpm" },
  pressureDrop: { fn: (p) => p.result?.totalLossPsi ?? p.result?.frictionLossPsi, title: "Pressure drop", units: "psi" },
};

export function colorize(scene: AnnotatedScene, metric: ColorMetric): ColorizeResult {
  const pipeColors = new Map<string, string>();
  const nodeColors = new Map<string, string>();
  for (const n of scene.nodes) nodeColors.set(n.id, n.kind === "sprinkler" || n.kind === "hose-station" ? SPRINKLER : NODE_DEFAULT);

  let legend: LegendModel;

  if (metric === "role") {
    const seen = new Map<string, string>();
    for (const p of scene.pipes) {
      const c = ROLE_COLOR[p.role ?? ""] ?? NEUTRAL;
      pipeColors.set(p.id, c);
      if (p.role && ROLE_COLOR[p.role]) seen.set(p.role, c);
    }
    legend = {
      title: "Pipe role",
      kind: "categorical",
      entries: [...seen].map(([role, swatch]) => ({ swatch, label: ROLE_LABEL[role] ?? role })),
    };
  } else if (metric === "size") {
    const used = new Map<string, LegendEntry>();
    for (const p of scene.pipes) {
      const { color, label } = sizeColor(p.sizeMm || 0);
      pipeColors.set(p.id, color);
      used.set(label, { swatch: color, label });
    }
    legend = { title: "Pipe size", kind: "categorical", entries: [...used.values()] };
  } else if (metric === "material") {
    const palette = ["#1b9e77", "#d95f02", "#7570b3", "#e7298a", "#66a61e", "#e6ab02"];
    const byKey = new Map<string, string>();
    let i = 0;
    for (const p of scene.pipes) {
      const key = p.material ?? (p.cFactor ? `C${p.cFactor}` : "—");
      if (!byKey.has(key)) byKey.set(key, palette[i++ % palette.length]!);
      pipeColors.set(p.id, byKey.get(key)!);
    }
    legend = { title: "Material / C", kind: "categorical", entries: [...byKey].map(([label, swatch]) => ({ swatch, label })) };
  } else if (metric === "pressure") {
    // node coloring by total (or normal) pressure
    const vals = scene.nodes.map((n) => n.result?.totalPressurePsi ?? n.result?.normalPressurePsi).filter((v): v is number => v !== undefined);
    for (const p of scene.pipes) pipeColors.set(p.id, NEUTRAL);
    if (vals.length === 0) {
      legend = gradientLegend("Pressure", "psi", 0, 0, true);
    } else {
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const n of scene.nodes) {
        const v = n.result?.totalPressurePsi ?? n.result?.normalPressurePsi;
        if (v !== undefined) nodeColors.set(n.id, gradientAt(max === min ? 0.5 : (v - min) / (max - min)));
      }
      legend = gradientLegend("Pressure", "psi", min, max, false);
    }
  } else {
    const m = PIPE_METRIC[metric]!;
    const vals = scene.pipes.map(m.fn).filter((v): v is number => v !== undefined);
    if (vals.length === 0) {
      for (const p of scene.pipes) pipeColors.set(p.id, NEUTRAL);
      legend = gradientLegend(m.title, m.units, 0, 0, true);
    } else {
      const min = Math.min(...vals), max = Math.max(...vals);
      for (const p of scene.pipes) {
        const v = m.fn(p);
        pipeColors.set(p.id, v === undefined ? NEUTRAL : gradientAt(max === min ? 0.5 : (v - min) / (max - min)));
      }
      legend = gradientLegend(m.title, m.units, min, max, false);
    }
  }

  return { pipeColors, nodeColors, legend };
}
