/**
 * Instanced 3D geometry for the scene: pipes (cylinders sized by bore, colored
 * by the active metric), nodes (spheres; sprinklers red), and device markers.
 * Uses native <instancedMesh> with per-instance matrix + color (no re-mesh on
 * recolor) per the perf plan.
 */
import { useLayoutEffect, useMemo, useRef } from "react";
import {
  InstancedMesh,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  Quaternion,
  Color,
} from "three";
import type { AnnotatedScene } from "@rads/scene";
import { symbolIdFor } from "@rads/nfpa170";
import { toThree, pipeRadius, type SceneTransform } from "./transform";
import { symbolTexture } from "./symbolTexture";

const UP = new Vector3(0, 1, 0);

export function Pipes({ scene, t, colors }: { scene: AnnotatedScene; t: SceneTransform; colors: Map<string, string> }): JSX.Element {
  const ref = useRef<InstancedMesh>(null);
  const geo = useMemo(() => new CylinderGeometry(1, 1, 1, 10), []);
  const mat = useMemo(() => new MeshStandardMaterial({ metalness: 0.15, roughness: 0.65 }), []);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const o = new Object3D();
    const q = new Quaternion();
    const a = new Vector3();
    const b = new Vector3();
    const dir = new Vector3();
    const col = new Color();
    scene.pipes.forEach((p, i) => {
      const [ax, ay, az] = toThree(p.a, t);
      const [bx, by, bz] = toThree(p.b, t);
      a.set(ax, ay, az);
      b.set(bx, by, bz);
      dir.subVectors(b, a);
      const len = dir.length() || 1e-3;
      dir.normalize();
      q.setFromUnitVectors(UP, dir);
      o.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
      o.quaternion.copy(q);
      const r = pipeRadius(p.sizeMm);
      o.scale.set(r, len, r);
      o.updateMatrix();
      mesh.setMatrixAt(i, o.matrix);
      mesh.setColorAt(i, col.set(colors.get(p.id) ?? "#90a4ae"));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [scene, t, colors, geo, mat]);

  return <instancedMesh ref={ref} args={[geo, mat, Math.max(1, scene.pipes.length)]} />;
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
      const r = head ? 0.32 : 0.22;
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
