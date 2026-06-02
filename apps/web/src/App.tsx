/**
 * RADS-HFC-APP shell — a left-menu, multi-tab application:
 *   Project (data entry) · 3D View · Summary · Analysis · Graph · Report.
 * The model is owned here; the solve + scene derive from it, so editing on the
 * Project tab keeps every other tab live. Open .dxf/.rhfc/.json or build from
 * scratch with "New".
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { Viewer } from "@rads/viewer-3d";
import { buildScene, type AnnotatedScene } from "@rads/scene";
import { parseProject, type ProjectModel } from "@rads/model";
import { parseDxf, analyzeDxf, type DxfDoc, type DxfAnalysis } from "@rads/dxf-import";
import { solveProject, type ProjectSolution } from "@rads/solve";
import { decodeJSON, encodeJSON, isRhfc } from "@rads/container";
import { sampleProject } from "./sample";
import { newProject } from "./network-edit";
import { ImportDialog } from "./ImportDialog";
import { CloudBar } from "./CloudBar";
import { ProjectTab } from "./tabs/ProjectTab";
import { SummaryTab } from "./tabs/SummaryTab";
import { AnalysisTab } from "./tabs/AnalysisTab";
import { GraphTab } from "./tabs/GraphTab";
import { ReportTab } from "./tabs/ReportTab";
import { C, FONT } from "./ui";

type TabId = "project" | "view" | "summary" | "analysis" | "graph" | "report";
const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "project", label: "Project", icon: "📋" },
  { id: "view", label: "3D View", icon: "🧊" },
  { id: "summary", label: "Summary", icon: "📊" },
  { id: "analysis", label: "Analysis", icon: "🔬" },
  { id: "graph", label: "Graph", icon: "📈" },
  { id: "report", label: "Report", icon: "📄" },
];

interface Pending { doc: DxfDoc; analysis: DxfAnalysis; fileName: string; }

export function App(): JSX.Element {
  const [model, setModel] = useState<ProjectModel | null>(null);
  const [tab, setTab] = useState<TabId>("project");
  const [note, setNote] = useState("Built-in sample");
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => { setModel(sampleProject()); }, []);

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

  const status = useMemo(() => {
    if (!sol) return note + (solveError ? " · (not solved)" : "");
    let s = `${note} · ${Math.round(sol.summary.systemFlowGpm)} gpm · req ${sol.summary.sourcePressurePsi.toFixed(0)} psi`;
    if (!sol.summary.passesSupply) s += " ⚠ supply short";
    return s;
  }, [note, sol, solveError]);

  function load(m: ProjectModel, msg: string, goto: TabId = "view"): void { setModel(m); setNote(msg); setTab(goto); }

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

  async function openFile(file: File): Promise<void> {
    setNote(`Loading ${file.name}…`);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".dxf")) {
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
        <button style={{ ...fileBtn, ...(model ? {} : disabledBtn) }} disabled={!model} title="Save the project as an encrypted .rhfc file" onClick={() => void saveRhfc()}>💾 Save</button>
        <button style={{ ...fileBtn, ...(model ? {} : disabledBtn) }} disabled={!model} title="Export plain JSON" onClick={exportJson}>JSON</button>
        <span style={statusPill}>{status}</span>
        <span style={{ flex: 1 }} />
        <CloudBar model={model} onLoadProject={(m) => load(m, `Restored ${m.meta.name}`, "summary")} />
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
          {!model ? (
            <div style={{ padding: 24, color: C.muted }}>Loading…</div>
          ) : tab === "project" ? (
            <ProjectTab model={model} onChange={(m) => { setModel(m); setNote("Edited"); }} />
          ) : tab === "view" ? (
            scene ? <Viewer scene={scene} /> : <div style={{ padding: 24, color: C.muted }}>No geometry.</div>
          ) : tab === "summary" ? (
            <SummaryTab model={model} solution={sol} error={solveError} />
          ) : tab === "analysis" ? (
            <AnalysisTab model={model} solution={sol} error={solveError} />
          ) : tab === "graph" ? (
            <GraphTab model={model} solution={sol} error={solveError} />
          ) : (
            <ReportTab model={model} />
          )}
        </main>
      </div>

      {pending && (
        <ImportDialog
          doc={pending.doc}
          analysis={pending.analysis}
          fileName={pending.fileName}
          onCancel={() => { setPending(null); setNote("Import cancelled"); }}
          onImport={(m) => { setPending(null); load(m, `Imported ${pending.fileName}`); }}
        />
      )}
    </div>
  );
}

const header: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "linear-gradient(180deg,#0d4099,#0b3d91)", color: "#fff", fontFamily: FONT, boxShadow: "0 2px 12px rgba(11,61,145,0.28)", zIndex: 10 };
const brand: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, marginRight: 6 };
const fileBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 13px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600 };
const disabledBtn: CSSProperties = { opacity: 0.4, cursor: "default" };
const statusPill: CSSProperties = { marginLeft: 4, fontSize: 11.5, color: "#dbe7fa", background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 999, maxWidth: 420, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const sidebar: CSSProperties = { width: 150, background: "#fff", borderRight: `1px solid ${C.line}`, display: "flex", flexDirection: "column", padding: "10px 8px", gap: 3, flexShrink: 0 };
const navBtn: CSSProperties = { display: "flex", alignItems: "center", gap: 9, padding: "9px 11px", border: "none", background: "transparent", color: C.ink, borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: FONT, textAlign: "left" };
const navBtnActive: CSSProperties = { background: C.band, color: C.primary };
