/** Analysis tab — node analysis (§27.4.5.5) + pipe information (§27.4.5.6) in-app,
 * live from the solve. Read-only result grids; edit on the Project tab. */
import { useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle, th, td, tdNum } from "../ui";
import { units } from "../units";

export function AnalysisTab({ model, solution, error }: { model: ProjectModel; solution: ProjectSolution | null; error?: string }): JSX.Element {
  const [sigOnly, setSigOnly] = useState(false);
  if (!solution) {
    return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted }}>{error ? `Solve error: ${error}` : "Nothing to analyse yet."}</div>;
  }
  const nr = solution.results.nodes;
  const pr = solution.results.pipes;
  const u = units(model);
  // loss gradient (psi/ft → bar/m): friction over the physical pipe length.
  const slopeFactor = u.metric ? 0.0689476 / 0.3048 : 1;
  const shownPipes = sigOnly ? model.network.pipes.filter((p) => (pr[p.id]?.flowGpm ?? 0) >= 1) : model.network.pipes;

  return (
    <div style={page}>
      <div style={{ ...card, padding: 14 }}>
        <div style={sectionTitle}>Node analysis · {model.network.nodes.length} nodes</div>
        <div style={scroll}>
          <table style={table}>
            <thead><tr>{["#", "Type", `Elev (${u.U.l})`, "K", `Total P (${u.U.p})`, `Normal P (${u.U.p})`, `Velocity P (${u.U.p})`, `Discharge (${u.U.q})`].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {model.network.nodes.map((n, i) => {
                const r = nr[n.id];
                return (
                  <tr key={n.id} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.primary }}>{n.id}</td>
                    <td style={td}>{n.type}</td>
                    <td style={tdNum}>{u.l(n.elevationFt)}</td>
                    <td style={tdNum}>{n.kFactor ? n.kFactor.toFixed(1) : "—"}</td>
                    <td style={tdNum}>{u.p(r?.totalPressurePsi)}</td>
                    <td style={tdNum}>{u.p(r?.normalPressurePsi)}</td>
                    <td style={tdNum}>{u.p(r?.velocityPressurePsi, 2)}</td>
                    <td style={tdNum}>{u.q(r?.dischargeGpm)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={sectionTitle}>Pipe information · {shownPipes.length}{sigOnly ? ` of ${model.network.pipes.length}` : ""} pipes</span>
          <span style={{ flex: 1 }} />
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink, cursor: "pointer" }}>
            <input type="checkbox" checked={sigOnly} onChange={(e) => setSigOnly(e.target.checked)} /> Significant pipes only (≥ 1 {u.U.q})
          </label>
        </div>
        <div style={scroll}>
          <table style={table}>
            <thead><tr>{["#", "From → To", "Size", `Length (${u.U.l})`, `Flow (${u.U.q})`, `Velocity (${u.U.v})`, `Friction (${u.U.p})`, `Loss/${u.U.l} (${u.U.p}/${u.U.l})`, `Elev (${u.U.p})`, `Total loss (${u.U.p})`].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {shownPipes.map((p, i) => {
                const r = pr[p.id];
                const vHot = (r?.velocityFps ?? 0) > 20;
                const physLen = (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0);
                const slope = physLen > 0 && r?.frictionLossPsi !== undefined ? (r.frictionLossPsi / physLen) * slopeFactor : undefined;
                return (
                  <tr key={p.id} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                    <td style={td}>{p.from} → {p.to}</td>
                    <td style={td}>{p.nominalSize ? `${p.nominalSize}"` : "—"}</td>
                    <td style={tdNum}>{u.l(p.lengthFt)}</td>
                    <td style={tdNum}>{u.q(r?.flowGpm)}</td>
                    <td style={{ ...tdNum, color: vHot ? C.bad : C.ink, fontWeight: vHot ? 700 : 400 }}>{u.v(r?.velocityFps)}</td>
                    <td style={tdNum}>{u.p(r?.frictionLossPsi, 2)}</td>
                    <td style={tdNum}>{slope === undefined ? "—" : slope.toFixed(u.metric ? 4 : 3)}</td>
                    <td style={tdNum}>{u.p(r?.elevationLossPsi, 2)}</td>
                    <td style={tdNum}>{u.p(r?.totalLossPsi, 2)}</td>
                  </tr>
                );
              })}
              {shownPipes.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={10}>No pipes carry flow ≥ 1 {u.U.q}.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Velocity &gt; {u.v(20)} {u.U.v} flagged red (NFPA 13 guidance). Loss/{u.U.l} = friction gradient (pressure lost per unit pipe length). Total loss = friction + elevation.</div>
      </div>
    </div>
  );
}

const page: CSSProperties = { padding: 18, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const scroll: CSSProperties = { overflow: "auto", maxHeight: "44vh", border: `1px solid ${C.line}`, borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: FONT };
