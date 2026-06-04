/** Summary tab — the NFPA §27.4.5.2 summary in-app: result stat cards + the key
 * design/demand/supply figures, live from the solve. */
import type { CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle, toneColor } from "../ui";
import { units } from "../units";

export function SummaryTab({ model, solution, error }: { model: ProjectModel; solution: ProjectSolution | null; error?: string }): JSX.Element {
  if (!solution) return <Empty msg={error ? `Solve error: ${error}` : "Add nodes, pipes and a water supply to see results."} />;
  const s = solution.summary;
  const u = units(model);
  const pass = s.passesSupply && s.meetsMinPressure;
  const cards = [
    { label: "Required pressure", value: u.p(s.sourcePressurePsi), unit: u.U.p, sub: `at source (node ${s.sourceId})`, tone: undefined },
    { label: "Total demand", value: u.q(s.totalDemandGpm, 0), unit: u.U.q, sub: `${u.q(s.systemFlowGpm, 0)} system + ${u.q(s.hoseAllowanceGpm, 0)} hose`, tone: undefined },
    { label: "Supply available", value: u.p(s.availablePsi), unit: u.U.p, sub: `@ ${u.q(s.totalDemandGpm, 0)} ${u.U.q}`, tone: undefined },
    { label: "Margin", value: (s.marginPsi >= 0 ? "+" : "") + u.p(s.marginPsi), unit: u.U.p, sub: s.passesSupply ? "supply adequate" : "supply short", tone: (s.marginPsi >= 0 ? "good" : "bad") as "good" | "bad" },
  ];

  const rows: [string, string, ("good" | "warn" | "bad")?][] = [
    ["System flow (design area)", u.qU(s.systemFlowGpm, 0)],
    ["Operating heads (design area)", `${s.operatingHeads}${s.designAreaFt2 ? ` over ${u.areaU(s.designAreaFt2)}` : ""}`],
    ...(s.requiredHeadFlowGpm !== undefined ? [["Required flow per head (density)", u.qU(s.requiredHeadFlowGpm)]] as [string, string][] : []),
    ["Hose allowance", u.qU(s.hoseAllowanceGpm, 0)],
    ["Total demand", u.qU(s.totalDemandGpm, 0)],
    ["Required source pressure", u.pU(s.sourcePressurePsi)],
    ["Available at demand", u.pU(s.availablePsi)],
    ["Supply margin", `${s.marginPsi >= 0 ? "+" : ""}${u.pU(s.marginPsi)}`, s.passesSupply ? "good" : "bad"],
    ...(s.requiredStoredGal !== undefined ? [["Required stored water", `${u.galU(s.requiredStoredGal)} @ ${s.durationMin} min${model.network.reservoir?.capacityGal ? ` (tank ${u.galU(model.network.reservoir.capacityGal)})` : ""}`, model.network.reservoir?.capacityGal ? (model.network.reservoir.capacityGal >= s.requiredStoredGal ? "good" : "bad") : undefined]] as [string, string, ("good" | "warn" | "bad")?][] : []),
    ["Most-remote sprinkler", s.mostRemoteSprinkler ? `${s.mostRemoteSprinkler.id} — ${u.pU(s.mostRemoteSprinkler.pressurePsi)}, ${u.qU(s.mostRemoteSprinkler.flowGpm)}` : "—"],
    ["Min head pressure required", u.pU(s.minSprinklerPressurePsi), s.meetsMinPressure ? "good" : "bad"],
    ["Heads below minimum", s.lowPressureNodes.length ? `${s.lowPressureNodes.length} (${s.lowPressureNodes.slice(0, 3).map((n) => n.id).join(", ")}${s.lowPressureNodes.length > 3 ? "…" : ""})` : "none", s.lowPressureNodes.length ? "bad" : "good"],
    ...(s.suctionCheck ? [[`Pump suction velocity @ 150% (NFPA 20 ≤ ${u.v(15)} ${u.U.v})`, u.vU(s.suctionCheck.velocityFps), s.suctionCheck.ok ? "good" : "bad"]] as [string, string, ("good" | "warn" | "bad")?][] : []),
    ["Max junction imbalance", `${u.q(s.maxJunctionImbalanceGpm, 3)} ${u.U.q}`, s.maxJunctionImbalanceGpm <= 0.5 ? "good" : "warn"],
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
