/**
 * @rads/labeling — renderer-agnostic 2D label placement with leader lines.
 *
 * The caller has already projected each 3D anchor to 2D (screen px for the
 * viewer, paper px for print) and measured the text box (w×h). This engine
 * places non-overlapping label boxes around their anchors, drawing a leader
 * line when a box is displaced. The SAME engine runs in screen space (viewer,
 * frame-budgeted) and paper space (print, full convergence).
 *
 * Guarantee: placed (visible) boxes never overlap each other or already-placed
 * boxes — greedy placement skips a label when no candidate is collision-free,
 * unless `forceHighPriority` keeps the most important ones.
 */

export interface LabelRequest {
  id: string;
  /** Anchor in viewport px. */
  x: number;
  y: number;
  text: string;
  category: string;
  /** Higher = placed first, kept when space is tight. */
  priority: number;
  /** Measured text-box size in px (caller measures with the target font). */
  width: number;
  height: number;
}

export interface Viewport {
  width: number;
  height: number;
  /** Keep labels at least this far from the viewport edge. */
  margin: number;
}

export interface Leader {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface PlacedLabel {
  id: string;
  category: string;
  text: string;
  /** Top-left of the placed box, px. */
  x: number;
  y: number;
  width: number;
  height: number;
  anchorX: number;
  anchorY: number;
  /** Present only when the box is displaced from its anchor. */
  leader?: Leader;
}

export interface PlaceOptions {
  /** Distance from anchor to the displaced box, px. Default 10. */
  leaderLength?: number;
  /** Minimum gap between boxes, px. Default 2. */
  gap?: number;
  /** Only place labels whose category is enabled (omit = all). */
  enabledCategories?: Iterable<string>;
  /** Hard cap on label count (keep highest priority). Omit = no cap. */
  maxLabels?: number;
  /** Spatial-thinning cell size px; keeps the top label(s) per cell at low zoom. Omit = off. */
  thinCellSize?: number;
  /** Max labels kept per thinning cell. Default 3. */
  thinPerCell?: number;
}

export interface PlaceResult {
  placed: PlacedLabel[];
  /** Ids that could not be placed without overlap. */
  hidden: string[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

// 8 surrounding directions, NE first (screen y points down). Tried at expanding
// rings: ring 0 = adjacent (no leader), ring ≥ 1 = pushed out (leader drawn).
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [1, -1],
  [1, 0],
  [1, 1],
  [0, -1],
  [0, 1],
  [-1, -1],
  [-1, 0],
  [-1, 1],
];
const RINGS = [0, 1, 2, 3, 4, 5];
/** Adjacent gap from anchor to the box's near edge at ring 0, px. */
const PAD = 3;
/** Leaders are drawn when the box's nearest point is farther than this, px. */
const LEADER_THRESHOLD = 7;

function overlaps(a: Box, b: Box, gap: number): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

function inViewport(b: Box, vp: Viewport): boolean {
  return b.x >= vp.margin && b.y >= vp.margin && b.x + b.w <= vp.width - vp.margin && b.y + b.h <= vp.height - vp.margin;
}

/** Uniform grid spatial index for fast neighborhood overlap queries. */
class Grid {
  private cell: number;
  private map = new Map<string, Box[]>();
  constructor(cell: number) {
    this.cell = Math.max(8, cell);
  }
  private keys(b: Box): string[] {
    const ks: string[] = [];
    const x0 = Math.floor(b.x / this.cell), x1 = Math.floor((b.x + b.w) / this.cell);
    const y0 = Math.floor(b.y / this.cell), y1 = Math.floor((b.y + b.h) / this.cell);
    for (let i = x0; i <= x1; i++) for (let j = y0; j <= y1; j++) ks.push(`${i},${j}`);
    return ks;
  }
  collides(b: Box, gap: number): boolean {
    for (const k of this.keys({ x: b.x - gap, y: b.y - gap, w: b.w + 2 * gap, h: b.h + 2 * gap })) {
      for (const o of this.map.get(k) ?? []) if (overlaps(b, o, gap)) return true;
    }
    return false;
  }
  add(b: Box): void {
    for (const k of this.keys(b)) (this.map.get(k) ?? this.map.set(k, []).get(k)!).push(b);
  }
}

/** Nearest point on box `b` to point (px,py) — the leader attach point. */
function nearestOnBox(b: Box, px: number, py: number): [number, number] {
  return [Math.max(b.x, Math.min(px, b.x + b.w)), Math.max(b.y, Math.min(py, b.y + b.h))];
}

export function placeLabels(requests: LabelRequest[], viewport: Viewport, options: PlaceOptions = {}): PlaceResult {
  const L = options.leaderLength ?? 10;
  const gap = options.gap ?? 2;
  const enabled = options.enabledCategories ? new Set(options.enabledCategories) : undefined;

  let pool = enabled ? requests.filter((r) => enabled.has(r.category)) : requests.slice();

  // spatial thinning (LOD): keep the top-priority N per cell
  if (options.thinCellSize) {
    const per = options.thinPerCell ?? 3;
    const cells = new Map<string, LabelRequest[]>();
    for (const r of pool) {
      const k = `${Math.floor(r.x / options.thinCellSize)},${Math.floor(r.y / options.thinCellSize)}`;
      (cells.get(k) ?? cells.set(k, []).get(k)!).push(r);
    }
    pool = [];
    for (const group of cells.values()) {
      group.sort((a, b) => b.priority - a.priority);
      pool.push(...group.slice(0, per));
    }
  }

  // deterministic order: priority desc, then position, then id
  pool.sort((a, b) => b.priority - a.priority || a.y - b.y || a.x - b.x || a.id.localeCompare(b.id));
  if (options.maxLabels !== undefined) pool = pool.slice(0, options.maxLabels);

  const grid = new Grid(Math.max(32, L * 3));
  const placed: PlacedLabel[] = [];
  const hidden: string[] = [];

  for (const r of pool) {
    let chosen: Box | undefined;
    outer: for (const ring of RINGS) {
      const edge = PAD + ring * L;
      for (const [dx, dy] of DIRS) {
        const cx = r.x + dx * (edge + r.width / 2);
        const cy = r.y + dy * (edge + r.height / 2);
        const box: Box = { x: cx - r.width / 2, y: cy - r.height / 2, w: r.width, h: r.height };
        if (!inViewport(box, viewport)) continue;
        if (grid.collides(box, gap)) continue;
        chosen = box;
        break outer;
      }
    }
    if (!chosen) {
      hidden.push(r.id);
      continue;
    }
    grid.add(chosen);
    const label: PlacedLabel = {
      id: r.id,
      category: r.category,
      text: r.text,
      x: chosen.x,
      y: chosen.y,
      width: r.width,
      height: r.height,
      anchorX: r.x,
      anchorY: r.y,
    };
    const [lx, ly] = nearestOnBox(chosen, r.x, r.y);
    if (Math.hypot(lx - r.x, ly - r.y) > LEADER_THRESHOLD) label.leader = { x1: r.x, y1: r.y, x2: lx, y2: ly };
    placed.push(label);
  }

  return { placed, hidden };
}

/** True if any two boxes in the list overlap (test/QA helper). */
export function anyOverlap(boxes: { x: number; y: number; width: number; height: number }[], gap = 0): boolean {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!;
      if (overlaps({ x: a.x, y: a.y, w: a.width, h: a.height }, { x: b.x, y: b.y, w: b.width, h: b.height }, gap)) return true;
    }
  }
  return false;
}
