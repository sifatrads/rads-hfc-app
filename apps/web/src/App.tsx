/**
 * RADS-HFC-APP shell — a left-menu, multi-tab application:
 *   Project (data entry) · 3D View · Summary · Analysis · Graph · Report.
 * The model is owned here; the solve + scene derive from it, so editing on the
 * Project tab keeps every other tab live. Open .dxf/.rhfc/.json or build from
 * scratch with "New".
 */
import { lazy, Suspense, useEffect, useMemo, useState, type CSSProperties } from "react";
import { buildScene, type AnnotatedScene } from "@rads/scene";
import { parseProject, type ProjectModel, type Direction } from "@rads/model";
import type { DxfDoc, DxfAnalysis } from "@rads/dxf-import";
import { solveProject, type ProjectSolution } from "@rads/solve";
import { decodeJSON, encodeJSON, isRhfc } from "@rads/container";
import { sampleProject } from "./sample";
import { newProject, splitPipeInModel, deleteNodeInModel, addBranchInModel, addPipeBetweenInModel, setNodeGeometryInModel, mergeModels } from "./network-edit";
import { useModelHistory } from "./useModelHistory";
import { checkModel, issueCounts } from "./network-validate";
import { ProjectTab } from "./tabs/ProjectTab";
import { SummaryTab } from "./tabs/SummaryTab";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { SizingTab } from "./tabs/SizingTab";
import { GraphTab } from "./tabs/GraphTab";
import { C, FONT } from "./ui";

// Heavy/optional pieces are code-split: three.js (viewer), firebase (cloud),
// the report renderer, and the DXF dialog load only when first needed — so the
// initial bundle (shell + data entry) is small and paints fast.
const Viewer = lazy(() => import("@rads/viewer-3d").then((m) => ({ default: m.Viewer })));
const CloudBar = lazy(() => import("./CloudBar").then((m) => ({ default: m.CloudBar })));
const ReportTab = lazy(() => import("./tabs/ReportTab").then((m) => ({ default: m.ReportTab })));
const ImportDialog = lazy(() => import("./ImportDialog").then((m) => ({ default: m.ImportDialog })));

type TabId = "project" | "view" | "summary" | "analysis" | "sizing" | "graph" | "report";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "project", label: "Project", icon: "📋" },
  { id: "view", label: "3D View", icon: "🧊" },
  { id: "summary", label: "Summary", icon: "📊" },
  { id: "analysis", label: "Analysis", icon: "🔬" },
  { id: "sizing", label: "Sizing", icon: "📐" },
  { id: "graph", label: "Graph", icon: "📈" },
  { id: "report", label: "Report", icon: "📄" },
];

interface Pending { doc: DxfDoc; analysis: DxfAnalysis; fileName: string; }

// Whether cloud is even possible — read straight from env (no firebase import,
// so the SDK stays off the startup path until the user opts in).
const cloudConfigured = !!import.meta.env.VITE_FIREBASE_API_KEY;

export function App(): JSX.Element {
  const { model, set: setModel, reset: resetModel, undo, redo, canUndo, canRedo } = useModelHistory();
  const [tab, setTab] = useState<TabId>("project");
  const [selectedPipe, setSelectedPipe] = useState<string | null>(null); // cross-tab pipe selection (Sizing ↔ 3D)
  const [note, setNote] = useState("Built-in sample");
  const [pending, setPending] = useState<Pending | null>(null);
  const [cloudOpen, setCloudOpen] = useState(false);

  // Restore the last working draft from localStorage so a reload never loses
  // work; fall back to the built-in sample.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rads-draft");
      if (raw) { resetModel(parseProject(JSON.parse(raw))); setNote("Restored your last draft"); return; }
    } catch { /* corrupt draft → sample */ }
    resetModel(sampleProject());
  }, [resetModel]);
  // Debounced auto-save of the working model to localStorage.
  useEffect(() => {
    if (!model) return;
    const h = setTimeout(() => { try { localStorage.setItem("rads-draft", JSON.stringify(model)); } catch { /* quota */ } }, 1000);
    return () => clearTimeout(h);
  }, [model]);
  // Auto-mount the cloud bar (loads firebase) only for users who were signed in
  // last time — everyone else pays nothing until they click "Cloud".
  useEffect(() => { if (cloudConfigured && localStorage.getItem("rads-cloud") === "1") setCloudOpen(true); }, []);

  // Solve + scene derive from the model so every tab stays in sync with edits.
  const { sol, solveError } = useMemo<{ sol: ProjectSolution | null; solveError?: string }>(() => {
    if (!model) return { sol: null };
    try { return { sol: solveProject(model) }; }
    catch (e) { return { sol: null, solveError: (e as Error).message }; }
  }, [model]);

  const scene = useMemo<AnnotatedScene | null>(() => {
    if (!model) return null;
    // Schematic (NTS) view: compress very long mains so the network stays
    // balanced instead of one supply run dwarfing the grid.
    try { return buildScene(model, { ...(sol ? { results: sol.results } : {}), layout: { compressLongRuns: true } }); }
    catch { return null; }
  }, [model, sol]);

  const issues = useMemo(() => (model ? checkModel(model) : []), [model]);
  const counts = issueCounts(issues);

  const status = useMemo(() => {
    if (!sol) return note + (solveError ? " · (not solved)" : "");
    let s = `${note} · ${Math.round(sol.summary.systemFlowGpm)} gpm · req ${sol.summary.sourcePressurePsi.toFixed(0)} psi`;
    if (!sol.summary.passesSupply) s += " ⚠ supply short";
    if (!sol.summary.meetsMinPressure) s += " ⚠ under min pressure";
    return s;
  }, [note, sol, solveError]);

  // Opening a document (file / New / cloud restore) starts a fresh undo history.
  function load(m: ProjectModel, msg: string, goto: TabId = "view"): void { resetModel(m); setNote(msg); setTab(goto); }

  // Ctrl/Cmd+Z = undo, Ctrl+Y / Ctrl+Shift+Z = redo — unless typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const el = e.target as HTMLElement | null;
      if (el && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); undo(); setNote("Undo"); }
      else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); redo(); setNote("Redo"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  function download(name: string, data: BlobPart, type: string): void {
    const url = URL.createObjectURL(new Blob([data], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }
  async function saveRhfc(): Promise<void> {
    if (!model) return;
    try { download(`${model.meta.id}.rhfc`, new Uint8Array(await encodeJSON(model)), "application/octet-stream"); setNote(`Saved ${model.meta.id}.rhfc`); }
    catch (e) { setNote(`Save error: ${(e as Error).message}`); }
  }
  function exportJson(): void {
    if (!model) return;
    download(`${model.meta.id}.json`, JSON.stringify(model, null, 2), "application/json");
    setNote(`Exported ${model.meta.id}.json`);
  }
  async function mergeFile(file: File): Promise<void> {
    if (!model) return;
    setNote(`Merging ${file.name}…`);
    try {
      const name = file.name.toLowerCase();
      const incoming = name.endsWith(".rhfc")
        ? parseProject(await decodeJSON(new Uint8Array(await file.arrayBuffer())))
        : parseProject(JSON.parse(await file.text()));
      setModel(mergeModels(model, incoming));
      setNote(`Merged ${file.name} (${incoming.network.nodes.length} nodes)`);
      setTab("project");
    } catch (e) { setNote(`Merge error: ${(e as Error).message}`); }
  }

  async function openFile(file: File): Promise<void> {
    setNote(`Loading ${file.name}…`);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".dxf")) {
        const { parseDxf, analyzeDxf } = await import("@rads/dxf-import");
        const doc = parseDxf(await file.text());
        setPending({ doc, analysis: analyzeDxf(doc), fileName: file.name });
        setNote(`Mapping ${file.name}…`);
      } else if (name.endsWith(".rhfc")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isRhfc(bytes)) throw new Error("Not a valid .rhfc file");
        load(parseProject(await decodeJSON(bytes)), `Opened ${file.name}`);
      } else {
        load(parseProject(JSON.parse(await file.text())), `Opened ${file.name}`);
      }
    } catch (e) { setNote(`Error: ${(e as Error).message}`); }
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, background: C.page }}>
      <header style={header}>
        <div style={brand}>
          <span style={{ fontWeight: 800, letterSpacing: 0.3, fontSize: 16 }}>RADS·HFC</span>
          <span style={{ opacity: 0.62, fontWeight: 500, fontSize: 12 }}>Hydraulic Calc</span>
        </div>
        <button style={fileBtn} onClick={() => load(newProject(new Date().toISOString()), "New project", "project")}>✚ New</button>
        <label style={fileBtn} title="Open a .dxf, .rhfc or .json project">
          ⤓ Open
          <input type="file" accept=".dxf,.rhfc,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ""; }} />
        </label>
        <button style={{ ...iconBtn, ...(canUndo ? {} : disabledBtn) }} disabled={!canUndo} title="Undo (Ctrl+Z)" onClick={() => { undo(); setNote("Undo"); }}>↶</button>
        <button style={{ ...iconBtn, ...(canRedo ? {} : disabledBtn) }} disabled={!canRedo} title="Redo (Ctrl+Y / Ctrl+Shift+Z)" onClick={() => { redo(); setNote("Redo"); }}>↷</button>
        <label style={{ ...fileBtn, ...(model ? {} : disabledBtn) }} title="Merge another .rhfc/.json network into this project">
          ⊕ Merge
          <input type="file" accept=".rhfc,.json" style={{ display: "none" }} disabled={!model} onChange={(e) => { const f = e.target.files?.[0]; if (f) void mergeFile(f); e.target.value = ""; }} />
        </label>
        <button style={{ ...fileBtn, ...(model ? {} : disabledBtn) }} disabled={!model} title="Save the project as an encrypted .rhfc file" onClick={() => void saveRhfc()}>💾 Save</button>
        <button style={{ ...fileBtn, ...(model ? {} : disabledBtn) }} disabled={!model} title="Export plain JSON" onClick={exportJson}>JSON</button>
        <span style={statusPill}>{status}</span>
        {model && (
          <span
            style={{ ...validBadge, ...(counts.errors ? validBad : counts.warnings ? validWarn : validOk) }}
            title={issues.length ? issues.map((i) => `${i.severity === "error" ? "✕" : "!"} ${i.message}`).join("\n") : "Model checks pass"}
          >
            {counts.errors ? `✕ ${counts.errors}` : counts.warnings ? `! ${counts.warnings}` : "✓ OK"}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {cloudConfigured && (cloudOpen ? (
          <Suspense fallback={<span style={statusPill}>☁ loading…</span>}>
            <CloudBar model={model} onLoadProject={(m) => load(m, `Restored ${m.meta.name}`, "summary")} />
          </Suspense>
        ) : (
          <button style={fileBtn} title="Sign in to sync projects across devices" onClick={() => setCloudOpen(true)}>☁ Cloud</button>
        ))}
      </header>

      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <nav style={sidebar}>
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ ...navBtn, ...(tab === t.id ? navBtnActive : {}) }}>
              <span style={{ fontSize: 16 }}>{t.icon}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <main style={{ flex: 1, position: "relative", minWidth: 0, background: C.page }}>
          <Suspense fallback={<div style={{ padding: 24, color: C.muted }}>Loading…</div>}>
          {!model ? (
            <div style={{ padding: 24, color: C.muted }}>Loading…</div>
          ) : tab === "project" ? (
            <ProjectTab model={model} onChange={(m) => { setModel(m); setNote("Edited"); }} issues={issues} />
          ) : tab === "view" ? (
            scene ? (
              <Viewer
                scene={scene}
                onSplitPipe={(pipeId, fraction) => { setModel((m) => (m ? splitPipeInModel(m, pipeId, fraction) : m)); setNote("Split pipe in 3D"); }}
                onDeleteNode={(nodeId) => { setModel((m) => (m ? deleteNodeInModel(m, nodeId) : m)); setNote("Deleted node in 3D"); }}
                onAddBranch={(fromNodeId, opts) => { setModel((m) => (m ? addBranchInModel(m, fromNodeId, { ...opts, direction: opts.direction as Direction }) : m)); setNote("Added branch in 3D"); }}
                onAddPipe={(fromNodeId, toNodeId, lengthFt, opts) => { setModel((m) => (m ? addPipeBetweenInModel(m, fromNodeId, toNodeId, { ...opts, lengthFt }) : m)); setNote("Connected nodes in 3D"); }}
                onMoveNode={(nodeId, geometry) => { setModel((m) => (m ? setNodeGeometryInModel(m, nodeId, geometry) : m)); setNote("Moved node in 3D"); }}
                highlightPipeId={selectedPipe ?? undefined}
                onSelectPipe={setSelectedPipe}
              />
            ) : <div style={{ padding: 24, color: C.muted }}>No geometry.</div>
          ) : tab === "summary" ? (
            <SummaryTab model={model} solution={sol} error={solveError} />
          ) : tab === "analysis" ? (
            <AnalysisTab model={model} solution={sol} error={solveError} />
          ) : tab === "sizing" ? (
            <SizingTab model={model} solution={sol} error={solveError} onChange={(m) => { setModel(m); setNote("Resized"); }} selectedPipe={selectedPipe} onSelectPipe={setSelectedPipe} />
          ) : tab === "graph" ? (
            <GraphTab model={model} solution={sol} error={solveError} />
          ) : (
            <ReportTab model={model} />
          )}
          </Suspense>
        </main>
      </div>

      {pending && (
        <Suspense fallback={null}>
        <ImportDialog
          doc={pending.doc}
          analysis={pending.analysis}
          fileName={pending.fileName}
          onCancel={() => { setPending(null); setNote("Import cancelled"); }}
          onImport={(m) => { setPending(null); load(m, `Imported ${pending.fileName}`); }}
        />
        </Suspense>
      )}
    </div>
  );
}

const header: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "linear-gradient(180deg,#0d4099,#0b3d91)", color: "#fff", fontFamily: FONT, boxShadow: "0 2px 12px rgba(11,61,145,0.28)", zIndex: 10 };
const brand: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, marginRight: 6 };
const fileBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 13px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600 };
const disabledBtn: CSSProperties = { opacity: 0.4, cursor: "default" };
const iconBtn: CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, padding: "5px 0", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, cursor: "pointer", fontSize: 15, fontWeight: 700, lineHeight: 1 };
const validBadge: CSSProperties = { fontSize: 11.5, fontWeight: 700, padding: "3px 9px", borderRadius: 999, cursor: "default", whiteSpace: "nowrap" };
const validOk: CSSProperties = { background: "rgba(255,255,255,0.16)", color: "#bbf7d0" };
const validWarn: CSSProperties = { background: "#fde68a", color: "#92400e" };
const validBad: CSSProperties = { background: "#fecaca", color: "#991b1b" };
const statusPill: CSSProperties = { marginLeft: 4, fontSize: 11.5, color: "#dbe7fa", background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 999, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const sidebar: CSSProperties = { width: 150, background: "#fff", borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "10px 8px", gap: 3, flexShrink: 0 };
const navBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "none", background: "transparent", color: C.ink, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT, textAlign: "left" };
const navBtnActive: CSSProperties = { background: C.band, color: C.primary };
