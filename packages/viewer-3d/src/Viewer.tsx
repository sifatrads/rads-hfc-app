/**
 * <Viewer scene={AnnotatedScene} /> — the interactive 360° WebGL viewer.
 * Instanced pipes/nodes/devices, orbit + preset cameras, color-by-metric with a
 * live legend, and toggleable annotation layers driven by the shared label
 * engine. Reuses @rads/scene (colorize) + @rads/labeling. No project/calc logic
 * lives here — it only renders an AnnotatedScene.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MOUSE, DoubleSide } from "three";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Line } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import type { ThreeEvent } from "@react-three/fiber";
import { colorize, type AnnotatedScene, type ColorMetric, type LabelCategory } from "@rads/scene";
import { computeTransform, toThree, fromThree, VIEW_POSITIONS, type SceneTransform } from "./transform";
import { Pipes, Nodes, Devices } from "./SceneObjects";
import { LabelOverlay } from "./LabelOverlay";

const METRICS: ColorMetric[] = ["size", "role", "material", "velocity", "flow", "pressure", "pressureDrop"];
const VIEWS = ["iso", "plan", "front", "side"] as const;
const TOGGLEABLE: LabelCategory[] = ["nodeNo", "pipeNo", "pipeSize", "valve", "elevation", "kFactor", "flow", "velocity", "pressureTotal", "source", "pump"];

/** Move tool: an invisible horizontal "plan" plane at the node's elevation that
 * follows the cursor; a green handle + guide line show the destination; clicking
 * places the node there (commit on click). Elevation is preserved. */
function MoveTool({ nodeId, scene, t, onPlace }: { nodeId: string; scene: AnnotatedScene; t: SceneTransform; onPlace: (p: [number, number, number]) => void }): JSX.Element | null {
  const node = scene.nodes.find((n) => n.id === nodeId);
  const origin = useMemo<[number, number, number]>(() => (node ? toThree(node.pos, t) : [0, 0, 0]), [node, t]);
  const [pos, setPos] = useState<[number, number, number]>(origin);
  useEffect(() => setPos(origin), [origin]);
  if (!node) return null;
  const y = origin[1];
  return (
    <>
      <mesh
        position={[0, y, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); setPos([e.point.x, y, e.point.z]); }}
        onClick={(e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); onPlace([e.point.x, y, e.point.z]); }}
      >
        <planeGeometry args={[8000, 8000]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
      </mesh>
      <Line points={[origin, pos]} color="#16a34a" lineWidth={1.5} />
      <mesh position={pos}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial color="#16a34a" transparent opacity={0.85} depthTest={false} />
      </mesh>
    </>
  );
}

/** Widen the line/point pick tolerance so thin pipe lines are easy to click. */
function RaycastTuning(): null {
  const raycaster = useThree((s) => s.raycaster);
  useEffect(() => {
    raycaster.params.Line = { threshold: 0.6 };
    raycaster.params.Points = { threshold: 1 };
  }, [raycaster]);
  return null;
}

/** Snaps the camera to a preset view + recenters the orbit target. Re-runs when
 * `view` changes or `fitNonce` increments (the Fit button). */
function CameraRig({ view, fitNonce }: { view: string; fitNonce: number }): null {
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
  }, [view, fitNonce, camera, controls]);
  return null;
}

export interface ViewerProps {
  scene: AnnotatedScene;
  initialMetric?: ColorMetric;
  /** When provided, an Edit toggle appears: click a pipe to split it here. */
  onSplitPipe?: (pipeId: string, fraction: number) => void;
  /** When provided, an Edit toggle appears: click a node to delete it. */
  onDeleteNode?: (nodeId: string) => void;
  /** When provided, clicking a node offers "Add branch" in a direction. */
  onAddBranch?: (fromNodeId: string, opts: { direction: string; lengthFt: number; nominalSize: string; nodeType: string }) => void;
  /** When provided, "Connect to…" lets you click two nodes to add a pipe between them. */
  onAddPipe?: (fromNodeId: string, toNodeId: string, lengthFt: number, opts: { nominalSize: string; role: string }) => void;
  /** When provided, "Move" lets you drag a node to a new position (plan plane). */
  onMoveNode?: (nodeId: string, geometry: { x: number; y: number; z: number }) => void;
}

const DIRS: { d: string; label: string }[] = [
  { d: "N", label: "N" }, { d: "S", label: "S" }, { d: "E", label: "E" }, { d: "W", label: "W" }, { d: "U", label: "↑U" }, { d: "D", label: "↓D" },
];
const BRANCH_SIZES = ["1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "4", "6", "8"];

type EditSel =
  | { kind: "pipe"; id: string; fraction: number; x: number; y: number }
  | { kind: "node"; id: string; x: number; y: number };

export function Viewer({ scene, initialMetric = "size", onSplitPipe, onDeleteNode, onAddBranch, onAddPipe, onMoveNode }: ViewerProps): JSX.Element {
  const t = useMemo(() => computeTransform(scene), [scene]);
  const [metric, setMetric] = useState<ColorMetric>(initialMetric);
  const [view, setView] = useState<string>("iso");
  const [fitNonce, setFitNonce] = useState(0);
  const [enabled, setEnabled] = useState<Set<LabelCategory>>(new Set<LabelCategory>(["nodeNo", "pipeSize", "valve"]));
  const [edit, setEdit] = useState(false);
  const [picked, setPicked] = useState<EditSel | null>(null);
  const [brLen, setBrLen] = useState(10);
  const [brSize, setBrSize] = useState("1");
  const [brType, setBrType] = useState("sprinkler");
  const [connectFrom, setConnectFrom] = useState<string | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canEdit = !!(onSplitPipe || onDeleteNode || onAddBranch || onAddPipe || onMoveNode);
  const busyMode = !!connectFrom || !!moving;
  const nodePos = useMemo(() => new Map(scene.nodes.map((n) => [n.id, n.pos])), [scene]);
  const fit = () => setFitNonce((n) => n + 1);
  const rel = (cx: number, cy: number) => { const r = containerRef.current?.getBoundingClientRect(); return { x: cx - (r?.left ?? 0), y: cy - (r?.top ?? 0) }; };
  const pickPipe = (id: string, fraction: number, cx: number, cy: number) => { const p = rel(cx, cy); setPicked({ kind: "pipe", id, fraction, x: p.x, y: p.y }); };
  const pickNode = (id: string, cx: number, cy: number) => {
    if (connectFrom) {
      if (connectFrom !== id && onAddPipe) {
        const a = nodePos.get(connectFrom), b = nodePos.get(id);
        const len = a && b ? Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) : 10;
        onAddPipe(connectFrom, id, Math.round(len * 10) / 10, { nominalSize: brSize, role: "cross-main" });
      }
      setConnectFrom(null);
      return;
    }
    const p = rel(cx, cy);
    setPicked({ kind: "node", id, x: p.x, y: p.y });
  };

  // Esc cancels an in-progress connect or move.
  useEffect(() => {
    if (!busyMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setConnectFrom(null); setMoving(null); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busyMode]);
  const { pipeColors, legend } = useMemo(() => colorize(scene, metric), [scene, metric]);

  const toggle = (c: LabelCategory) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <div ref={containerRef} style={{ position: "relative", width: "100%", height: "100%", background: "#eef2f5" }}>
      <Canvas
        camera={{ position: VIEW_POSITIONS.iso, fov: 45, near: 0.1, far: 6000 }}
        dpr={[1, 2]}
        onPointerMissed={() => { setPicked(null); setConnectFrom(null); setMoving(null); }}
      >
        <RaycastTuning />
        <color attach="background" args={["#eef2f5"]} />
        <ambientLight intensity={0.85} />
        <directionalLight position={[30, 50, 20]} intensity={0.7} />
        <directionalLight position={[-20, 10, -30]} intensity={0.25} />
        <gridHelper args={[120, 24, "#cfd8dc", "#e3e9ed"]} position={[0, -0.01, 0]} />
        <Pipes scene={scene} t={t} colors={pipeColors} onPick={edit && onSplitPipe && !busyMode ? pickPipe : undefined} />
        <Nodes scene={scene} t={t} onPick={edit && (onDeleteNode || onAddBranch || onAddPipe || onMoveNode) && !busyMode ? pickNode : undefined} />
        <Devices scene={scene} t={t} />
        {moving && onMoveNode && (
          <MoveTool nodeId={moving} scene={scene} t={t} onPlace={(p) => { onMoveNode(moving, fromThree(p, t)); setMoving(null); }} />
        )}
        <LabelOverlay scene={scene} t={t} enabled={enabled} />
        <CameraRig view={view} fitNonce={fitNonce} />
        {/* AutoCAD-style: left = orbit, middle (wheel) drag = pan, scroll = zoom. */}
        <OrbitControls
          makeDefault
          enablePan
          enableZoom
          enableRotate={!moving}
          screenSpacePanning
          panSpeed={0.9}
          zoomToCursor
          mouseButtons={{ LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.PAN }}
        />
      </Canvas>

      {/* toolbar */}
      <div style={panel}>
        <div style={panelTitle}>{scene.name}</div>

        {canEdit && (
          <button onClick={() => { setEdit((e) => !e); setPicked(null); }} style={{ ...editToggle, ...(edit ? editToggleOn : {}) }}>
            {edit ? "✓ Editing — click a pipe to split, a node to delete" : "✏️ Edit model"}
          </button>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={groupLabel}>View</div>
          <button onClick={fit} style={fitBtn} title="Fit model to screen (recenter)">⤢ Fit</button>
        </div>
        <div style={segment}>
          {VIEWS.map((v) => (
            <button key={v} onClick={() => { setView(v); fit(); }} style={{ ...segBtn, ...(view === v ? segBtnActive : {}) }}>{v}</button>
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

        <div style={controlsHint}>Orbit: left-drag · Pan: middle-drag (wheel) · Zoom: scroll</div>
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

      {/* connect-mode banner */}
      {connectFrom && (
        <div style={connectBanner}>
          🔗 Connecting from node <b>{connectFrom}</b> — click a target node &nbsp;
          <button style={connectCancel} onClick={() => setConnectFrom(null)}>Esc / Cancel</button>
        </div>
      )}
      {/* move-mode banner */}
      {moving && (
        <div style={connectBanner}>
          ✥ Moving node <b>{moving}</b> — click a new spot (in plan) &nbsp;
          <button style={connectCancel} onClick={() => setMoving(null)}>Esc / Cancel</button>
        </div>
      )}

      {/* edit action menu (anchored at the click) */}
      {picked && (
        <div style={{ ...menu, left: Math.min(picked.x, (containerRef.current?.clientWidth ?? 9999) - 170), top: picked.y + 8 }}>
          {picked.kind === "pipe" ? (
            <>
              <div style={menuTitle}>Pipe {picked.id}</div>
              <button style={menuBtn} onClick={() => { onSplitPipe?.(picked.id, picked.fraction); setPicked(null); }}>⊟ Split here ({Math.round(picked.fraction * 100)}%)</button>
            </>
          ) : (
            <>
              <div style={menuTitle}>Node {picked.id}</div>
              {onAddBranch && (
                <div style={branchForm}>
                  <div style={{ display: "flex", gap: 5 }}>
                    <input type="number" value={brLen} min={1} onChange={(e) => setBrLen(Number(e.target.value) || 1)} style={miniInput} title="Length (ft)" />
                    <select value={brSize} onChange={(e) => setBrSize(e.target.value)} style={miniInput} title="Size">{BRANCH_SIZES.map((s) => <option key={s} value={s}>{s}"</option>)}</select>
                    <select value={brType} onChange={(e) => setBrType(e.target.value)} style={miniInput} title="New node">
                      <option value="sprinkler">head</option>
                      <option value="junction">node</option>
                    </select>
                  </div>
                  <div style={dirGrid}>
                    {DIRS.map((d) => (
                      <button key={d.d} style={dirBtn} title={`Add branch ${d.d}`} onClick={() => { onAddBranch(picked.id, { direction: d.d, lengthFt: brLen, nominalSize: brSize, nodeType: brType }); setPicked(null); }}>{d.label}</button>
                    ))}
                  </div>
                  <div style={{ fontSize: 9.5, color: "#94a3b8", margin: "2px 0 4px" }}>Add branch → pick a direction</div>
                </div>
              )}
              {onMoveNode && <button style={menuBtn} onClick={() => { setMoving(picked.id); setPicked(null); }}>✥ Move node…</button>}
              {onAddPipe && <button style={menuBtn} onClick={() => { setConnectFrom(picked.id); setPicked(null); }}>🔗 Connect to another node…</button>}
              {onDeleteNode && <button style={{ ...menuBtn, color: "#b91c1c" }} onClick={() => { onDeleteNode(picked.id); setPicked(null); }}>🗑 Delete node + its pipes</button>}
            </>
          )}
          <button style={menuCancel} onClick={() => setPicked(null)}>Cancel</button>
        </div>
      )}
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
const fitBtn: CSSProperties = { fontSize: 10.5, fontWeight: 700, color: "#0b3d91", background: "#eef2f7", border: "1px solid #d7dee6", borderRadius: 6, padding: "2px 8px", cursor: "pointer" };
const controlsHint: CSSProperties = { marginTop: 10, paddingTop: 8, borderTop: "1px solid #eef2f7", fontSize: 10, color: "#94a3b8", lineHeight: 1.5 };
const sel: CSSProperties = { width: "100%", fontSize: 12.5, padding: "5px 7px", border: "1px solid #cfd8e3", borderRadius: 6, background: "#fff", color: "#16243a", fontFamily: FONT, textTransform: "capitalize" };
const chip: CSSProperties = { fontSize: 10.5, padding: "3px 8px", border: "1px solid #d7dee6", background: "#fff", color: "#64748b", borderRadius: 999, cursor: "pointer" };
const chipActive: CSSProperties = { background: "#0b3d91", color: "#fff", borderColor: "#0b3d91", fontWeight: 600 };
const legendPanel: CSSProperties = { position: "absolute", bottom: 12, left: 12, background: "rgba(255,255,255,0.97)", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 13px", fontFamily: FONT, boxShadow: "0 6px 22px rgba(15,30,60,0.16)" };
const legendTitle: CSSProperties = { fontWeight: 700, color: "#0b3d91", fontSize: 12, marginBottom: 5 };
const editToggle: CSSProperties = { width: "100%", margin: "0 0 8px", padding: "6px 10px", fontSize: 12, fontWeight: 700, color: "#0b3d91", background: "#eef3fb", border: "1px solid #cfdcee", borderRadius: 7, cursor: "pointer", textAlign: "left" };
const editToggleOn: CSSProperties = { background: "#16a34a", color: "#fff", borderColor: "#16a34a" };
const menu: CSSProperties = { position: "absolute", zIndex: 30, minWidth: 160, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 9, boxShadow: "0 8px 26px rgba(15,30,60,0.22)", padding: 6, fontFamily: FONT };
const menuTitle: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#64748b", padding: "3px 8px 6px" };
const menuBtn: CSSProperties = { display: "block", width: "100%", textAlign: "left", fontSize: 12.5, fontWeight: 600, color: "#0b3d91", background: "transparent", border: "none", borderRadius: 6, padding: "7px 8px", cursor: "pointer" };
const menuCancel: CSSProperties = { display: "block", width: "100%", textAlign: "left", fontSize: 11.5, color: "#94a3b8", background: "transparent", border: "none", borderRadius: 6, padding: "5px 8px", cursor: "pointer" };
const branchForm: CSSProperties = { padding: "2px 6px 4px", borderBottom: "1px solid #eef2f7", marginBottom: 4 };
const miniInput: CSSProperties = { flex: 1, minWidth: 0, fontSize: 11.5, padding: "3px 4px", border: "1px solid #d7dee6", borderRadius: 5, color: "#16243a", fontFamily: FONT };
const dirGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, marginTop: 5 };
const dirBtn: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#0b3d91", background: "#eef3fb", border: "1px solid #cfdcee", borderRadius: 6, padding: "5px 0", cursor: "pointer" };
const connectBanner: CSSProperties = { position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 30, display: "flex", alignItems: "center", background: "#0b3d91", color: "#fff", fontFamily: FONT, fontSize: 12.5, padding: "7px 14px", borderRadius: 999, boxShadow: "0 6px 22px rgba(15,30,60,0.28)" };
const connectCancel: CSSProperties = { fontSize: 11.5, fontWeight: 600, color: "#0b3d91", background: "#fff", border: "none", borderRadius: 999, padding: "3px 10px", cursor: "pointer" };
