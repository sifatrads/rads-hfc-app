/**
 * Scene geometry: pipes as single-stroke colored LINES (per the user's
 * "line type is ok — no 3D pipe/fitting solids"), nodes as small instanced
 * spheres (sprinklers red), and valve/device markers as NFPA-170 billboards.
 * Pipes use one <lineSegments> with a per-vertex color buffer so recolor by
 * metric never rebuilds geometry.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  InstancedMesh,
  SphereGeometry,
  MeshStandardMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  LineBasicMaterial,
  Object3D,
  Color,
} from "three";
import type { AnnotatedScene } from "@rads/scene";
import { symbolIdFor } from "@rads/nfpa170";
import { toThree, type SceneTransform } from "./transform";
import { symbolTexture } from "./symbolTexture";

export function Pipes({ scene, t, colors }: { scene: AnnotatedScene; t: SceneTransform; colors: Map<string, string> }): JSX.Element {
  // One geometry sized to the pipe count; positions + per-vertex colors filled
  // in the effect. New geometry only when the pipe count changes.
  const geo = useMemo(() => {
    const g = new BufferGeometry();
    const n = Math.max(1, scene.pipes.length);
    g.setAttribute("position", new Float32BufferAttribute(new Float32Array(n * 6), 3));
    g.setAttribute("color", new Float32BufferAttribute(new Float32Array(n * 6), 3));
    return g;
  }, [scene]);
  const mat = useMemo(() => new LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.95 }), []);

  useLayoutEffect(() => {
    const pos = geo.getAttribute("position") as Float32BufferAttribute;
    const colAttr = geo.getAttribute("color") as Float32BufferAttribute;
    const col = new Color();
    scene.pipes.forEach((p, i) => {
      const [ax, ay, az] = toThree(p.a, t);
      const [bx, by, bz] = toThree(p.b, t);
      pos.setXYZ(i * 2, ax, ay, az);
      pos.setXYZ(i * 2 + 1, bx, by, bz);
      col.set(colors.get(p.id) ?? "#90a4ae");
      colAttr.setXYZ(i * 2, col.r, col.g, col.b);
      colAttr.setXYZ(i * 2 + 1, col.r, col.g, col.b);
    });
    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeBoundingSphere();
  }, [scene, t, colors, geo]);

  return <lineSegments args={[geo, mat]} />;
}

export function Nodes({ scene, t }: { scene: AnnotatedScene; t: SceneTransform }): JSX.Element {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new SphereGeometry(1, 12, 12), []);
  const mat = useMemo(() => new MeshStandardMaterial({ metalness: 0.1, roughness: 0.7 }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const col = new Color();
    scene.nodes.forEach((n, i) => {
      const [x, y, z] = toThree(n.pos, t);
      const head = n.kind === "sprinkler" || n.kind === "hose-station";
      o.position.set(x, y, z);
      const r = head ? 0.16 : 0.1;
      o.scale.set(r, r, r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, col.set(head ? "#e53935" : "#37474f"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [scene, t, geo, mat]);

  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, scene.nodes.length)]} />;
}

/** Valves/devices as NFPA-170 billboard sprites (camera-facing, always legible). */
export function Devices({ scene, t }: { scene: AnnotatedScene; t: SceneTransform }): JSX.Element | null {
  if (scene.devices.length === 0) return null;
  return (
    <>
      {scene.devices.map((d) => {
        const tex = symbolTexture(symbolIdFor(d.symbol || d.rawType), "#b45309", 128);
        if (!tex) return null;
        const [x, y, z] = toThree(d.pos, t);
        return (
          <sprite key={d.id} position={[x, y, z]} scale={[1.3, 1.3, 1.3]}>
            <spriteMaterial map={tex} transparent depthTest={false} depthWrite={false} />
          </sprite>
        );
      })}
    </>
  );
}
