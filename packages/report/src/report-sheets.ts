/**
 * NFPA 13 §27.4 report sheets as vector SVG (the @react-pdf primitive set; also
 * directly rasterizable / browser-printable). Each sheet maps to a clause:
 *   Summary §27.4.5.2 · Graph §27.4.5.3 · Supply Analysis §27.4.5.4 ·
 *   Node Analysis §27.4.5.5 · Detailed Worksheet / Pipe Information §27.4.5.6.
 */
import type { ProjectModel } from "@rads/model";
import { formatterFor } from "@rads/scene";
import type { ProjectSolution } from "@rads/solve";
import { getStandard, C_VALUE_MULTIPLIER, FITTING_EQUIV_LENGTH_FT, type StandardId } from "@rads/standards-engine";
import { mm } from "./paper";

const ATTRIBUTION = "© Sifat Sarower — RADS-HFC-APP";
const DISCLAIMER = "Calculation aid — all results must be reviewed and stamped by a licensed fire protection engineer and accepted by the AHJ.";
const esc = (s: string): string => String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
const f = (n: number): string => n.toFixed(1);

const A4 = { w: mm(210), h: mm(297) };
const M = mm(12);
const fontPx = mm(2.6);

export interface Sheet {
  title: string;
  svg: string;
}

function txt(x: number, y: number, s: string, size = fontPx, fill = "#10243e", weight = "400", anchor = "start"): string {
  return `<text x="${f(x)}" y="${f(y)}" font-size="${f(size)}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}">${esc(s)}</text>`;
}

function frame(model: ProjectModel, title: string, page: string): string {
  const y = A4.h - M;
  return (
    `<rect width="${f(A4.w)}" height="${f(A4.h)}" fill="#fff"/>` +
    `<rect x="${f(M)}" y="${f(M)}" width="${f(A4.w - 2 * M)}" height="${f(A4.h - 2 * M)}" fill="none" stroke="#9bb0c3" stroke-width="0.8"/>` +
    txt(M + mm(2), M + mm(6), title, mm(4.2), "#0b3d91", "700") +
    txt(A4.w - M - mm(2), M + mm(6), page, mm(3), "#607d8b", "400", "end") +
    txt(M + mm(2), M + mm(11), `${model.meta.name}  ·  ${model.meta.id}  ·  ${(model.meta.standard ?? model.meta.standardId ?? "").toString()}  ·  ${model.meta.units}`, mm(2.6), "#37474f") +
    `<line x1="${f(M)}" y1="${f(M + mm(13))}" x2="${f(A4.w - M)}" y2="${f(M + mm(13))}" stroke="#cfd8dc" stroke-width="0.6"/>` +
    txt(M + mm(2), y - mm(3.5), ATTRIBUTION, mm(2.3), "#546e7a", "600") +
    txt(M + mm(2), y - mm(1), DISCLAIMER, mm(2.0), "#78909c")
  );
}

function wrap(svg: string[], title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${f(A4.w)}" height="${f(A4.h)}" viewBox="0 0 ${f(A4.w)} ${f(A4.h)}" font-family="Helvetica, Arial, sans-serif">${svg.join("")}</svg>`;
}

interface Col {
  label: string;
  w: number; // mm
  align?: "start" | "end";
}

/** Paginated table sheet. Returns one SVG per page. */
function tableSheets(model: ProjectModel, title: string, cols: Col[], rows: string[][]): Sheet[] {
  const top = M + mm(17);
  const rowH = mm(5);
  const headH = mm(6);
  const bottom = A4.h - M - mm(8);
  const perPage = Math.max(1, Math.floor((bottom - top - headH) / rowH));
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const x0 = M + mm(2);
  const sheets: Sheet[] = [];

  for (let pg = 0; pg < pages; pg++) {
    const el: string[] = [frame(model, title, `Page ${pg + 1} / ${pages}`)];
    // header
    let cx = x0;
    let y = top;
    for (const c of cols) {
      el.push(txt(c.align === "end" ? cx + mm(c.w) : cx, y, c.label, mm(2.4), "#37474f", "700", c.align ?? "start"));
      cx += mm(c.w);
    }
    el.push(`<line x1="${f(x0)}" y1="${f(y + mm(1.5))}" x2="${f(cx)}" y2="${f(y + mm(1.5))}" stroke="#90a4ae" stroke-width="0.5"/>`);
    y += headH;
    for (const r of rows.slice(pg * perPage, (pg + 1) * perPage)) {
      cx = x0;
      r.forEach((cell, i) => {
        const c = cols[i]!;
        el.push(txt(c.align === "end" ? cx + mm(c.w) : cx, y, cell, mm(2.3), "#263238", "400", c.align ?? "start"));
        cx += mm(c.w);
      });
      el.push(`<line x1="${f(x0)}" y1="${f(y + mm(1.4))}" x2="${f(cx)}" y2="${f(y + mm(1.4))}" stroke="#eceff1" stroke-width="0.4"/>`);
      y += rowH;
    }
    sheets.push({ title: `${title}${pages > 1 ? ` (${pg + 1}/${pages})` : ""}`, svg: wrap(el, title) });
  }
  return sheets;
}

/** Key/value sheet (single page). */
function kvSheet(model: ProjectModel, title: string, sections: { heading: string; rows: [string, string][] }[]): Sheet {
  const el: string[] = [frame(model, title, "Page 1 / 1")];
  let y = M + mm(20);
  const xK = M + mm(3), xV = M + mm(75);
  for (const sec of sections) {
    el.push(txt(M + mm(2), y, sec.heading, mm(3), "#0b3d91", "700"));
    y += mm(6);
    for (const [k, v] of sec.rows) {
      el.push(txt(xK, y, k, mm(2.5), "#546e7a"));
      el.push(txt(xV, y, v, mm(2.6), "#10243e", "600"));
      y += mm(5);
    }
    y += mm(3);
  }
  return { title, svg: wrap(el, title) };
}

export function summarySheet(model: ProjectModel, sol: ProjectSolution): Sheet {
  const u = formatterFor(model.meta.units);
  const db = model.meta.units;
  const s = sol.summary;
  const dbasis = model.designBasis as Record<string, unknown> | undefined;
  const remote = s.mostRemoteSprinkler;
  return kvSheet(model, "Hydraulic Summary Sheet — NFPA 13 §27.4.5.2", [
    {
      heading: "Design basis",
      rows: [
        ["System type", String(model.meta.systemType ?? "—")],
        ["Hazard class", String(model.meta.hazardClass ?? "—")],
        ["Design density", dbasis?.["densityGpmFt2"] ? `${dbasis["densityGpmFt2"]} gpm/ft²` : "—"],
        ["Design area", dbasis?.["designAreaFt2"] ? `${dbasis["designAreaFt2"]} ft²` : "—"],
        ["Sprinkler K-factor", dbasis?.["sprinklerKFactor"] ? String(dbasis["sprinklerKFactor"]) : "—"],
        ["Min sprinkler pressure", u.pressure(s.minSprinklerPressurePsi)],
      ],
    },
    {
      heading: "Demand",
      rows: [
        ["System flow", u.flow(s.systemFlowGpm)],
        ["Hose allowance", u.flow(s.hoseAllowanceGpm)],
        ["Total demand", u.flow(s.totalDemandGpm)],
        ["Most-remote sprinkler", remote ? `${remote.id}: ${u.pressure(remote.pressurePsi)}, ${u.flow(remote.flowGpm)}` : "—"],
      ],
    },
    {
      heading: "Result",
      rows: [
        ["Required source pressure", u.pressure(s.sourcePressurePsi)],
        ["Available @ demand", u.pressure(s.availablePsi)],
        ["Supply margin", u.pressure(s.marginPsi)],
        ["Supply adequate", s.passesSupply ? "YES" : "NO ⚠"],
        ["Junction balance (max imbalance)", `${s.maxJunctionImbalanceGpm.toFixed(3)} gpm`],
        ["Solver converged", `${s.converged ? "yes" : "no"} · ${db}`],
      ],
    },
  ]);
}

export function supplyAnalysisSheet(model: ProjectModel, sol: ProjectSolution): Sheet {
  const u = formatterFor(model.meta.units);
  const s = sol.summary;
  const ft = (model.waterSupply as Record<string, unknown> | undefined)?.["flowTest"] as Record<string, unknown> | undefined;
  return kvSheet(model, "Water Supply Analysis — NFPA 13 §27.4.5.4", [
    {
      heading: "Flow test (source)",
      rows: [
        ["Source node", s.sourceId],
        ["Source elevation", u.len(s.sourceElevationFt)],
        ["Static pressure", u.pressure((ft?.["staticPsi"] as number) ?? NaN)],
        ["Residual pressure", u.pressure((ft?.["residualPsi"] as number) ?? NaN)],
        ["Test flow", u.flow((ft?.["testFlowGpm"] as number) ?? NaN)],
      ],
    },
    {
      heading: "Demand vs supply",
      rows: [
        ["Total demand", u.flow(s.totalDemandGpm)],
        ["Required source pressure", u.pressure(s.sourcePressurePsi)],
        ["Available @ demand", u.pressure(s.availablePsi)],
        ["Margin", u.pressure(s.marginPsi)],
        ["Supply adequate", s.passesSupply ? "YES" : "NO ⚠"],
      ],
    },
  ]);
}

export function nodeAnalysisSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  const u = formatterFor(model.meta.units);
  const cols: Col[] = [
    { label: "Node", w: 30 },
    { label: "Elev", w: 22, align: "end" },
    { label: "Type", w: 34 },
    { label: "Pt", w: 26, align: "end" },
    { label: "Pn", w: 26, align: "end" },
    { label: "Discharge", w: 30, align: "end" },
  ];
  const rows = model.network.nodes.map((n) => {
    const r = sol.results.nodes[n.id];
    return [n.id, u.len(n.elevationFt ?? 0), n.type, r?.totalPressurePsi !== undefined ? u.pressure(r.totalPressurePsi) : "—", r?.normalPressurePsi !== undefined ? u.pressure(r.normalPressurePsi) : "—", r?.dischargeGpm !== undefined ? u.flow(r.dischargeGpm) : ""];
  });
  return tableSheets(model, "Node Analysis — §27.4.5.5", cols, rows);
}

export function pipeWorksheetSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  const u = formatterFor(model.meta.units);
  const cols: Col[] = [
    { label: "Pipe", w: 18 },
    { label: "From→To", w: 30 },
    { label: "Size", w: 14 },
    { label: "C", w: 10, align: "end" },
    { label: "Len", w: 16, align: "end" },
    { label: "EqL", w: 14, align: "end" },
    { label: "Flow", w: 20, align: "end" },
    { label: "Vel", w: 16, align: "end" },
    { label: "Pf", w: 18, align: "end" },
    { label: "Pe", w: 18, align: "end" },
  ];
  const linkOf = (id: string) => sol.gga.links[id];
  const rows = model.network.pipes.map((p) => {
    const r = sol.results.pipes[p.id];
    const l = linkOf(p.id);
    return [
      p.id,
      `${p.from}→${p.to}`,
      String(p.nominalSize ?? "—"),
      String(p.cFactor ?? l?.cFactorUsed ?? "—"),
      (p.lengthFt ?? 0).toFixed(1),
      (l?.equivalentLengthFt ?? 0).toFixed(1),
      r?.flowGpm !== undefined ? u.flow(r.flowGpm) : "—",
      r?.velocityFps !== undefined ? u.velocity(r.velocityFps) : "—",
      r?.frictionLossPsi !== undefined ? u.pressure(r.frictionLossPsi) : "—",
      r?.elevationLossPsi !== undefined ? u.pressure(r.elevationLossPsi) : "—",
    ];
  });
  return tableSheets(model, "Detailed Worksheet — Pipe Information §27.4.5.6", cols, rows);
}

export function graphSheet(model: ProjectModel, sol: ProjectSolution): Sheet {
  const u = formatterFor(model.meta.units);
  const s = sol.summary;
  const el: string[] = [frame(model, "Graph Sheet — N^1.85 §27.4.5.3", "Page 1 / 1")];
  const gx = M + mm(18), gy = M + mm(22);
  const gw = A4.w - 2 * M - mm(24), gh = mm(150);
  const samples = s.supplyCurveSamples;
  const qmax = Math.max(s.totalDemandGpm * 1.2, ...samples.map((p) => p.flowGpm), 1);
  const pmax = Math.max(s.sourcePressurePsi * 1.2, ...samples.map((p) => p.pressurePsi), 1);
  const X = (q: number) => gx + (Math.pow(q, 1.85) / Math.pow(qmax, 1.85)) * gw; // Q^1.85 axis
  const Y = (p: number) => gy + gh - (p / pmax) * gh;

  // axes + grid (label actual Q at gridlines)
  el.push(`<rect x="${f(gx)}" y="${f(gy)}" width="${f(gw)}" height="${f(gh)}" fill="#fff" stroke="#90a4ae" stroke-width="0.6"/>`);
  for (let i = 1; i <= 5; i++) {
    const q = (qmax * i) / 5;
    const x = X(q);
    el.push(`<line x1="${f(x)}" y1="${f(gy)}" x2="${f(x)}" y2="${f(gy + gh)}" stroke="#eceff1" stroke-width="0.4"/>`);
    el.push(txt(x, gy + gh + mm(4), `${Math.round(q)}`, mm(2.2), "#607d8b", "400", "middle"));
    const p = (pmax * i) / 5;
    const y = Y(p);
    el.push(`<line x1="${f(gx)}" y1="${f(y)}" x2="${f(gx + gw)}" y2="${f(y)}" stroke="#eceff1" stroke-width="0.4"/>`);
    el.push(txt(gx - mm(2), y + mm(1), `${Math.round(p)}`, mm(2.2), "#607d8b", "400", "end"));
  }
  el.push(txt(gx + gw / 2, gy + gh + mm(9), `Flow (${u.flow(1).split(" ")[1] ?? "gpm"}) — N^1.85 scale`, mm(2.6), "#37474f", "600", "middle"));
  el.push(`<text x="${f(gx - mm(11))}" y="${f(gy + gh / 2)}" font-size="${f(mm(2.6))}" fill="#37474f" font-weight="600" text-anchor="middle" transform="rotate(-90 ${f(gx - mm(11))} ${f(gy + gh / 2)})">Pressure (${u.pressure(1).split(" ")[1] ?? "psi"})</text>`);

  // supply curve
  const path = samples.map((p, i) => `${i ? "L" : "M"}${f(X(p.flowGpm))},${f(Y(p.pressurePsi))}`).join(" ");
  el.push(`<path d="${path}" fill="none" stroke="#0b3d91" stroke-width="1.2"/>`);
  el.push(txt(X(samples[samples.length - 1]?.flowGpm ?? 0) - mm(2), Y(samples[samples.length - 1]?.pressurePsi ?? 0) - mm(2), "Supply", mm(2.4), "#0b3d91", "600", "end"));
  // demand point
  const dx = X(s.totalDemandGpm), dy = Y(s.sourcePressurePsi);
  el.push(`<circle cx="${f(dx)}" cy="${f(dy)}" r="${f(mm(1.6))}" fill="#e53935"/>`);
  el.push(txt(dx + mm(3), dy, `Demand ${u.flow(s.totalDemandGpm)} @ ${u.pressure(s.sourcePressurePsi)}`, mm(2.4), "#c62828", "600"));

  return { title: "Graph Sheet", svg: wrap(el, "Graph Sheet") };
}

/** Free-text sheet (formulas / procedure). */
function textSheet(model: ProjectModel, title: string, blocks: { heading: string; lines: string[] }[]): Sheet {
  const el: string[] = [frame(model, title, "Page 1 / 1")];
  let y = M + mm(20);
  for (const b of blocks) {
    el.push(txt(M + mm(2), y, b.heading, mm(3), "#0b3d91", "700"));
    y += mm(6);
    for (const line of b.lines) {
      el.push(txt(M + mm(4), y, line, mm(2.5), "#263238"));
      y += mm(5.2);
    }
    y += mm(3);
  }
  return { title, svg: wrap(el, title) };
}

export function formulasSheet(model: ProjectModel): Sheet {
  return textSheet(model, "Formulas & Calculation Procedure — NFPA 13 §27.2", [
    { heading: "Friction loss — Hazen-Williams (§27.2.2.1.1)", lines: ["p = 4.52 · Q^1.85 / (C^1.85 · d^4.87)    [psi per ft]", "P_friction = p × (pipe length + fitting equivalent length)"] },
    { heading: "Discharge — K-factor (§27.2.2.5)", lines: ["Q = K · √P     (P = pressure at the node)"] },
    { heading: "Velocity & normal pressure (§27.2.2.2–3)", lines: ["V = 0.4085 · Q / d²    [ft/s]", "P_v = 0.001123 · Q² / d⁴    [psi]", "P_n = P_t − P_v"] },
    { heading: "Elevation head (§27.2.2)", lines: ["ΔP = 0.433 psi/ft × Δelevation"] },
    { heading: "Equivalent length (§27.2.3)", lines: ["modifier = (actual ID / Sch-40 ID)^4.87  (§27.2.3.1.3.1)", "Table 27.2.3.1.1 is at C = 120; multiply by Table 27.2.3.2.1 factor for other C."] },
    { heading: "Procedure", lines: ["Density/area method · calculation begins at the hydraulically most-remote sprinkler.", "Each design-area sprinkler discharges ≥ density × coverage area.", "Pressures at hydraulic junction points balance within 0.5 psi (§27.2.2.4.1)."] },
  ]);
}

export function cValuesSheet(model: ProjectModel): Sheet {
  let cvals: Record<string, number> = {};
  try {
    cvals = getStandard((model.meta.standardId ?? "nfpa13") as StandardId).hazenWilliamsCValues?.() ?? {};
  } catch {
    /* standard not implemented */
  }
  const rows = Object.entries(cvals).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([m, c]) => [m, String(c)]);
  return tableSheets(model, "Hazen-Williams C Values — Table 27.2.4.8.1", [{ label: "Pipe / material", w: 100 }, { label: "C", w: 20, align: "end" }], rows)[0]!;
}

export function equivalentLengthSheet(model: ProjectModel): Sheet {
  const el: string[] = [frame(model, "Equivalent Pipe Lengths & C-Multiplier — §27.2.3", "Page 1 / 1")];
  let y = M + mm(20);
  el.push(txt(M + mm(2), y, "C-value multiplier (Table 27.2.3.2.1)", mm(3), "#0b3d91", "700"));
  y += mm(6);
  for (const [c, mul] of Object.entries(C_VALUE_MULTIPLIER)) {
    el.push(txt(M + mm(4), y, `C = ${c}`, mm(2.5)));
    el.push(txt(M + mm(36), y, `× ${mul}`, mm(2.5), "#10243e", "600"));
    y += mm(5);
  }
  y += mm(5);
  el.push(txt(M + mm(2), y, "Equivalent Sch-40 length, ft (Table 27.2.3.1.1, C = 120)", mm(3), "#0b3d91", "700"));
  y += mm(6);
  const sizes = ["1", "1-1/2", "2", "2-1/2", "4", "6"];
  el.push(txt(M + mm(4), y, "Fitting / valve", mm(2.3), "#37474f", "700"));
  sizes.forEach((s, i) => el.push(txt(M + mm(60) + i * mm(20), y, `${s}"`, mm(2.3), "#37474f", "700", "end")));
  y += mm(5);
  for (const [fit, row] of Object.entries(FITTING_EQUIV_LENGTH_FT)) {
    el.push(txt(M + mm(4), y, fit, mm(2.3)));
    sizes.forEach((s, i) => el.push(txt(M + mm(60) + i * mm(20), y, row[s] !== undefined ? String(row[s]) : "—", mm(2.3), "#263238", "400", "end")));
    y += mm(4.6);
  }
  el.push(txt(M + mm(4), y + mm(2), "Reference table — audit against the printed NFPA 13 before production use.", mm(2), "#78909c"));
  return { title: "Equivalent Lengths & C-Multiplier", svg: wrap(el, "Equivalent Lengths") };
}

export function junctionBalancingSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  const rows = Object.entries(sol.gga.nodeImbalanceGpm)
    .map(([id, v]) => [id, v.toFixed(4)] as [string, string])
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])));
  return tableSheets(
    model,
    `Hydraulic Junction Points — balance ≤ 0.5 psi (§27.2.2.4.1) · max imbalance ${sol.summary.maxJunctionImbalanceGpm.toFixed(4)} gpm`,
    [{ label: "Junction node", w: 70 }, { label: "Flow imbalance (gpm)", w: 50, align: "end" }],
    rows,
  );
}

export function pumpSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  const ws = model.waterSupply as Record<string, unknown> | undefined;
  const fp = ws?.["firePump"] as Record<string, unknown> | undefined;
  const pump = model.network.pump;
  if (!fp && !pump) return [];
  const u = formatterFor(model.meta.units);
  const ds = pump?.datasheet ?? {};
  const ratedFlow = ds.ratedFlowGpm ?? (fp?.["ratedFlowGpm"] as number | undefined);
  const ratedPsi = ds.ratedPsi ?? (fp?.["ratedPsi"] as number | undefined);
  const churn = ds.churnPsi ?? (fp?.["churnPsi"] as number | undefined);
  const overFlow = ds.overloadFlowGpm ?? (fp?.["overloadFlowGpm"] as number | undefined);
  const overPsi = ds.overloadPsi ?? (fp?.["overloadPsi"] as number | undefined);
  const s = sol.summary;
  const sheets: Sheet[] = [];

  sheets.push(
    kvSheet(model, "Fire Pump — Datasheet", [
      {
        heading: "Nameplate / listing",
        rows: [
          ["Make", String(ds.make ?? "—")],
          ["Model", String(ds.model ?? "—")],
          ["Type", String(ds.type ?? "—")],
          ["Listed", String(ds.listed ?? fp?.["listed"] ?? "—")],
          ["Rated flow", ratedFlow !== undefined ? u.flow(ratedFlow) : "—"],
          ["Rated pressure", ratedPsi !== undefined ? u.pressure(ratedPsi) : "—"],
          ["Churn (shutoff)", churn !== undefined ? u.pressure(churn) : "—"],
          ["150% overload", overFlow !== undefined ? `${u.flow(overFlow)} @ ${u.pressure(overPsi ?? NaN)}` : "—"],
          ["RPM", ds.rpm !== undefined ? String(ds.rpm) : "—"],
          ["Impeller", ds.impellerIn !== undefined ? `${ds.impellerIn} in` : "—"],
          ["Motor", ds.motorHp !== undefined ? `${ds.motorHp} hp` : "—"],
        ],
      },
    ]),
  );
  sheets.push(
    kvSheet(model, "Fire Pump — Hydraulic Calculation", [
      { heading: "Performance points (NFPA 20)", rows: [["Churn @ 0 gpm", churn !== undefined ? u.pressure(churn) : "—"], ["Rated point", ratedFlow !== undefined ? `${u.flow(ratedFlow)} @ ${u.pressure(ratedPsi ?? NaN)}` : "—"], ["150% point", overFlow !== undefined ? `${u.flow(overFlow)} @ ${u.pressure(overPsi ?? NaN)}` : "—"]] },
      { heading: "System operating point", rows: [["System demand", u.flow(s.totalDemandGpm)], ["Required source pressure", u.pressure(s.sourcePressurePsi)], ["Available @ demand (with pump)", u.pressure(s.availablePsi)], ["Margin", u.pressure(s.marginPsi)], ["Adequate", s.passesSupply ? "YES" : "NO ⚠"]] },
    ]),
  );
  const st = pump?.shopTest ?? [];
  if (st.length) {
    sheets.push(tableSheets(model, "Fire Pump — Shop Test Data", [{ label: "Flow", w: 30, align: "end" }, { label: "Pressure", w: 30, align: "end" }, { label: "RPM", w: 30, align: "end" }], st.map((p) => [u.flow(p.flowGpm), u.pressure(p.psi), p.rpm !== undefined ? String(p.rpm) : "—"]))[0]!);
  } else {
    sheets.push(kvSheet(model, "Fire Pump — Shop Test Data", [{ heading: "Field / acceptance test", rows: [["Shop-test curve", "not provided — attach witnessed test results"]] }]));
  }
  return sheets;
}

/** The full ordered report set for a solved project (NFPA 13 §27.4 + references). */
export function reportSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  return [
    summarySheet(model, sol),
    graphSheet(model, sol),
    supplyAnalysisSheet(model, sol),
    ...nodeAnalysisSheets(model, sol),
    ...pipeWorksheetSheets(model, sol),
    ...junctionBalancingSheets(model, sol),
    formulasSheet(model),
    cValuesSheet(model),
    equivalentLengthSheet(model),
    ...pumpSheets(model, sol),
  ];
}
