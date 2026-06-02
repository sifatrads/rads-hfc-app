/** Report tab — renders the full NFPA §27.4 sheet set (working-plan drawings +
 * report sheets) and a Print / Save as PDF action (one A4 page per sheet). */
import { useMemo, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import { buildReportSheets, printSheets } from "../report-build";
import { C, FONT, card, btnGreen } from "../ui";

export function ReportTab({ model }: { model: ProjectModel }): JSX.Element {
  const { sheets, error } = useMemo(() => buildReportSheets(model), [model]);

  return (
    <div style={page}>
      <div style={bar}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800, color: C.primary }}>Hydraulic Report — {model.meta.name}</div>
          <div style={{ fontSize: 11.5, color: C.muted }}>{sheets.length} sheets · NFPA 13 §27.4 · A4 portrait</div>
        </div>
        <span style={{ flex: 1 }} />
        <button style={{ ...btnGreen, opacity: sheets.length ? 1 : 0.5 }} disabled={!sheets.length} onClick={() => printSheets(sheets, `RADS-HFC Report — ${model.meta.id}`)}>Print / Save as PDF</button>
      </div>
      <div style={scroll}>
        {error && <div style={{ color: C.bad, padding: 16 }}>Solve error: {error}</div>}
        {sheets.map((s, i) => (
          <div key={i} style={{ width: "min(820px, 96%)" }}>
            <div style={{ fontSize: 12, color: C.muted, margin: "10px 2px 5px" }}>{i + 1}. {s.title}</div>
            <div style={{ ...card, overflow: "hidden", boxShadow: "0 2px 10px rgba(15,30,60,0.14)" }} dangerouslySetInnerHTML={{ __html: s.svg }} />
          </div>
        ))}
      </div>
    </div>
  );
}

const page: CSSProperties = { display: "flex", flexDirection: "column", height: "100%", fontFamily: FONT, background: C.page };
const bar: CSSProperties = { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", background: "#fff", borderBottom: `1px solid ${C.line}` };
const scroll: CSSProperties = { flex: 1, overflow: "auto", padding: "6px 0 24px", display: "flex", flexDirection: "column", alignItems: "center" };
