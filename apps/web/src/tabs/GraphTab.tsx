/** Graph tab — supply vs. demand plot (§27.4.5.3) in-app: the water-supply curve,
 * the system demand point (required), and what the supply delivers at that flow. */
import { type CSSProperties } from "react";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle } from "../ui";

export function GraphTab({ solution, error }: { solution: ProjectSolution | null; error?: string }): JSX.Element {
  if (!solution) return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted }}>{error ? `Solve error: ${error}` : "No supply curve yet."}</div>;
  const s = solution.summary;
  const pts = s.supplyCurveSamples;
  const W = 900, H = 540, ml = 64, mr = 24, mt = 24, mb = 56;
  const maxQ = Math.max(s.totalDemandGpm * 1.15, ...pts.map((p) => p.flowGpm), 100);
  const maxP = Math.max(s.availablePsi, s.sourcePressurePsi, ...pts.map((p) => p.pressurePsi), 10) * 1.1;
  const X = (q: number) => ml + (q / maxQ) * (W - ml - mr);
  const Y = (p: number) => H - mb - (p / maxP) * (H - mt - mb);

  const supplyPath = pts.map((p, i) => `${i ? "L" : "M"}${X(p.flowGpm).toFixed(1)},${Y(p.pressurePsi).toFixed(1)}`).join(" ");
  const xTicks = ticks(maxQ, 6), yTicks = ticks(maxP, 6);
  const dx = X(s.totalDemandGpm), dyReq = Y(s.sourcePressurePsi), dyAvail = Y(s.availablePsi);

  return (
    <div style={page}>
      <div style={{ ...card, padding: 16 }}>
        <div style={sectionTitle}>Hydraulic supply / demand graph</div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: "62vh" }} fontFamily={FONT}>
          {/* grid */}
          {xTicks.map((q) => <line key={`gx${q}`} x1={X(q)} y1={mt} x2={X(q)} y2={H - mb} stroke={C.line} strokeWidth={1} />)}
          {yTicks.map((p) => <line key={`gy${p}`} x1={ml} y1={Y(p)} x2={W - mr} y2={Y(p)} stroke={C.line} strokeWidth={1} />)}
          {/* axes */}
          <line x1={ml} y1={mt} x2={ml} y2={H - mb} stroke={C.ink} strokeWidth={1.5} />
          <line x1={ml} y1={H - mb} x2={W - mr} y2={H - mb} stroke={C.ink} strokeWidth={1.5} />
          {xTicks.map((q) => <text key={`tx${q}`} x={X(q)} y={H - mb + 18} fontSize={12} fill={C.muted} textAnchor="middle">{Math.round(q)}</text>)}
          {yTicks.map((p) => <text key={`ty${p}`} x={ml - 8} y={Y(p) + 4} fontSize={12} fill={C.muted} textAnchor="end">{Math.round(p)}</text>)}
          <text x={(ml + W - mr) / 2} y={H - 14} fontSize={13} fill={C.ink} textAnchor="middle" fontWeight={600}>Flow (gpm)</text>
          <text x={16} y={(mt + H - mb) / 2} fontSize={13} fill={C.ink} textAnchor="middle" fontWeight={600} transform={`rotate(-90 16 ${(mt + H - mb) / 2})`}>Pressure (psi)</text>

          {/* supply curve */}
          <path d={supplyPath} fill="none" stroke={C.accent} strokeWidth={2.5} />
          {/* demand flow line */}
          <line x1={dx} y1={mt} x2={dx} y2={H - mb} stroke={C.muted} strokeWidth={1} strokeDasharray="5 4" />
          {/* points */}
          <circle cx={dx} cy={dyAvail} r={6} fill={C.good} stroke="#fff" strokeWidth={1.5} />
          <circle cx={dx} cy={dyReq} r={6} fill={s.passesSupply ? C.good : C.bad} stroke="#fff" strokeWidth={1.5} />
          <text x={dx + 10} y={dyReq + 4} fontSize={12} fill={C.ink} fontWeight={700}>required {s.sourcePressurePsi.toFixed(1)} psi</text>
          <text x={dx + 10} y={dyAvail - 8} fontSize={12} fill={C.good} fontWeight={700}>available {s.availablePsi.toFixed(1)} psi</text>
          <text x={dx} y={H - mb + 36} fontSize={11.5} fill={C.muted} textAnchor="middle">demand {Math.round(s.totalDemandGpm)} gpm</text>
        </svg>
        <div style={legend}>
          <Item color={C.accent} label="Water-supply curve (city ± pump)" />
          <Item color={C.good} label="Supply available at demand" />
          <Item color={s.passesSupply ? C.good : C.bad} label="System demand (required)" />
        </div>
      </div>
    </div>
  );
}

function ticks(max: number, n: number): number[] {
  const step = niceStep(max / n);
  const out: number[] = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}
function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return step * mag;
}
function Item({ color, label }: { color: string; label: string }): JSX.Element {
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink }}><span style={{ width: 16, height: 4, background: color, borderRadius: 2 }} />{label}</span>;
}

const page: CSSProperties = { padding: 18, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const legend: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 18, marginTop: 12 };
