/**
 * Reports panel — solves the current project and renders the full NFPA §27.4
 * sheet set (Summary / Graph / Supply / Node / Pipe worksheet / junction
 * balancing / formulas / C-values / equivalent lengths / pump datasheets) as
 * vector SVG, with a "Print / Save as PDF" action that opens a print window with
 * one A4 page per sheet (browser → vector PDF).
 */
import { useMemo, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";
import { reportSheets, type Sheet } from "@rads/report";

function printSheets(sheets: Sheet[], title: string): void {
  const w = window.open("", "_blank");
  if (!w) return;
  const style = "@page{size:A4;margin:0}body{margin:0}.sheet{page-break-after:always}.sheet:last-child{page-break-after:auto}.sheet svg{width:210mm;height:297mm;display:block}";
  w.document.write(`<!doctype html><html><head><title>${title}</title><style>${style}</style></head><body>${sheets.map((s) => `<div class="sheet">${s.svg}</div>`).join("")}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 350);
}

export function ReportsPanel({ model, onClose }: { model: ProjectModel; onClose: () => void }): JSX.Element {
  const { sheets, error } = useMemo(() => {
    try {
      return { sheets: reportSheets(model, solveProject(model)), error: undefined as string | undefined };
    } catch (e) {
      return { sheets: [] as Sheet[], error: (e as Error).message };
    }
  }, [model]);

  return (
    <div style={backdrop}>
      <div style={panel}>
        <div style={bar}>
          <strong style={{ color: "#fff" }}>Hydraulic Report — {model.meta.name}</strong>
          <span style={{ color: "#9fb6d6", fontSize: 12 }}>{sheets.length} sheets (NFPA 13 §27.4)</span>
          <button style={primary} disabled={!sheets.length} onClick={() => printSheets(sheets, `RADS-HFC Report — ${model.meta.id}`)}>Print / Save as PDF</button>
          <button style={ghost} onClick={onClose}>Close</button>
        </div>
        <div style={body}>
          {error && <div style={{ color: "#ffcdd2", padding: 16 }}>Solve error: {error}</div>}
          {sheets.map((s, i) => (
            <div key={i} style={sheetWrap}>
              <div style={{ fontSize: 12, color: "#cfd8dc", margin: "8px 0 4px" }}>{i + 1}. {s.title}</div>
              <div style={sheetBox} dangerouslySetInnerHTML={{ __html: s.svg }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const backdrop: CSSProperties = { position: "fixed", inset: 0, background: "rgba(10,20,35,0.6)", display: "flex", flexDirection: "column", zIndex: 200 };
const panel: CSSProperties = { position: "absolute", inset: "3vh 4vw", background: "#263238", borderRadius: 8, display: "flex", flexDirection: "column", overflow: "hidden", boxShadow: "0 10px 40px rgba(0,0,0,0.4)" };
const bar: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "#0b3d91" };
const body: CSSProperties = { flex: 1, overflow: "auto", padding: "10px 16px", background: "#37474f", display: "flex", flexDirection: "column", alignItems: "center" };
const sheetWrap: CSSProperties = { width: "min(820px, 96%)", marginBottom: 18 };
const sheetBox: CSSProperties = { background: "#fff", borderRadius: 2, boxShadow: "0 2px 10px rgba(0,0,0,0.3)", overflow: "hidden" };
const primary: CSSProperties = { marginLeft: "auto", padding: "6px 14px", border: "none", background: "#1565c0", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600 };
const ghost: CSSProperties = { padding: "6px 14px", border: "1px solid #90a4ae", background: "transparent", color: "#fff", borderRadius: 4, cursor: "pointer" };
