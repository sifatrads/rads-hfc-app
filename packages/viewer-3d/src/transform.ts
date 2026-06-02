/**
 * Pure scene→three transforms. Model uses Z-up (U axis); three.js uses Y-up, so
 * (x, y, z)_model → (x, z, −y)_three. The scene is centered on its bbox and
 * scaled so the largest dimension is ~SCENE_SPAN units (keeps camera/clip sane
 * regardless of building size).
 */
import type { AnnotatedScene } from "@rads/scene";

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface SceneTransform {
  center: Vec3Like;
  scale: number;
}

export const SCENE_SPAN = 30;

export function computeTransform(scene: AnnotatedScene): SceneTransform {
  const b = scene.bbox;
  const span = Math.max(b.size.x, b.size.y, b.size.z, 1e-6);
  return { center: b.center, scale: SCENE_SPAN / span };
}

/** Model point → three.js coordinates [x, y, z]. */
export function toThree(p: Vec3Like, t: SceneTransform): [number, number, number] {
  return [(p.x - t.center.x) * t.scale, (p.z - t.center.z) * t.scale, -(p.y - t.center.y) * t.scale];
}

/** Visible pipe radius (three units) from nominal bore in mm. */
export function pipeRadius(sizeMm: number): number {
  return Math.max(0.07, Math.min(0.6, 0.06 + (sizeMm || 40) * 0.0016));
}

/** Camera positions for the preset views (scene is normalized to ~SCENE_SPAN). */
export const VIEW_POSITIONS: Record<string, [number, number, number]> = {
  iso: [SCENE_SPAN, SCENE_SPAN * 0.8, SCENE_SPAN],
  "iso-ne": [-SCENE_SPAN, SCENE_SPAN * 0.8, SCENE_SPAN],
  plan: [0, SCENE_SPAN * 1.6, 0.001],
  front: [0, SCENE_SPAN * 0.2, SCENE_SPAN * 1.6],
  side: [SCENE_SPAN * 1.6, SCENE_SPAN * 0.2, 0],
};
