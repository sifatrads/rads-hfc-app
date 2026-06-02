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
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", fontFamily: "Helvetica, Arial, sans-serif" }}>
      <header style={header}>
        <strong style={{ color: "#fff" }}>RADS‑HFC‑APP</strong>
        <span style={{ color: "#9fb6d6" }}>· 3D Viewer</span>
        <label style={fileBtn}>
          Open .dxf / .rhfc / .json
          <input type="file" accept=".dxf,.rhfc,.json" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void openFile(f); e.target.value = ""; }} />
        </label>
        <button style={reportBtn} disabled={!model} onClick={() => setReports(true)}>Reports</button>
        <span style={{ marginLeft: 12, fontSize: 12, color: "#cfd8dc" }}>{status}</span>
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

const header: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", background: "#0b3d91", color: "#fff", fontSize: 14 };
const fileBtn: CSSProperties = { marginLeft: 16, padding: "4px 10px", background: "#1565c0", color: "#fff", borderRadius: 4, cursor: "pointer", fontSize: 12 };
const reportBtn: CSSProperties = { marginLeft: 8, padding: "4px 12px", background: "#2e7d32", color: "#fff", border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 };
