/** Summary tab — the NFPA §27.4.5.2 summary in-app: result stat cards + the key
 * design/demand/supply figures, live from the solve. */
import type { CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle, toneColor } from "../ui";

export function SummaryTab({ model, solution, error }: { model: ProjectModel; solution: ProjectSolution | null; error?: string }): JSX.Element {
  if (!solution) return <Empty msg={error ? `Solve error: ${error}` : "Add nodes, pipes and a water supply to see results."} />;
  const s = solution.summary;
  const pass = s.passesSupply && s.meetsMinPressure;
  const cards = [
    { label: "Required pressure", value: s.sourcePressurePsi.toFixed(1), unit: "psi", sub: `at source (node ${s.sourceId})`, tone: undefined },
    { label: "Total demand", value: Math.round(s.totalDemandGpm).toString(), unit: "gpm", sub: `${Math.round(s.systemFlowGpm)} system + ${Math.round(s.hoseAllowanceGpm)} hose`, tone: undefined },
    { label: "Supply available", value: s.availablePsi.toFixed(1), unit: "psi", sub: `@ ${Math.round(s.totalDemandGpm)} gpm`, tone: undefined },
    { label: "Margin", value: (s.marginPsi >= 0 ? "+" : "") + s.marginPsi.toFixed(1), unit: "psi", sub: s.passesSupply ? "supply adequate" : "supply short", tone: (s.marginPsi >= 0 ? "good" : "bad") as "good" | "bad" },
  ];

  const rows: [string, string, ("good" | "warn" | "bad")?][] = [
    ["System flow (design area)", `${Math.round(s.systemFlowGpm)} gpm`],
    ["Hose allowance", `${Math.round(s.hoseAllowanceGpm)} gpm`],
    ["Total demand", `${Math.round(s.totalDemandGpm)} gpm`],
    ["Required source pressure", `${s.sourcePressurePsi.toFixed(1)} psi`],
    ["Available at demand", `${s.availablePsi.toFixed(1)} psi`],
    ["Supply margin", `${s.marginPsi >= 0 ? "+" : ""}${s.marginPsi.toFixed(1)} psi`, s.passesSupply ? "good" : "bad"],
    ["Most-remote sprinkler", s.mostRemoteSprinkler ? `${s.mostRemoteSprinkler.id} — ${s.mostRemoteSprinkler.pressurePsi.toFixed(1)} psi, ${s.mostRemoteSprinkler.flowGpm.toFixed(1)} gpm` : "—"],
    ["Min head pressure required", `${s.minSprinklerPressurePsi.toFixed(1)} psi`, s.meetsMinPressure ? "good" : "bad"],
    ["Max junction imbalance", `${s.maxJunctionImbalanceGpm.toFixed(3)} gpm`, s.maxJunctionImbalanceGpm <= 0.5 ? "good" : "warn"],
    ["Solver converged", s.converged ? "yes" : "no", s.converged ? "good" : "bad"],
  ];

  return (
    <div style={page}>
      <div style={{ ...card, padding: "16px 18px", display: "flex", alignItems: "center", gap: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: C.primary }}>{model.meta.name}</div>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{model.meta.id} · {model.meta.standard ?? "NFPA 13"} · {String(model.meta.hazardClass ?? "").toUpperCase()} · {model.meta.units}</div>
        </div>
        <span style={{ flex: 1 }} />
        <div style={{ ...resultBadge, background: pass ? C.good : C.bad }}>{pass ? "PASS" : "REVIEW"}</div>
      </div>

      <div style={statGrid}>
        {cards.map((c) => (
          <div key={c.label} style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, color: C.muted, textTransform: "uppercase" }}>{c.label}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 5, marginTop: 8 }}>
              <span style={{ fontSize: 30, fontWeight: 800, color: toneColor(c.tone), lineHeight: 1 }}>{c.value}</span>
              <span style={{ fontSize: 13, color: C.muted, fontWeight: 600 }}>{c.unit}</span>
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 7 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      <div style={{ ...card, padding: 16, maxWidth: 640 }}>
        <div style={sectionTitle}>Design summary (NFPA 13 §27.4.5.2)</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {rows.map(([k, v, tone], i) => (
              <tr key={k} style={i % 2 ? { background: C.zebra } : undefined}>
                <td style={{ fontSize: 12.5, padding: "7px 8px", color: C.muted }}>{k}</td>
                <td style={{ fontSize: 13, padding: "7px 8px", textAlign: "right", fontWeight: 700, color: toneColor(tone) }}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Empty({ msg }: { msg: string }): JSX.Element {
  return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 14 }}>{msg}</div>;
}

const page: CSSProperties = { padding: 18, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const statGrid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 };
const resultBadge: CSSProperties = { color: "#fff", fontWeight: 800, fontSize: 15, letterSpacing: 1, padding: "8px 20px", borderRadius: 8 };
