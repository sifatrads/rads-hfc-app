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
        <div style={panelTitle}>{scene.name}</div>

        <div style={groupLabel}>View</div>
        <div style={segment}>
          {VIEWS.map((v) => (
            <button key={v} onClick={() => setView(v)} style={{ ...segBtn, ...(view === v ? segBtnActive : {}) }}>{v}</button>
          ))}
        </div>

        <div style={groupLabel}>Color by</div>
        <select value={metric} onChange={(e) => setMetric(e.target.value as ColorMetric)} style={sel}>
          {METRICS.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>

        <div style={groupLabel}>Labels</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 6px" }}>
          {TOGGLEABLE.map((c) => (
            <button key={c} onClick={() => toggle(c)} style={{ ...chip, ...(enabled.has(c) ? chipActive : {}) }}>{c}</button>
          ))}
        </div>
      </div>

      {/* legend */}
      <div style={legendPanel}>
        <div style={legendTitle}>
          {legend.title}
          {legend.units ? <span style={{ color: "#94a3b8", fontWeight: 400 }}> · {legend.units}</span> : null}
          {legend.needsCalc ? <span style={{ color: "#c2410c", fontWeight: 400 }}> — run calc</span> : null}
        </div>
        {legend.entries.map((e, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 3 }}>
            <span style={{ width: 18, height: 11, background: e.swatch, display: "inline-block", borderRadius: 2, boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.12)" }} />
            <span style={{ fontSize: 11.5, color: "#16243a" }}>{e.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FONT = "'Segoe UI', system-ui, Helvetica, Arial, sans-serif";
const panel: CSSProperties = { position: "absolute", top: 12, left: 12, width: 232, background: "rgba(255,255,255,0.97)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "12px 14px", fontFamily: FONT, boxShadow: "0 6px 22px rgba(15,30,60,0.16)", backdropFilter: "blur(2px)" };
const panelTitle: CSSProperties = { fontWeight: 700, color: "#0b3d91", fontSize: 13.5, marginBottom: 10, lineHeight: 1.25, borderBottom: "1px solid #eef2f7", paddingBottom: 8 };
const groupLabel: CSSProperties = { fontSize: 10, fontWeight: 700, letterSpacing: 0.6, color: "#94a3b8", textTransform: "uppercase", margin: "10px 0 5px" };
const segment: CSSProperties = { display: "flex", background: "#eef2f7", borderRadius: 7, padding: 2, gap: 2 };
const segBtn: CSSProperties = { flex: 1, fontSize: 11.5, padding: "4px 0", border: "none", background: "transparent", borderRadius: 5, cursor: "pointer", textTransform: "capitalize", color: "#475569", fontWeight: 600 };
const segBtnActive: CSSProperties = { background: "#fff", color: "#0b3d91", boxShadow: "0 1px 3px rgba(0,0,0,0.14)" };
const sel: CSSProperties = { width: "100%", fontSize: 12.5, padding: "5px 7px", border: "1px solid #cfd8e3", borderRadius: 6, background: "#fff", color: "#16243a", fontFamily: FONT, textTransform: "capitalize" };
const chip: CSSProperties = { fontSize: 10.5, padding: "3px 8px", border: "1px solid #d7dee6", background: "#fff", color: "#64748b", borderRadius: 999, cursor: "pointer" };
const chipActive: CSSProperties = { background: "#0b3d91", color: "#fff", borderColor: "#0b3d91", fontWeight: 600 };
const legendPanel: CSSProperties = { position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.97)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 13px", fontFamily: FONT, boxShadow: "0 6px 22px rgba(15,30,60,0.16)" };
const legendTitle: CSSProperties = { fontWeight: 700, color: "#0b3d91", fontSize: 12, marginBottom: 5 };
