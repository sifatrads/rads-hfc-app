/**
 * Orthographic 2D projections of the 3D model, shared by the print renderer and
 * any 2D fallback. Output is in model units with screen convention (y points
 * DOWN), so a fit-to-viewport transform is applied downstream.
 *
 *   iso:   sx = (x − y)·cos30   sy = (x + y)·sin30 − z   (SW isometric)
 *   plan:  top view  (x, −y)                              (N points up)
 *   front: looking N (x, −z)                              (elevation)
 *   side:  looking E (y, −z)                              (elevation)
 */
import type { Vec3 } from "@rads/model";

export type ViewKind = "iso" | "iso-se" | "iso-nw" | "iso-ne" | "plan" | "front" | "side";

export interface Point2 {
  x: number;
  y: number;
}

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

/** South-west isometric (the classic fire-sprinkler iso plate orientation). */
export function isoProject(p: Vec3): Point2 {
  return { x: (p.x - p.y) * COS30, y: (p.x + p.y) * SIN30 - p.z };
}

/** Isometric from any of the four horizontal corners (rotate the X-Y plane 90°·k). */
export function isoProjectCorner(p: Vec3, corner: 0 | 1 | 2 | 3): Point2 {
  // rotate (x,y) by 90°·corner before the standard iso transform
  let x = p.x, y = p.y;
  for (let i = 0; i < corner; i++) {
    const nx = y, ny = -x;
    x = nx; y = ny;
  }
  return { x: (x - y) * COS30, y: (x + y) * SIN30 - p.z };
}

export function planProject(p: Vec3): Point2 {
  return { x: p.x, y: -p.y };
}

export function frontProject(p: Vec3): Point2 {
  return { x: p.x, y: -p.z };
}

export function sideProject(p: Vec3): Point2 {
  return { x: p.y, y: -p.z };
}

export function project(p: Vec3, view: ViewKind): Point2 {
  switch (view) {
    case "iso":
      return isoProjectCorner(p, 0);
    case "iso-se":
      return isoProjectCorner(p, 1);
    case "iso-nw":
      return isoProjectCorner(p, 2);
    case "iso-ne":
      return isoProjectCorner(p, 3);
    case "plan":
      return planProject(p);
    case "front":
      return frontProject(p);
    case "side":
      return sideProject(p);
  }
}

export interface Bounds2 {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export function bounds2(points: Iterable<Point2>): Bounds2 {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  if (!Number.isFinite(minX)) { minX = minY = maxX = maxY = 0; }
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}
