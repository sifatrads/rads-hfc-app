/** Graph tab — two plots:
 *  1. Supply vs. demand (§27.4.5.3): the water-supply curve + system demand point.
 *  2. Fire-pump verification: datasheet curve + shop-test curve + the hydraulic
 *     operating point overlaid, so you can confirm all three agree.
 */
import { type CSSProperties } from "react";
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { C, FONT, card, sectionTitle } from "../ui";

interface Pt { x: number; y: number }
interface Series { label: string; color: string; pts: Pt[]; dashed?: boolean }
interface Marker { label: string; color: string; x: number; y: number; up?: boolean }

export function GraphTab({ model, solution, error }: { model: ProjectModel; solution: ProjectSolution | null; error?: string }): JSX.Element {
  if (!solution) return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted }}>{error ? `Solve error: ${error}` : "No supply curve yet."}</div>;
  const s = solution.summary;

  const supplySeries: Series[] = [{ label: "Water-supply curve (city ± pump)", color: C.accent, pts: s.supplyCurveSamples.map((p) => ({ x: p.flowGpm, y: p.pressurePsi })) }];
  const supplyMarkers: Marker[] = [
    { label: `available ${s.availablePsi.toFixed(1)} psi`, color: C.good, x: s.totalDemandGpm, y: s.availablePsi, up: true },
    { label: `required ${s.sourcePressurePsi.toFixed(1)} psi`, color: s.passesSupply ? C.good : C.bad, x: s.totalDemandGpm, y: s.sourcePressurePsi },
  ];

  const pump = model.network.pump;
  const dsCurve = datasheetCurve(pump);
  const shop = (pump?.shopTest ?? []).map((p) => ({ x: p.flowGpm, y: p.psi }));
  const pumpSeries: Series[] = [];
  if (dsCurve.length) pumpSeries.push({ label: "Datasheet (rated) curve", color: C.accent, pts: dsCurve });
  if (shop.length) pumpSeries.push({ label: "Shop-test curve", color: C.warn, pts: shop, dashed: true });
  const pumpMarkers: Marker[] = [{ label: `operating ${Math.round(s.totalDemandGpm)} gpm @ ${s.sourcePressurePsi.toFixed(1)} psi`, color: C.bad, x: s.totalDemandGpm, y: s.sourcePressurePsi }];

  return (
    <div style={page}>
      <div style={{ ...card, padding: 16 }}>
        <div style={sectionTitle}>Hydraulic supply / demand graph</div>
        <Chart series={supplySeries} markers={supplyMarkers} vline={s.totalDemandGpm} vlabel={`demand ${Math.round(s.totalDemandGpm)} gpm`} />
        <div style={legend}>
          <Item color={C.accent} label="Water-supply curve" />
          <Item color={C.good} label="Available at demand" />
          <Item color={s.passesSupply ? C.good : C.bad} label="System demand (required)" />
        </div>
      </div>

      <div style={{ ...card, padding: 16 }}>
        <div style={sectionTitle}>Fire-pump verification — datasheet · shop-test · hydraulic</div>
        {pumpSeries.length ? (
          <>
            <Chart series={pumpSeries} markers={pumpMarkers} vline={s.totalDemandGpm} vlabel={`demand ${Math.round(s.totalDemandGpm)} gpm`} />
            <div style={legend}>
              {dsCurve.length ? <Item color={C.accent} label="Datasheet (rated) curve" /> : null}
              {shop.length ? <Item color={C.warn} label="Shop-test curve" /> : null}
              <Item color={C.bad} label="Hydraulic operating point" />
            </div>
            <div style={{ fontSize: 11.5, color: C.muted, marginTop: 8 }}>Both curves should sit above the operating point and track each other (≈ within field-test tolerance). Add datasheet rated/churn/150% and shop-test points on the Project tab.</div>
          </>
        ) : (
          <div style={{ color: C.muted, fontSize: 13, padding: "10px 2px" }}>Add a fire pump (datasheet rated/churn/150% + shop-test points) on the Project tab to plot the verification curves.</div>
        )}
      </div>
    </div>
  );
}

/** Datasheet pump curve: explicit ratedCurve if given, else churn → rated → 150%. */
function datasheetCurve(pump: ProjectModel["network"]["pump"]): Pt[] {
  if (pump?.ratedCurve && pump.ratedCurve.length >= 2) return pump.ratedCurve.map((p) => ({ x: p.flowGpm, y: p.psi }));
  const d = pump?.datasheet;
  if (!d || typeof d.ratedFlowGpm !== "number") return [];
  const rf = d.ratedFlowGpm, rp = d.ratedPsi ?? 0;
  const churn = d.churnPsi ?? rp * 1.2;
  const of = d.overloadFlowGpm ?? rf * 1.5, op = d.overloadPsi ?? rp * 0.65;
  return [{ x: 0, y: churn }, { x: rf, y: rp }, { x: of, y: op }];
}

function Chart({ series, markers, vline, vlabel }: { series: Series[]; markers: Marker[]; vline?: number; vlabel?: string }): JSX.Element {
  const W = 900, H = 460, ml = 64, mr = 24, mt = 18, mb = 52;
  const all = [...series.flatMap((s) => s.pts), ...markers];
  const maxQ = Math.max(...all.map((p) => p.x), vline ?? 0, 100) * 1.08;
  const maxP = Math.max(...all.map((p) => p.y), 10) * 1.12;
  const X = (q: number) => ml + (q / maxQ) * (W - ml - mr);
  const Y = (p: number) => H - mb - (p / maxP) * (H - mt - mb);
  const xTicks = ticks(maxQ, 6), yTicks = ticks(maxP, 6);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", maxHeight: "48vh" }} fontFamily={FONT}>
      {xTicks.map((q) => <line key={`gx${q}`} x1={X(q)} y1={mt} x2={X(q)} y2={H - mb} stroke={C.line} strokeWidth={1} />)}
      {yTicks.map((p) => <line key={`gy${p}`} x1={ml} y1={Y(p)} x2={W - mr} y2={Y(p)} stroke={C.line} strokeWidth={1} />)}
      <line x1={ml} y1={mt} x2={ml} y2={H - mb} stroke={C.ink} strokeWidth={1.5} />
      <line x1={ml} y1={H - mb} x2={W - mr} y2={H - mb} stroke={C.ink} strokeWidth={1.5} />
      {xTicks.map((q) => <text key={`tx${q}`} x={X(q)} y={H - mb + 17} fontSize={12} fill={C.muted} textAnchor="middle">{Math.round(q)}</text>)}
      {yTicks.map((p) => <text key={`ty${p}`} x={ml - 8} y={Y(p) + 4} fontSize={12} fill={C.muted} textAnchor="end">{Math.round(p)}</text>)}
      <text x={(ml + W - mr) / 2} y={H - 12} fontSize={13} fill={C.ink} textAnchor="middle" fontWeight={600}>Flow (gpm)</text>
      <text x={16} y={(mt + H - mb) / 2} fontSize={13} fill={C.ink} textAnchor="middle" fontWeight={600} transform={`rotate(-90 16 ${(mt + H - mb) / 2})`}>Pressure (psi)</text>

      {vline !== undefined && <line x1={X(vline)} y1={mt} x2={X(vline)} y2={H - mb} stroke={C.muted} strokeWidth={1} strokeDasharray="5 4" />}
      {vline !== undefined && vlabel && <text x={X(vline)} y={H - mb + 34} fontSize={11.5} fill={C.muted} textAnchor="middle">{vlabel}</text>}

      {series.map((sr, i) => (
        <path key={i} d={sr.pts.map((p, j) => `${j ? "L" : "M"}${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ")} fill="none" stroke={sr.color} strokeWidth={2.5} strokeDasharray={sr.dashed ? "7 4" : undefined} />
      ))}
      {series.flatMap((sr, i) => sr.pts.map((p, j) => <circle key={`${i}-${j}`} cx={X(p.x)} cy={Y(p.y)} r={3} fill={sr.color} />))}
      {markers.map((m, i) => (
        <g key={`m${i}`}>
          <circle cx={X(m.x)} cy={Y(m.y)} r={6} fill={m.color} stroke="#fff" strokeWidth={1.5} />
          <text x={X(m.x) + 10} y={Y(m.y) + (m.up ? -8 : 4)} fontSize={12} fill={m.color} fontWeight={700}>{m.label}</text>
        </g>
      ))}
    </svg>
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
