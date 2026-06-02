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
  const v = useRef(new Vector3());
  const frame = useRef(0);

  useFrame(() => {
    frame.current += 1;
    if (frame.current % everyNFrames !== 0) return;
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
    const out = placeLabels(reqs, { width: size.width, height: size.height, margin: 4 }, { leaderLength: 10, gap: 1.5, thinCellSize: 70, thinPerCell: 6, maxLabels: 400 });
    setPlaced(out.placed);
  });

  return (
    <Html fullscreen prepend style={{ pointerEvents: "none" }}>
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
