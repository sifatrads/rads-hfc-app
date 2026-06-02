/**
 * Auto-layout: derive a 3D coordinate for every node from network topology,
 * pipe routing directions, and elevations — so a project with no explicit
 * geometry still renders as a clean schematic isometric.
 *
 * Resolution order per node:
 *   1. explicit `node.geometry {x,y,z}`  (authoritative)
 *   2. walk `pipe.direction` + length from the source
 *   3. `ROLE_DIR[pipe.role]` fallback
 *
 * 3D axes: E=+x  N=+y  U=+z  (W/S/D negative). Mirrors test_data/to-isometric.mjs.
 */
import type { Network, Pipe, Direction, Vec3 } from "@rads/model";

/** Default routing direction per pipe role when a pipe has no explicit `direction`. */
export const ROLE_DIR: Record<string, Direction> = {
  "branch-line": "E",
  "cross-main": "N",
  "feed-main": "E",
  riser: "U",
  "supply-main": "E",
  "standpipe-riser": "U",
  "express-riser": "U",
};

/** Unit vector per direction code. */
export const DIR_VEC: Record<Direction, readonly [number, number, number]> = {
  E: [1, 0, 0],
  W: [-1, 0, 0],
  N: [0, 1, 0],
  S: [0, -1, 0],
  U: [0, 0, 1],
  D: [0, 0, -1],
};

export interface LayoutOptions {
  /** Horizontal gap between standpipe riser bundles (model units). Default: median pipe length. */
  standpipeGap?: number;
  /** Run the coincident-node de-overlap pass. Default: true. */
  deoverlap?: boolean;
}

export interface BBox {
  min: Vec3;
  max: Vec3;
  size: Vec3;
  center: Vec3;
}

export interface LayoutResult {
  positions: Map<string, Vec3>;
  bbox: BBox;
}

export function directionOf(pipe: Pipe): Direction {
  return pipe.direction ?? ROLE_DIR[pipe.role ?? ""] ?? "E";
}

function magnitudeOf(pipe: Pipe, dir: Direction): number {
  if (dir === "U" || dir === "D") return Math.abs(pipe.elevationChangeFt || pipe.lengthFt || 0);
  return pipe.lengthFt || 0;
}

function standpipeIndexFromId(id: string): number {
  const m = /(?:SP|STP|HS|R)[-_]?(\d+)/i.exec(id);
  return m && m[1] ? Number(m[1]) : 0;
}

function median(values: number[]): number {
  const v = values.filter((n) => n > 0).sort((a, b) => a - b);
  if (v.length === 0) return 1;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : (v[mid - 1]! + v[mid]!) / 2;
}

/** Collect every node id referenced by `network` (node list ∪ pipe endpoints). */
function allNodeIds(network: Network): string[] {
  const ids = new Set<string>();
  for (const n of network.nodes) ids.add(n.id);
  for (const p of network.pipes) {
    ids.add(p.from);
    ids.add(p.to);
  }
  return [...ids];
}

/**
 * Compute a position for every node. Always returns a position for each id in
 * {@link allNodeIds}.
 */
export function autoLayout(network: Network, opts: LayoutOptions = {}): LayoutResult {
  const ids = allNodeIds(network);
  const positions = new Map<string, Vec3>();

  // explicit geometry seeds (authoritative, never overwritten by the walk)
  const explicit = new Set<string>();
  for (const n of network.nodes) {
    if (n.geometry) {
      positions.set(n.id, { x: n.geometry.x, y: n.geometry.y, z: n.geometry.z });
      explicit.add(n.id);
    }
  }

  // adjacency
  const byFrom = new Map<string, Pipe[]>();
  const incoming = new Set<string>();
  for (const p of network.pipes) {
    (byFrom.get(p.from) ?? byFrom.set(p.from, []).get(p.from)!).push(p);
    incoming.add(p.to);
  }

  // roots: ids that are never a pipe's `to`. Fall back to first id when fully cyclic.
  let roots = ids.filter((id) => !incoming.has(id));
  if (roots.length === 0 && ids.length > 0) roots = [ids[0]!];

  // BFS walk from each root
  const seen = new Set<string>();
  const queue: string[] = [];
  for (const r of roots) {
    if (!positions.has(r)) positions.set(r, { x: 0, y: 0, z: 0 });
    seen.add(r);
    queue.push(r);
  }
  while (queue.length) {
    const id = queue.shift()!;
    const base = positions.get(id)!;
    for (const pipe of byFrom.get(id) ?? []) {
      const dir = directionOf(pipe);
      const mag = magnitudeOf(pipe, dir);
      const v = DIR_VEC[dir] ?? DIR_VEC.E;
      if (!explicit.has(pipe.to) && !positions.has(pipe.to)) {
        positions.set(pipe.to, { x: base.x + v[0] * mag, y: base.y + v[1] * mag, z: base.z + v[2] * mag });
      }
      if (!seen.has(pipe.to)) {
        seen.add(pipe.to);
        queue.push(pipe.to);
      }
    }
  }
  // any unreached id (disconnected) → origin
  for (const id of ids) if (!positions.has(id)) positions.set(id, { x: 0, y: 0, z: 0 });

  const medianLen = median(network.pipes.map((p) => p.lengthFt || 0));

  // spread standpipe riser bundles horizontally so they don't stack on one line
  const gap = opts.standpipeGap ?? Math.max(medianLen, 1);
  for (const n of network.nodes) {
    if (explicit.has(n.id)) continue;
    const s = n.standpipe ?? standpipeIndexFromId(n.id);
    if (s > 1) {
      const pos = positions.get(n.id);
      if (pos) pos.x += (s - 1) * gap;
    }
  }

  if (opts.deoverlap !== false) deOverlap(positions, byFrom, explicit, Math.max(medianLen * 0.35, 0.5));

  return { positions, bbox: bboxOf(positions) };
}

/**
 * Separate nodes that land on identical coordinates by shifting the later
 * node's whole downstream subtree along a small ring in the X-Y plane. Explicit
 * geometry is never moved. Iterates until clear or a pass cap.
 */
function deOverlap(positions: Map<string, Vec3>, byFrom: Map<string, Pipe[]>, locked: Set<string>, step: number): void {
  const key = (p: Vec3) => `${Math.round(p.x * 100)}|${Math.round(p.y * 100)}|${Math.round(p.z * 100)}`;
  for (let pass = 0; pass < 8; pass++) {
    const buckets = new Map<string, string[]>();
    for (const [id, p] of positions) (buckets.get(key(p)) ?? buckets.set(key(p), []).get(key(p))!).push(id);
    let moved = false;
    let ring = 1;
    for (const group of buckets.values()) {
      if (group.length < 2) continue;
      // keep the first; nudge the rest (and their subtrees)
      for (let i = 1; i < group.length; i++) {
        const id = group[i]!;
        if (locked.has(id)) continue;
        const angle = (ring * 2.399963); // golden-angle spread
        const dx = Math.cos(angle) * step * (1 + Math.floor(ring / 8));
        const dy = Math.sin(angle) * step * (1 + Math.floor(ring / 8));
        shiftSubtree(id, positions, byFrom, locked, dx, dy);
        ring++;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

function shiftSubtree(rootId: string, positions: Map<string, Vec3>, byFrom: Map<string, Pipe[]>, locked: Set<string>, dx: number, dy: number): void {
  const stack = [rootId];
  const visited = new Set<string>();
  while (stack.length) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    if (!locked.has(id)) {
      const p = positions.get(id);
      if (p) {
        p.x += dx;
        p.y += dy;
      }
    }
    for (const pipe of byFrom.get(id) ?? []) if (!visited.has(pipe.to)) stack.push(pipe.to);
  }
}

export function bboxOf(positions: Map<string, Vec3>): BBox {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  if (!Number.isFinite(minX)) { minX = minY = minZ = 0; maxX = maxY = maxZ = 0; }
  const min: Vec3 = { x: minX, y: minY, z: minZ };
  const max: Vec3 = { x: maxX, y: maxY, z: maxZ };
  return {
    min,
    max,
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 },
  };
}
