/**
 * <Viewer scene={AnnotatedScene} /> — the interactive 360° WebGL viewer.
 * Instanced pipes/nodes/devices, orbit + preset cameras, color-by-metric with a
 * live legend, and toggleable annotation layers driven by the shared label
 * engine. Reuses @rads/scene (colorize) + @rads/labeling. No project/calc logic
 * lives here — it only renders an AnnotatedScene.
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { colorize, type AnnotatedScene, type ColorMetric, type LabelCategory } from "@rads/scene";
import { computeTransform, VIEW_POSITIONS } from "./transform";
import { Pipes, Nodes, Devices } from "./SceneObjects";
import { LabelOverlay } from "./LabelOverlay";

const METRICS: ColorMetric[] = ["size", "role", "material", "velocity", "flow", "pressure", "pressureDrop"];
const VIEWS = ["iso", "plan", "front", "side"] as const;
const TOGGLEABLE: LabelCategory[] = ["nodeNo", "pipeNo", "pipeSize", "valve", "elevation", "kFactor", "flow", "velocity", "pressureTotal", "source", "pump"];

function CameraRig({ view }: { view: string }): null {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  useEffect(() => {
    const p = VIEW_POSITIONS[view] ?? VIEW_POSITIONS.iso!;
    camera.position.set(p[0], p[1], p[2]);
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.target.set(0, 0, 0);
      controls.update();
    }
  }, [view, camera, controls]);
  return null;
}

export interface ViewerProps {
  scene: AnnotatedScene;
  initialMetric?: ColorMetric;
}

export function Viewer({ scene, initialMetric = "size" }: ViewerProps): JSX.Element {
  const t = useMemo(() => computeTransform(scene), [scene]);
  const [metric, setMetric] = useState<ColorMetric>(initialMetric);
  const [view, setView] = useState<string>("iso");
  const [enabled, setEnabled] = useState<Set<LabelCategory>>(new Set<LabelCategory>(["nodeNo", "pipeSize", "valve"]));
  const { pipeColors, legend } = useMemo(() => colorize(scene, metric), [scene, metric]);

  const toggle = (c: LabelCategory) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", background: "#eef2f5" }}>
      <Canvas camera={{ position: VIEW_POSITIONS.iso, fov: 45, near: 0.1, far: 6000 }} dpr={[1, 2]}>
        <color attach="background" args={["#eef2f5"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[30, 50, 20]} intensity={0.7} />
        <directionalLight position={[-20, 10, -30]} intensity={0.25} />
        <gridHelper args={[120, 24, "#cfd8dc", "#e3e9ed"]} position={[0, -0.01, 0]} />
        <Pipes scene={scene} t={t} colors={pipeColors} />
        <Nodes scene={scene} t={t} />
        <Devices scene={scene} t={t} />
        <LabelOverlay scene={scene} t={t} enabled={enabled} />
        <CameraRig view={view} />
        <OrbitControls makeDefault enablePan enableZoom enableRotate />
      </Canvas>

      {/* toolbar */}
      <div style={panel}>
        <div style={{ fontWeight: 700, color: "#0b3d91", marginBottom: 6 }}>{scene.name}</div>
        <div style={row}>
          <label style={lbl}>Color by</label>
          <select value={metric} onChange={(e) => setMetric(e.target.value as ColorMetric)} style={sel}>
            {METRICS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div style={{ ...row, flexWrap: "wrap", gap: 4 }}>
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...btn, ...(view === v ? btnActive : {}) }}>{v}</button>
          ))}
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: "#546e7a" }}>Labels</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "2px 8px", maxWidth: 220 }}>
          {TOGGLEABLE.map((c) => (
            <label key={c} style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 3 }}>
              <input type="checkbox" checked={enabled.has(c)} onChange={() => toggle(c)} /> {c}
            </label>
          ))}
        </div>
      </div>

      {/* legend */}
      <div style={legendPanel}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {legend.title}
          {legend.units ? ` (${legend.units})` : ""}
          {legend.needsCalc ? " — run calc" : ""}
        </div>
        {legend.entries.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
            <span style={{ width: 16, height: 10, background: e.swatch, display: "inline-block", border: "1px solid #b0bec5" }} />
            <span style={{ fontSize: 11 }}>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const panel: CSSProperties = { position: "absolute", top: 10, left: 10, background: "rgba(255,255,255,0.92)", border: "1px solid #cfd8dc", borderRadius: 6, padding: 10, fontFamily: "Helvetica, Arial, sans-serif", boxShadow: "0 1px 4px rgba(0,0,0,0.1)" };
const legendPanel: CSSProperties = { position: "absolute", bottom: 10, left: 10, background: "rgba(255,255,255,0.92)", border: "1px solid #cfd8dc", borderRadius: 6, padding: "8px 10px", fontFamily: "Helvetica, Arial, sans-serif", fontSize: 12 };
const row: CSSProperties = { display: "flex", alignItems: "center", gap: 6, margin: "3px 0" };
const lbl: CSSProperties = { fontSize: 11, color: "#546e7a", width: 52 };
const sel: CSSProperties = { fontSize: 12, padding: "2px 4px" };
const btn: CSSProperties = { fontSize: 11, padding: "2px 8px", border: "1px solid #b0bec5", background: "#fff", borderRadius: 4, cursor: "pointer", textTransform: "capitalize" };
const btnActive: CSSProperties = { background: "#0b3d91", color: "#fff", borderColor: "#0b3d91" };
