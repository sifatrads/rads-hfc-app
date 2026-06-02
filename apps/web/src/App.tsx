import { useEffect, useState, type CSSProperties } from "react";
import { Viewer } from "@rads/viewer-3d";
import { buildScene, type AnnotatedScene } from "@rads/scene";
import { parseProject, type ProjectModel } from "@rads/model";
import { parseDxf, analyzeDxf, type DxfDoc, type DxfAnalysis } from "@rads/dxf-import";
import { solveProject } from "@rads/solve";
import { decodeJSON, isRhfc } from "@rads/container";
import { sampleProject } from "./sample";
import { ImportDialog } from "./ImportDialog";
import { ReportsPanel } from "./ReportsPanel";
import { CloudBar } from "./CloudBar";

interface Pending {
  doc: DxfDoc;
  analysis: DxfAnalysis;
  fileName: string;
}

export function App(): JSX.Element {
  const [scene, setScene] = useState<AnnotatedScene | null>(null);
  const [model, setModel] = useState<ProjectModel | null>(null);
  const [status, setStatus] = useState("Built-in sample");
  const [pending, setPending] = useState<Pending | null>(null);
  const [reports, setReports] = useState(false);

  useEffect(() => {
    const m = sampleProject();
    setModel(m);
    setScene(buildScene(m));
  }, []);

  function show(model: ProjectModel, msg: string): void {
    setModel(model);
    let extra = "";
    try {
      const sol = solveProject(model);
      setScene(buildScene(model, { results: sol.results }));
      extra = ` · ${Math.round(sol.summary.systemFlowGpm)} gpm · req ${sol.summary.sourcePressurePsi.toFixed(0)} psi`;
      if (!sol.summary.passesSupply) extra += " ⚠ supply short";
    } catch {
      setScene(buildScene(model)); // geometry only if the solve fails
    }
    setStatus(msg + extra);
  }

  async function openFile(file: File): Promise<void> {
    setStatus(`Loading ${file.name}…`);
    try {
      const name = file.name.toLowerCase();
      if (name.endsWith(".dxf")) {
        const doc = parseDxf(await file.text());
        setPending({ doc, analysis: analyzeDxf(doc), fileName: file.name });
        setStatus(`Mapping ${file.name}…`);
      } else if (name.endsWith(".rhfc")) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isRhfc(bytes)) throw new Error("Not a valid .rhfc file");
        show(parseProject(await decodeJSON(bytes)), `Opened ${file.name}`);
      } else {
        show(parseProject(JSON.parse(await file.text())), `Opened ${file.name}`);
      }
    } catch (e) {
      setStatus(`Error: ${(e as Error).message}`);
    }
  }

  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", fontFamily: FONT, background: "#eef2f6" }}>
      <header style={header}>
        <div style={brand}>
          <span style={{ fontWeight: 800, letterSpacing: 0.3, fontSize: 16 }}>RADS·HFC</span>
          <span style={{ opacity: 0.62, fontWeight: 500, fontSize: 12 }}>Hydraulic Calc</span>
        </div>
        <label style={fileBtn} title="Open a .dxf, .rhfc or .json project">
          ＋ Open
          <input type="file" accept=".dxf,.rhfc,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ""; }} />
        </label>
        <button style={{ ...reportBtn, ...(model ? {} : disabledBtn) }} disabled={!model} onClick={() => setReports(true)}>Report</button>
        <span style={statusPill}>{status}</span>
        <span style={{ flex: 1 }} />
        <CloudBar model={model} onLoadProject={(m) => show(m, `Restored ${m.meta.name} from Drive`)} />
      </header>
      <main style={{ flex: 1, position: "relative" }}>
        {scene ? <Viewer scene={scene} /> : <div style={{ padding: 20 }}>Loading…</div>}
      </main>
      {pending && (
        <ImportDialog
          doc={pending.doc}
          analysis={pending.analysis}
          fileName={pending.fileName}
          onCancel={() => { setPending(null); setStatus("Import cancelled"); }}
          onImport={(model) => {
            setPending(null);
            show(model, `Imported ${pending.fileName}`);
          }}
        />
      )}
      {reports && model && <ReportsPanel model={model} onClose={() => setReports(false)} />}
    </div>
  );
}

const FONT = "'Segoe UI', system-ui, Helvetica, Arial, sans-serif";
const header: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "9px 16px", background: "linear-gradient(180deg,#0d4099,#0b3d91)", color: "#fff", fontFamily: FONT, boxShadow: "0 2px 12px rgba(11,61,145,0.28)", zIndex: 10 };
const brand: CSSProperties = { display: "flex", alignItems: "baseline", gap: 8, marginRight: 6 };
const fileBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, marginLeft: 8, padding: "5px 13px", background: "rgba(255,255,255,0.14)", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600 };
const reportBtn: CSSProperties = { padding: "5px 14px", background: "#16a34a", color: "#fff", border: "none", borderRadius: 7, cursor: "pointer", fontSize: 12.5, fontWeight: 600 };
const disabledBtn: CSSProperties = { opacity: 0.45, cursor: "default", background: "#64748b" };
const statusPill: CSSProperties = { marginLeft: 4, fontSize: 11.5, color: "#dbe7fa", background: "rgba(255,255,255,0.1)", padding: "3px 10px", borderRadius: 999, maxWidth: 380, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
