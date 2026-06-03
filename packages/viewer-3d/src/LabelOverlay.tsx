/**
 * Screen-space label overlay: every few frames it projects each enabled label's
 * 3D anchor to the canvas, runs the shared @rads/labeling engine (so labels
 * never overlap and get leader lines), and renders crisp HTML labels + an SVG
 * leader layer via drei's fullscreen <Html>. This is the interactive twin of
 * the print drawing-sheet label pass.
 */
import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { Vector3 } from "three";
import { placeLabels, type LabelRequest, type PlacedLabel } from "@rads/labeling";
import type { AnnotatedScene, LabelCategory } from "@rads/scene";
import { toThree, type SceneTransform } from "./transform";

const FONT = 11;

export function LabelOverlay({
  scene,
  t,
  enabled,
  everyNFrames = 4,
}: {
  scene: AnnotatedScene;
  t: SceneTransform;
  enabled: Set<LabelCategory>;
  everyNFrames?: number;
}): JSX.Element {
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const [placed, setPlaced] = useState<PlacedLabel[]>([]);
  const [lod, setLod] = useState({ shown: 0, total: 0 });
  const v = useRef(new Vector3());
  const frame = useRef(0);

  useFrame(() => {
    frame.current += 1;
    if (frame.current % everyNFrames !== 0) return;

    // Zoom signal: screen pixels per 1 model-unit (project a 2-unit segment at
    // the origin). Drives level-of-detail so dense grids declutter when zoomed
    // out and reveal everything when zoomed in.
    v.current.set(0, 0, 0).project(camera);
    const ox = (v.current.x * 0.5 + 0.5) * size.width, oy = (-v.current.y * 0.5 + 0.5) * size.height;
    v.current.set(2, 0, 0).project(camera);
    const ex = (v.current.x * 0.5 + 0.5) * size.width, ey = (-v.current.y * 0.5 + 0.5) * size.height;
    const pxPerUnit = Math.hypot(ex - ox, ey - oy) / 2 || 1;
    const zoom = Math.max(0.5, Math.min(4, pxPerUnit / (size.width / 42)));
    const thinPerCell = Math.round(Math.max(2, Math.min(12, 2 + zoom * 2.5)));
    const maxLabels = Math.round(Math.max(90, Math.min(650, 150 * zoom)));

    const reqs: LabelRequest[] = [];
    for (const l of scene.labels) {
      if (!enabled.has(l.category)) continue;
      const [x, y, z] = toThree(l.anchor, t);
      v.current.set(x, y, z).project(camera);
      if (v.current.z > 1) continue; // behind camera
      const sx = (v.current.x * 0.5 + 0.5) * size.width;
      const sy = (-v.current.y * 0.5 + 0.5) * size.height;
      if (sx < -50 || sy < -50 || sx > size.width + 50 || sy > size.height + 50) continue;
      reqs.push({ id: l.id, x: sx, y: sy, text: l.text, category: l.category, priority: l.priority, width: l.text.length * FONT * 0.56 + 4, height: FONT * 1.25 });
    }
    const out = placeLabels(reqs, { width: size.width, height: size.height, margin: 4 }, { leaderLength: 10, gap: 1.5, thinCellSize: 82, thinPerCell, maxLabels });
    setPlaced(out.placed);
    setLod({ shown: out.placed.length, total: reqs.length });
  });

  return (
    <Html fullscreen prepend style={{ pointerEvents: "none" }}>
      {lod.shown < lod.total && (
        <div style={{ position: "absolute", top: 10, right: 12, font: "11px Helvetica, Arial, sans-serif", color: "#475569", background: "rgba(255,255,255,0.85)", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 8px" }}>
          {lod.shown} / {lod.total} labels · zoom in for more
        </div>
      )}
      <svg width={size.width} height={size.height} style={{ position: "absolute", inset: 0, overflow: "visible" }}>
        {placed.map((p) =>
          p.leader ? <line key={p.id + "L"} x1={p.leader.x1} y1={p.leader.y1} x2={p.leader.x2} y2={p.leader.y2} stroke="#5b6b7b" strokeWidth={0.7} /> : null,
        )}
      </svg>
      {placed.map((p) => (
        <div
          key={p.id}
          style={{
            position: "absolute",
            left: Math.round(p.x),
            top: Math.round(p.y),
            font: `${FONT}px Helvetica, Arial, sans-serif`,
            color: "#10243e",
            background: "rgba(255,255,255,0.72)",
            padding: "0 2px",
            borderRadius: 2,
            whiteSpace: "nowrap",
            lineHeight: 1.25,
          }}
        >
          {p.text}
        </div>
      ))}
    </Html>
  );
}
