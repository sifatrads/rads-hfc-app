/** Analysis tab — node analysis (§27.4.5.5) + pipe information (§27.4.5.6) in-app,
 * live from the solve. Read-only result grids; edit on the Project tab. */
import { type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle, th, td, tdNum } from "../ui";

const f = (v: number | undefined, d = 1): string => (typeof v === "number" ? v.toFixed(d) : "—");

export function AnalysisTab({ model, solution, error }: { model: ProjectModel; solution: ProjectSolution | null; error?: string }): JSX.Element {
  if (!solution) {
    return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted }}>{error ? `Solve error: ${error}` : "Nothing to analyse yet."}</div>;
  }
  const nr = solution.results.nodes;
  const pr = solution.results.pipes;

  return (
    <div style={page}>
      <div style={{ ...card, padding: 14 }}>
        <div style={sectionTitle}>Node analysis · {model.network.nodes.length} nodes</div>
        <div style={scroll}>
          <table style={table}>
            <thead><tr>{["#", "Type", "Elev (ft)", "K", "Total P (psi)", "Normal P (psi)", "Velocity P (psi)", "Discharge (gpm)"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {model.network.nodes.map((n, i) => {
                const r = nr[n.id];
                return (
                  <tr key={n.id} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.primary }}>{n.id}</td>
                    <td style={td}>{n.type}</td>
                    <td style={tdNum}>{f(n.elevationFt, 1)}</td>
                    <td style={tdNum}>{n.kFactor ? n.kFactor.toFixed(1) : "—"}</td>
                    <td style={tdNum}>{f(r?.totalPressurePsi)}</td>
                    <td style={tdNum}>{f(r?.normalPressurePsi)}</td>
                    <td style={tdNum}>{f(r?.velocityPressurePsi, 2)}</td>
                    <td style={tdNum}>{f(r?.dischargeGpm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={sectionTitle}>Pipe information · {model.network.pipes.length} pipes</div>
        <div style={scroll}>
          <table style={table}>
            <thead><tr>{["#", "From → To", "Size", "Length (ft)", "Flow (gpm)", "Velocity (ft/s)", "Friction (psi)", "Elev (psi)", "Total loss (psi)"].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {model.network.pipes.map((p, i) => {
                const r = pr[p.id];
                const vHot = (r?.velocityFps ?? 0) > 20;
                return (
                  <tr key={p.id} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                    <td style={td}>{p.from} → {p.to}</td>
                    <td style={td}>{p.nominalSize ? `${p.nominalSize}"` : "—"}</td>
                    <td style={tdNum}>{f(p.lengthFt, 1)}</td>
                    <td style={tdNum}>{f(r?.flowGpm)}</td>
                    <td style={{ ...tdNum, color: vHot ? C.bad : C.ink, fontWeight: vHot ? 700 : 400 }}>{f(r?.velocityFps)}</td>
                    <td style={tdNum}>{f(r?.frictionLossPsi, 2)}</td>
                    <td style={tdNum}>{f(r?.elevationLossPsi, 2)}</td>
                    <td style={tdNum}>{f(r?.totalLossPsi, 2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Velocity &gt; 20 ft/s flagged red (NFPA 13 guidance). Total loss = friction + elevation.</div>
      </div>
    </div>
  );
}

const page: CSSProperties = { padding: 18, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const scroll: CSSProperties = { overflow: "auto", maxHeight: "44vh", border: `1px solid ${C.line}`, borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: FONT };
