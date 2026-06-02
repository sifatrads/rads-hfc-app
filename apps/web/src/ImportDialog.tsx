/**
 * DXF import dialog — surfaces analyzeDxf()'s layers as a fully editable mapping
 * (the "selectable mapping" requirement): per-layer role, source units, calc
 * defaults, with a LIVE preview (pipes/heads/nodes/sized + warnings) that
 * re-runs importNetwork on every change before committing.
 */
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { ProjectModel } from "@rads/model";
import {
  defaultMapping,
  importNetwork,
  type DxfDoc,
  type DxfAnalysis,
  type ImportMapping,
  type LayerRole,
  type SourceUnit,
} from "@rads/dxf-import";

const ROLES: LayerRole[] = ["pipes", "heads", "valves", "node-id", "pipe-size", "length", "pressure", "coverage", "annotation", "ignore"];
const UNITS: SourceUnit[] = ["mm", "cm", "m", "in", "ft"];
const MATERIALS = ["black-steel-wet", "black-steel-dry", "galvanized", "copper", "cpvc", "ductile-iron", "stainless"];

export function ImportDialog({
  doc,
  analysis,
  fileName,
  onImport,
  onCancel,
}: {
  doc: DxfDoc;
  analysis: DxfAnalysis;
  fileName: string;
  onImport: (model: ProjectModel) => void;
  onCancel: () => void;
}): JSX.Element {
  const [mapping, setMapping] = useState<ImportMapping>(() => defaultMapping(analysis, { projectName: fileName.replace(/\.dxf$/i, ""), projectId: fileName.replace(/\.dxf$/i, "") }));

  const set = (patch: Partial<ImportMapping>) => setMapping((m) => ({ ...m, ...patch }));
  const setRole = (layer: string, role: LayerRole) => setMapping((m) => ({ ...m, layerRoles: { ...m.layerRoles, [layer]: role } }));

  const preview = useMemo(() => {
    try {
      return { ...importNetwork(doc, mapping), error: undefined as string | undefined };
    } catch (e) {
      return { model: undefined, stats: undefined, warnings: [], error: (e as Error).message };
    }
  }, [doc, mapping]);

  return (
    <div style={backdrop}>
      <div style={modal}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <strong style={{ color: "#0b3d91", fontSize: 16 }}>Import DXF</strong>
          <span style={{ color: "#607d8b", fontSize: 13 }}>{fileName}</span>
          <span style={{ marginLeft: "auto", fontSize: 12, color: "#607d8b" }}>
            {analysis.lineCount} lines · {analysis.circleCount} circles · {analysis.textCount} text · {analysis.is3D ? "3D" : "2D"} · {analysis.insunitsName}
          </span>
          <button style={x} onClick={onCancel}>✕</button>
        </div>

        {/* global options */}
        <div style={optsGrid}>
          <Field label="Source units"><Select value={mapping.sourceUnit} opts={UNITS} onChange={(v) => set({ sourceUnit: v as SourceUnit })} /></Field>
          <Field label="System"><Select value={mapping.systemType} opts={["sprinkler", "standpipe"]} onChange={(v) => set({ systemType: v as ImportMapping["systemType"] })} /></Field>
          <Field label="Standard"><Select value={mapping.standardId} opts={["nfpa13", "nfpa13r", "nfpa13d", "en12845"]} onChange={(v) => set({ standardId: v })} /></Field>
          <Field label="Display units"><Select value={mapping.displayUnits} opts={["imperial", "metric"]} onChange={(v) => set({ displayUnits: v as ImportMapping["displayUnits"] })} /></Field>
          <Field label="Default K"><Num value={mapping.defaultKFactor} step={0.1} onChange={(v) => set({ defaultKFactor: v })} /></Field>
          <Field label="Default C"><Num value={mapping.defaultCFactor} step={5} onChange={(v) => set({ defaultCFactor: v })} /></Field>
          <Field label="Material"><Select value={mapping.defaultMaterial} opts={MATERIALS} onChange={(v) => set({ defaultMaterial: v })} /></Field>
          <Field label="Snap tol"><Num value={mapping.snapToleranceSource} step={0.5} onChange={(v) => set({ snapToleranceSource: v })} /></Field>
          <Field label="Size source"><Select value={mapping.sizeSource} opts={["nearest-text", "constant"]} onChange={(v) => set({ sizeSource: v as ImportMapping["sizeSource"] })} /></Field>
          <Field label="Default size mm"><Num value={mapping.defaultNominalSizeMm} step={5} onChange={(v) => set({ defaultNominalSizeMm: v })} /></Field>
        </div>

        {/* layer mapping table */}
        <div style={{ fontWeight: 600, margin: "10px 0 4px", color: "#37474f" }}>Layers → role</div>
        <div style={tableWrap}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#607d8b" }}>
                <th style={th}>Layer</th>
                <th style={th}>Entities</th>
                <th style={th}>Sample text</th>
                <th style={th}>Role</th>
              </tr>
            </thead>
            <tbody>
              {analysis.layers.map((l) => (
                <tr key={l.name} style={{ borderTop: "1px solid #eceff1" }}>
                  <td style={td}><code>{l.name}</code></td>
                  <td style={td}>{Object.entries(l.entityTypes).map(([t, c]) => `${c} ${t}`).join(", ")}</td>
                  <td style={{ ...td, color: "#78909c", maxWidth: 240, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.sampleTexts.join(" · ")}</td>
                  <td style={td}>
                    <Select value={mapping.layerRoles[l.name] ?? "ignore"} opts={ROLES} onChange={(v) => setRole(l.name, v as LayerRole)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* live preview + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10 }}>
          {preview.error ? (
            <span style={{ color: "#c62828", fontSize: 13 }}>Error: {preview.error}</span>
          ) : (
            <span style={{ fontSize: 13, color: "#2e7d32" }}>
              Preview: <strong>{preview.stats!.pipes}</strong> pipes · <strong>{preview.stats!.heads}</strong> heads · {preview.stats!.nodes} nodes · {preview.stats!.pipesWithMatchedSize} sized
            </span>
          )}
          {preview.warnings.length > 0 && <span style={{ fontSize: 12, color: "#ef6c00" }}>⚠ {preview.warnings.join(" ")}</span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <button style={btnGhost} onClick={onCancel}>Cancel</button>
            <button style={btnPrimary} disabled={!preview.model} onClick={() => preview.model && onImport(preview.model)}>Import {preview.stats ? `${preview.stats.pipes} pipes` : ""}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 11, color: "#607d8b" }}>{label}</span>
      {children}
    </label>
  );
}
function Select({ value, opts, onChange }: { value: string; opts: readonly string[]; onChange: (v: string) => void }): JSX.Element {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} style={input}>
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Num({ value, step, onChange }: { value: number; step?: number; onChange: (v: number) => void }): JSX.Element {
  return <input type="number" value={value} step={step ?? 1} onChange={(e) => onChange(Number(e.target.value))} style={input} />;
}

const backdrop: CSSProperties = { position: "fixed", inset: 0, background: "rgba(15,30,50,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 };
const modal: CSSProperties = { background: "#fff", borderRadius: 8, padding: 16, width: "min(880px, 94vw)", maxHeight: "90vh", overflow: "auto", fontFamily: "Helvetica, Arial, sans-serif", boxShadow: "0 8px 30px rgba(0,0,0,0.3)" };
const optsGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 };
const tableWrap: CSSProperties = { maxHeight: 260, overflow: "auto", border: "1px solid #eceff1", borderRadius: 4 };
const th: CSSProperties = { padding: "6px 8px", position: "sticky", top: 0, background: "#f7f9fb" };
const td: CSSProperties = { padding: "4px 8px", verticalAlign: "top" };
const input: CSSProperties = { fontSize: 12, padding: "3px 5px", border: "1px solid #cfd8dc", borderRadius: 4, width: "100%", boxSizing: "border-box" };
const x: CSSProperties = { border: "none", background: "transparent", fontSize: 16, cursor: "pointer", color: "#607d8b" };
const btnGhost: CSSProperties = { padding: "6px 14px", border: "1px solid #b0bec5", background: "#fff", borderRadius: 4, cursor: "pointer" };
const btnPrimary: CSSProperties = { padding: "6px 16px", border: "none", background: "#0b3d91", color: "#fff", borderRadius: 4, cursor: "pointer", fontWeight: 600 };
