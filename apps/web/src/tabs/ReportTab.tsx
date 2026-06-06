/** Report tab — renders the full NFPA §27.4 sheet set (working-plan drawings +
 * report sheets) and a Print / Save as PDF action (one A4 page per sheet). */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { buildReportSheets, printSheets } from "../report-build";
import { C, FONT, card, btnGreen } from "../ui";

export function ReportTab({ model }: { model: ProjectModel }): JSX.Element {
  const { sheets, error } = useMemo(() => buildReportSheets(model), [model]);
  // Page selection for printing — defaults to all; resets when the sheets change.
  const [selected, setSelected] = useState<Set<number>>(new Set());
  useEffect(() => { setSelected(new Set(sheets.map((_, i) => i))); }, [sheets]);
  const toggle = (i: number) => setSelected((p) => { const s = new Set(p); s.has(i) ? s.delete(i) : s.add(i); return s; });
  const chosen = sheets.filter((_, i) => selected.has(i));

  return (
    <div style={page}>
      <div style={bar}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>Hydraulic Report — {model.meta.name}</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{sheets.length} sheets · NFPA 13 §27.4 · A4 portrait</div>
        </div>
        <span style={{ flex: 1 }} />
        {sheets.length > 0 && (
          <span style={{ fontSize: 11.5, color: C.muted, display: "inline-flex", alignItems: "center", gap: 8 }}>
            {selected.size} of {sheets.length}
            <button style={miniBtn} onClick={() => setSelected(new Set(sheets.map((_, i) => i)))}>All</button>
            <button style={miniBtn} onClick={() => setSelected(new Set())}>None</button>
          </span>
        )}
        <button style={{ ...btnGreen, opacity: chosen.length ? 1 : 0.5 }} disabled={!chosen.length} onClick={() => printSheets(chosen, `RADS-HFC Report — ${model.meta.id}`)}>Print / Save as PDF{chosen.length && chosen.length < sheets.length ? ` (${chosen.length})` : ""}</button>
      </div>
      <div style={scroll}>
        {error && <div style={{ color: C.bad, padding: 16 }}>Solve error: {error}</div>}
        {sheets.map((s, i) => (
          <div key={i} style={{ width: "min(820px, 96%)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: C.muted, margin: "10px 2px 5px", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.has(i)} onChange={() => toggle(i)} /> {i + 1}. {s.title}{selected.has(i) ? "" : " · excluded from print"}
            </label>
            <div style={{ ...card, overflow: "hidden", boxShadow: "0 2px 10px rgba(15,30,60,0.14)", opacity: selected.has(i) ? 1 : 0.5 }} dangerouslySetInnerHTML={{ __html: s.svg }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const page: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT, background: C.page };
const bar: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#fff", borderBottom: `1px solid ${C.line}` };
const scroll: CSSProperties = { flex: 1, overflow: "auto", padding: "6px 0 24px", display: "flex", flexDirection: "column", alignItems: "center" };
const miniBtn: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.accent, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 5, padding: "2px 7px", cursor: "pointer" };
