/** Summary tab — the NFPA §27.4.5.2 summary in-app: result stat cards + the key
 * design/demand/supply figures, live from the solve. */
import { useState, type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle, toneColor } from "../ui";
import { units } from "../units";
import { compareDesignAreas, type AreaResult } from "../design-areas";
import { checkCoverageSpacing, type CoverageReport } from "../coverage-check";

export function SummaryTab({ model, solution, error, onChange }: { model: ProjectModel; solution: ProjectSolution | null; error?: string; onChange?: (model: ProjectModel) => void }): JSX.Element {
  const [areas, setAreas] = useState<AreaResult[] | null>(null);
  const [cov, setCov] = useState<CoverageReport | null>(null);
  if (!solution) return <Empty msg={error ? `Solve error: ${error}` : "Add nodes, pipes and a water supply to see results."} />;
  const s = solution.summary;
  const u = units(model);
  const lockArea = (ids: string[] | undefined) => onChange?.({ ...model, designBasis: { ...(model.designBasis ?? {}), ...(ids ? { designAreaNodeIds: ids } : { designAreaNodeIds: undefined }) } } as ProjectModel);
  const locked = Array.isArray((model.designBasis as Record<string, unknown> | undefined)?.["designAreaNodeIds"]) && ((model.designBasis as Record<string, unknown>)["designAreaNodeIds"] as unknown[]).length > 0;
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

      <div style={{ ...card, padding: 16, maxWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={sectionTitle}>Design-area proof (most demanding remote area)</div>
          <span style={{ flex: 1 }} />
          <button style={areaBtn} onClick={() => setAreas(compareDesignAreas(model))}>⟳ Compare remote areas</button>
        </div>
        {onChange && (
          <div style={{ fontSize: 11.5, marginTop: 6, display: "flex", alignItems: "center", gap: 8, color: locked ? C.bad : C.muted }}>
            <span style={{ fontWeight: locked ? 700 : 400 }}>{locked ? `● Design area: MANUAL (locked) — ${s.operatingHeads} heads` : "Design area: auto (most demanding remote area)"}</span>
            {locked && <button style={clearBtn} onClick={() => lockArea(undefined)}>Clear → auto</button>}
          </div>
        )}
        {areas === null ? (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>NFPA 13 governs on the most hydraulically demanding area. Solve several candidate remote areas (clustered around the farthest heads), confirm the auto-picked one is the worst case — or lock a specific area (e.g. AHJ-directed).</div>
        ) : areas.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>Only one possible design area (operating heads ≥ total heads) — nothing to compare.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead><tr>{["Remote area", "Heads", `Required (${u.U.p})`, `Margin (${u.U.p})`, "", ""].map((h, hi) => <th key={hi} style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textAlign: "left", padding: "4px 8px", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {areas.map((a, i) => (
                <tr key={a.anchor} style={i === 0 ? { background: "#fff7ed" } : i % 2 ? { background: C.zebra } : undefined}>
                  <td style={{ fontSize: 12.5, padding: "6px 8px", fontWeight: i === 0 ? 800 : 500, color: i === 0 ? C.bad : C.ink }}>{a.label}{i === 0 ? " · governing" : ""}</td>
                  <td style={{ fontSize: 12.5, padding: "6px 8px" }}>{a.heads}</td>
                  <td style={{ fontSize: 12.5, padding: "6px 8px", fontWeight: 700 }}>{u.p(a.sourcePressurePsi)}</td>
                  <td style={{ fontSize: 12.5, padding: "6px 8px", color: toneColor(a.marginPsi >= 0 ? "good" : "bad") }}>{a.marginPsi >= 0 ? "+" : ""}{u.p(a.marginPsi)}</td>
                  <td style={{ fontSize: 12.5, padding: "6px 8px", fontWeight: 700, color: toneColor(a.passes ? "good" : "bad") }}>{a.passes ? "PASS" : "REVIEW"}</td>
                  <td style={{ padding: "4px 8px" }}>{onChange && <button style={lockBtn} onClick={() => lockArea(a.nodeIds)} title="Use this as the locked design area">Lock</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div style={{ ...card, padding: 16, maxWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={sectionTitle}>Coverage &amp; spacing (NFPA 13)</div>
          <span style={{ flex: 1 }} />
          <button style={areaBtn} onClick={() => setCov(checkCoverageSpacing(model))}>⟳ Check coverage</button>
        </div>
        {cov === null ? (
          <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>Verify each sprinkler's protection area and along-branch spacing against the NFPA 13 maximums for the hazard.</div>
        ) : cov.heads.length === 0 ? (
          <div style={{ fontSize: 12.5, color: C.muted, marginTop: 8 }}>No sprinklers to check.</div>
        ) : (
          <>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 6 }}>{cov.hazard.toUpperCase()} limits: ≤ {u.area(cov.maxAreaFt2)} {u.U.area}/head · spacing ≤ {u.l(cov.maxSpacingFt)} {u.U.l}. {cov.overCoverage + cov.overSpacing === 0 ? "All heads within limits." : `${cov.overCoverage} over-area · ${cov.overSpacing} over-spacing.`}</div>
            <div style={{ fontSize: 12, marginTop: 4, color: cov.buildingCoverageOk === false ? C.bad : C.muted }}>
              {cov.heads.length} heads cover {u.area(cov.totalCoverageFt2)} {u.U.area}{cov.protectedAreaFt2 !== undefined ? ` of ${u.area(cov.protectedAreaFt2)} ${u.U.area} protected — ${cov.buildingCoverageOk ? "adequate" : "SHORT, add heads"}` : ` (set a protected area on the Project tab to check building coverage)`}.
            </div>
            {(cov.overCoverage + cov.overSpacing) > 0 && (
              <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
                <thead><tr>{["Head", `Coverage (${u.U.area})`, `Spacing (${u.U.l})`, "Issue"].map((h) => <th key={h} style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, textAlign: "left", padding: "4px 8px", textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
                <tbody>
                  {cov.heads.filter((h) => h.overCoverage || h.overSpacing).map((h, i) => (
                    <tr key={h.id} style={i % 2 ? { background: C.zebra } : undefined}>
                      <td style={{ fontSize: 12.5, padding: "6px 8px", fontWeight: 700, color: C.primary }}>{h.id}</td>
                      <td style={{ fontSize: 12.5, padding: "6px 8px", color: toneColor(h.overCoverage ? "bad" : undefined), fontWeight: h.overCoverage ? 700 : 400 }}>{u.area(h.coverageFt2)}</td>
                      <td style={{ fontSize: 12.5, padding: "6px 8px", color: toneColor(h.overSpacing ? "bad" : undefined), fontWeight: h.overSpacing ? 700 : 400 }}>{u.l(h.spacingFt)}</td>
                      <td style={{ fontSize: 12, padding: "6px 8px", color: C.bad }}>{[h.overCoverage ? "area" : "", h.overSpacing ? "spacing" : ""].filter(Boolean).join(" + ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
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
const areaBtn: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#fff", background: C.accent, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" };
const lockBtn: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.accent, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 6, padding: "3px 9px", cursor: "pointer" };
const clearBtn: CSSProperties = { fontSize: 11, fontWeight: 700, color: "#fff", background: C.bad, border: "none", borderRadius: 6, padding: "3px 9px", cursor: "pointer" };
