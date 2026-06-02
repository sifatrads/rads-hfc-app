import { describe, it, expect } from "vitest";
import { toThree, computeTransform, pipeRadius, SCENE_SPAN } from "./transform";
import type { AnnotatedScene } from "@rads/scene";

const fakeScene = (size: number): AnnotatedScene =>
  ({
    bbox: { min: { x: 0, y: 0, z: 0 }, max: { x: size, y: size, z: size }, size: { x: size, y: size, z: size }, center: { x: size / 2, y: size / 2, z: size / 2 } },
  }) as unknown as AnnotatedScene;

describe("viewer-3d transform", () => {
  it("maps model Z-up to three Y-up, centered and scaled", () => {
    const t = computeTransform(fakeScene(100));
    expect(t.scale).toBeCloseTo(SCENE_SPAN / 100, 6);
    // center maps to origin (toBeCloseTo tolerates signed zero)
    const c = toThree({ x: 50, y: 50, z: 50 }, t);
    expect(c[0]).toBeCloseTo(0, 9);
    expect(c[1]).toBeCloseTo(0, 9);
    expect(c[2]).toBeCloseTo(0, 9);
    // +Z (model up) → +Y (three up); +Y (model north) → -Z (three)
    const [x, y, z] = toThree({ x: 50, y: 50, z: 60 }, t);
    expect(y).toBeGreaterThan(0);
    expect(x).toBeCloseTo(0, 9);
    expect(z).toBeCloseTo(0, 9);
    const p2 = toThree({ x: 50, y: 60, z: 50 }, t);
    expect(p2[2]).toBeLessThan(0); // north → -z
  });

  it("scales pipe radius with bore, clamped", () => {
    expect(pipeRadius(25)).toBeLessThan(pipeRadius(200));
    expect(pipeRadius(0)).toBeGreaterThanOrEqual(0.07);
    expect(pipeRadius(100000)).toBeLessThanOrEqual(0.6);
  });
});
