/**
 * NFPA 13 §27.4 report sheets — A4 portrait vector SVG using the shared report
 * theme (branded header band + metadata strip + footer + page numbers, stat
 * cards, zebra tables with units in the header). Maps to:
 *   Cover · Summary §27.4.5.2 · Graph §27.4.5.3 · Supply §27.4.5.4 ·
 *   Node §27.4.5.5 · Detailed Worksheet §27.4.5.6 · references · pump sheets.
 */
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { getStandard, C_VALUE_MULTIPLIER, FITTING_EQUIV_LENGTH_FT, pipeMaterial, type StandardId } from "@rads/standards-engine";
import { mm } from "./paper";
import { C, T, rect, line, frame, statCards, sectionTitle, table, INNER, CONTENT_TOP, CONTENT_BOTTOM, ROWS_PER_PAGE, PAGE, type Column, type SheetMeta } from "./report-theme";

export interface Sheet {
  title: string;
  svg: string;
}

interface Spec {
  title: string;
  inner: string;
}

// ── unit-aware numeric formatting (value only; unit goes in the column header) ──
function units(model: ProjectModel) {
  const metric = model.meta.units === "metric";
  const k = { p: metric ? 0.0689476 : 1, q: metric ? 3.785412 : 1, l: metric ? 0.3048 : 1, v: metric ? 0.3048 : 1 };
  const U = { p: metric ? "bar" : "psi", q: metric ? "L/min" : "gpm", l: metric ? "m" : "ft", v: metric ? "m/s" : "ft/s" };
  const fmt = (val: number | undefined, factor: number, d: number) => (val === undefined || !Number.isFinite(val) ? "—" : (val * factor).toFixed(d));
  return {
    U,
    p: (v?: number, d = metric ? 2 : 1) => fmt(v, k.p, d),
    q: (v?: number, d = metric ? 0 : 1) => fmt(v, k.q, d),
    l: (v?: number, d = 1) => fmt(v, k.l, d),
    v: (v?: number, d = 1) => fmt(v, k.v, d),
    pU: (v?: number, d?: number) => `${fmt(v, k.p, d ?? (metric ? 2 : 1))} ${U.p}`,
    qU: (v?: number, d?: number) => `${fmt(v, k.q, d ?? (metric ? 0 : 1))} ${U.q}`,
  };
}

const num = (o: unknown, key: string): number | undefined => {
  const v = (o as Record<string, unknown> | undefined)?.[key];
  return typeof v === "number" ? v : undefined;
};

/** A boxed key/value section. */
function infoBox(x: number, y: number, w: number, title: string, rows: [string, string][], rowH = mm(6)): { svg: string; endY: number } {
  const head = mm(8.5);
  const h = head + rows.length * rowH + mm(2);
  const el: string[] = [rect(x, y, w, h, { fill: "#fbfdff", stroke: C.line, sw: 0.7, rx: mm(1.4) })];
  el.push(rect(x, y, w, head, { fill: C.band, rx: mm(1.4) }));
  el.push(rect(x, y + head - mm(1.4), w, mm(1.4), { fill: C.band }));
  el.push(T(x + mm(3), y + mm(5.6), title, { size: mm(2.9), fill: C.primary, weight: "700" }));
  let ry = y + head + mm(4);
  rows.forEach(([k, v]) => {
    el.push(T(x + mm(3), ry, k, { size: mm(2.4), fill: C.muted }));
    el.push(T(x + w - mm(3), ry, v, { size: mm(2.5), fill: C.ink, weight: "600", anchor: "end" }));
    ry += rowH;
  });
  return { svg: el.join(""), endY: y + h };
}

// ── cover ──
function coverSpec(model: ProjectModel, sol: ProjectSolution): Spec {
  const u = units(model);
  const s = sol.summary;
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(6);
  const el: string[] = [];
  el.push(T(x, y, "HYDRAULIC CALCULATION REPORT", { size: mm(3.2), fill: C.accent, weight: "700" }));
  y += mm(11);
  el.push(T(x, y, model.meta.name, { size: mm(7.5), fill: C.ink, weight: "800" }));
  y += mm(6);
  el.push(T(x, y, `${model.meta.standard ?? model.meta.standardId ?? ""} · ${model.meta.hazardClass ?? model.meta.systemType ?? ""}`, { size: mm(3), fill: C.muted }));
  y += mm(10);
  const pass = s.passesSupply && s.meetsMinPressure;
  el.push(
    statCards(x, y, w, [
      { label: "Required pressure", value: u.p(s.sourcePressurePsi), sub: `at source (${u.U.p})` },
      { label: "Total demand", value: u.q(s.totalDemandGpm), sub: `incl. hose (${u.U.q})` },
      { label: "Supply margin", value: u.p(s.marginPsi), sub: u.U.p, tone: s.passesSupply ? C.good : C.bad },
      { label: "Result", value: pass ? "PASS" : "REVIEW", sub: pass ? "supply adequate" : "check supply", tone: pass ? C.good : C.warn },
    ]),
  );
  y += mm(28);
  const db = model.designBasis as Record<string, unknown> | undefined;
  const remote = s.mostRemoteSprinkler;
  const a = infoBox(x, y, (w - mm(6)) / 2, "Design basis", [
    ["Method", String(db?.["method"] ?? "density/area")],
    ["Density", db?.["densityGpmFt2"] ? `${db["densityGpmFt2"]} gpm/ft²` : "—"],
    ["Design area", db?.["designAreaFt2"] ? `${db["designAreaFt2"]} ft²` : "—"],
    ["K-factor", db?.["sprinklerKFactor"] ? String(db["sprinklerKFactor"]) : "—"],
    ["Operating sprinklers", db?.["operatingSprinklers"] ? String(db["operatingSprinklers"]) : "—"],
    ["Min sprinkler pressure", u.pU(s.minSprinklerPressurePsi)],
  ]);
  const b = infoBox(x + (w + mm(6)) / 2, y, (w - mm(6)) / 2, "Result", [
    ["Most-remote head", remote ? `${remote.id}` : "—"],
    ["  pressure / flow", remote ? `${u.pU(remote.pressurePsi)} · ${u.qU(remote.flowGpm)}` : "—"],
    ["System flow", u.qU(s.systemFlowGpm)],
    ["Available @ demand", u.pU(s.availablePsi)],
    ["Supply adequate", s.passesSupply ? "YES" : "NO"],
    ["Solver converged", s.converged ? "yes" : "no"],
  ]);
  el.push(a.svg, b.svg);
  return { title: "Cover", inner: el.join("") };
}

// ── riser hydraulic nameplate (NFPA 13 §27.5) ──
function riserNameplateSpec(model: ProjectModel, sol: ProjectSolution): Spec {
  const u = units(model);
  const s = sol.summary;
  const m = model.meta;
  const db = model.designBasis as Record<string, unknown> | undefined;
  const ws = model.waterSupply as Record<string, unknown> | undefined;
  const ft = ws?.["flowTest"] as Record<string, unknown> | undefined;
  const { x, w } = INNER;
  const half = (w - mm(6)) / 2;
  const rx = x + (w + mm(6)) / 2;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Riser Hydraulic Nameplate")];
  y += mm(8);

  const sys = infoBox(x, y, half, "System", [
    ["Project", String(m.name)],
    ["Location", String(m.address ?? "—")],
    ["Standard", String(m.standard ?? m.standardId ?? "—")],
    ["Occupancy / hazard", String(m.hazardClass ?? "—").toUpperCase()],
    ["System type", `${m.systemType ?? "sprinkler"} · ${m.fillType ?? "wet"}`],
    ["Drawing / date", `${m.drawingNo ?? "—"} · ${m.date ?? "—"}`],
  ]);
  const demand = infoBox(x, sys.endY + mm(4), half, "Demand at base of riser", [
    ["Operating heads", `${s.operatingHeads}${s.designAreaFt2 ? ` / ${s.designAreaFt2} ft²` : ""}`],
    ["Density flow / head", s.requiredHeadFlowGpm !== undefined ? u.qU(s.requiredHeadFlowGpm) : "—"],
    ["System (sprinkler) flow", u.qU(s.systemFlowGpm)],
    ["Hose allowance", u.qU(s.hoseAllowanceGpm)],
    ["Total demand", u.qU(s.totalDemandGpm)],
    ["Required pressure", u.pU(s.sourcePressurePsi)],
  ]);
  const supply = infoBox(x, demand.endY + mm(4), half, "Water supply", [
    ["Static", u.pU(num(ft, "staticPsi"))],
    ["Residual", u.pU(num(ft, "residualPsi"))],
    ["@ test flow", u.qU(num(ft, "testFlowGpm"))],
    ["Available @ demand", u.pU(s.availablePsi)],
    ["Safety margin", u.pU(s.marginPsi)],
    ["Supply adequate", s.passesSupply ? "YES" : "NO"],
  ]);
  const basis = infoBox(rx, y, half, "Design basis", [
    ["Method", String(db?.["method"] ?? "density/area")],
    ["Density", db?.["densityGpmFt2"] ? `${db["densityGpmFt2"]} gpm/ft²` : "—"],
    ["Design area", db?.["designAreaFt2"] ? `${db["designAreaFt2"]} ft²` : "—"],
    ["Sprinkler K-factor", db?.["sprinklerKFactor"] ? String(db["sprinklerKFactor"]) : "—"],
    ["Operating sprinklers", db?.["operatingSprinklers"] ? `${db["operatingSprinklers"]} (set)` : `${s.operatingHeads} (auto-peak)`],
    ["Min sprinkler pressure", u.pU(s.minSprinklerPressurePsi)],
  ]);
  const prepared = infoBox(rx, basis.endY + mm(4), half, "Prepared by", [
    ["Engineer", String(m.engineer ?? "—")],
    ["Designer", String(m.designer ?? "—")],
    ["Company", String(m.company ?? "—")],
    ["Contractor", String(m.contractor ?? "—")],
    ["Client", String(m.client ?? "—")],
    ["Date", String(m.date ?? "—")],
  ]);
  el.push(sys.svg, demand.svg, supply.svg, basis.svg, prepared.svg);

  const pass = s.passesSupply && s.meetsMinPressure;
  const by = Math.max(supply.endY, prepared.endY) + mm(6);
  el.push(rect(x, by, w, mm(12), { fill: pass ? "#ecfdf5" : "#fff7ed", stroke: pass ? C.good : C.warn, sw: 1, rx: mm(1.4) }));
  el.push(T(x + mm(4), by + mm(7.5), pass ? "HYDRAULICALLY ADEQUATE — supply meets demand with margin" : "REVIEW — supply / pressure check required", { size: mm(3.2), fill: pass ? C.good : C.warn, weight: "700" }));
  return { title: "Riser Nameplate", inner: el.join("") };
}

// ── summary ──
function summarySpec(model: ProjectModel, sol: ProjectSolution): Spec {
  const u = units(model);
  const s = sol.summary;
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [];
  el.push(sectionTitle(x, y, w, "Hydraulic Summary — NFPA 13 §27.4.5.2"));
  y += mm(8);
  const pass = s.passesSupply && s.meetsMinPressure;
  el.push(
    statCards(x, y, w, [
      { label: "Required pressure", value: u.p(s.sourcePressurePsi), sub: u.U.p },
      { label: "Total demand", value: u.q(s.totalDemandGpm), sub: u.U.q },
      { label: "Supply margin", value: u.p(s.marginPsi), sub: u.U.p, tone: s.passesSupply ? C.good : C.bad },
      { label: "Result", value: pass ? "PASS" : "REVIEW", tone: pass ? C.good : C.warn },
    ]),
  );
  y += mm(27);
  const db = model.designBasis as Record<string, unknown> | undefined;
  const remote = s.mostRemoteSprinkler;
  const half = (w - mm(6)) / 2;
  const left = infoBox(x, y, half, "Demand", [
    ["System flow", u.qU(s.systemFlowGpm)],
    ["Hose allowance", u.qU(s.hoseAllowanceGpm)],
    ["Total demand", u.qU(s.totalDemandGpm)],
    ["Most-remote sprinkler", remote ? `${remote.id}` : "—"],
    ["  pressure / flow", remote ? `${u.pU(remote.pressurePsi)} · ${u.qU(remote.flowGpm)}` : "—"],
  ]);
  const right = infoBox(x + (w + mm(6)) / 2, y, half, "Supply & balance", [
    ["Required source pressure", u.pU(s.sourcePressurePsi)],
    ["Available @ demand", u.pU(s.availablePsi)],
    ["Supply margin", u.pU(s.marginPsi)],
    ["Supply adequate", s.passesSupply ? "YES" : "NO"],
    ["Max junction imbalance", `${s.maxJunctionImbalanceGpm.toFixed(3)} gpm`],
  ]);
  el.push(left.svg, right.svg);
  y = Math.max(left.endY, right.endY) + mm(8);
  const box = infoBox(x, y, w, "Basis", [
    ["Standard", String(model.meta.standard ?? model.meta.standardId ?? "—")],
    ["Hazard class", String(model.meta.hazardClass ?? "—")],
    ["Density × area", `${db?.["densityGpmFt2"] ?? "—"} gpm/ft² × ${db?.["designAreaFt2"] ?? "—"} ft²`],
    ["K-factor", String(db?.["sprinklerKFactor"] ?? "—")],
  ]);
  el.push(box.svg);
  return { title: "Summary Sheet", inner: el.join("") };
}

// ── supply analysis ──
function supplySpec(model: ProjectModel, sol: ProjectSolution): Spec {
  const u = units(model);
  const s = sol.summary;
  const ft = (model.waterSupply as Record<string, unknown> | undefined)?.["flowTest"] as Record<string, unknown> | undefined;
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Water Supply Analysis — §27.4.5.4")];
  y += mm(8);
  const half = (w - mm(6)) / 2;
  const left = infoBox(x, y, half, "Flow test (source)", [
    ["Source node", s.sourceId],
    ["Source elevation", u.l(s.sourceElevationFt) + ` ${u.U.l}`],
    ["Static pressure", u.pU(num(ft, "staticPsi"))],
    ["Residual pressure", u.pU(num(ft, "residualPsi"))],
    ["Test flow", u.qU(num(ft, "testFlowGpm"))],
  ]);
  const right = infoBox(x + (w + mm(6)) / 2, y, half, "Demand vs supply", [
    ["Total demand", u.qU(s.totalDemandGpm)],
    ["Required source pressure", u.pU(s.sourcePressurePsi)],
    ["Available @ demand", u.pU(s.availablePsi)],
    ["Margin", u.pU(s.marginPsi)],
    ["Adequate", s.passesSupply ? "YES" : "NO"],
  ]);
  el.push(left.svg, right.svg);
  return { title: "Supply Analysis", inner: el.join("") };
}

// ── graph (N^1.85) ──
function graphSpec(model: ProjectModel, sol: ProjectSolution): Spec {
  const u = units(model);
  const s = sol.summary;
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Graph Sheet — N^1.85 §27.4.5.3")];
  y += mm(10);
  const gx = x + mm(16);
  const gy = y;
  const gw = w - mm(22);
  const gh = mm(150);
  const samples = s.supplyCurveSamples;
  const qmax = Math.max(s.totalDemandGpm * 1.25, ...samples.map((p) => p.flowGpm), 1);
  const pmax = Math.max(s.sourcePressurePsi * 1.2, ...samples.map((p) => p.pressurePsi), 1);
  const X = (q: number) => gx + (Math.pow(q, 1.85) / Math.pow(qmax, 1.85)) * gw;
  const Y = (p: number) => gy + gh - (p / pmax) * gh;
  el.push(rect(gx, gy, gw, gh, { fill: "#fcfdff", stroke: C.line, sw: 0.8 }));
  for (let i = 1; i <= 5; i++) {
    const q = (qmax * i) / 5;
    el.push(line(X(q), gy, X(q), gy + gh, "#eef2f7", 0.5));
    el.push(T(X(q), gy + gh + mm(4), `${Math.round(q)}`, { size: mm(2.1), fill: C.muted, anchor: "middle" }));
    const p = (pmax * i) / 5;
    el.push(line(gx, Y(p), gx + gw, Y(p), "#eef2f7", 0.5));
    el.push(T(gx - mm(2), Y(p) + mm(0.9), `${Math.round(p)}`, { size: mm(2.1), fill: C.muted, anchor: "end" }));
  }
  el.push(T(gx + gw / 2, gy + gh + mm(9), `Flow (${u.U.q}) — N^1.85 scale`, { size: mm(2.5), fill: C.ink, weight: "600", anchor: "middle" }));
  el.push(`<text x="${(gx - mm(11)).toFixed(2)}" y="${(gy + gh / 2).toFixed(2)}" font-size="${mm(2.5).toFixed(2)}" fill="${C.ink}" font-weight="600" text-anchor="middle" transform="rotate(-90 ${(gx - mm(11)).toFixed(2)} ${(gy + gh / 2).toFixed(2)})">Pressure (${u.U.p})</text>`);
  const path = samples.map((p, i) => `${i ? "L" : "M"}${X(p.flowGpm).toFixed(1)},${Y(p.pressurePsi).toFixed(1)}`).join(" ");
  el.push(`<path d="${path}" fill="none" stroke="${C.primary}" stroke-width="1.6"/>`);
  const dx = X(s.totalDemandGpm);
  const dy = Y(s.sourcePressurePsi);
  el.push(`<circle cx="${dx.toFixed(1)}" cy="${dy.toFixed(1)}" r="${mm(1.7).toFixed(1)}" fill="${C.bad}"/>`);
  // legend box
  const lx = gx + gw - mm(48);
  const ly = gy + mm(4);
  el.push(rect(lx, ly, mm(46), mm(13), { fill: "#ffffff", stroke: C.line, sw: 0.6, rx: mm(1) }));
  el.push(line(lx + mm(2), ly + mm(4), lx + mm(8), ly + mm(4), C.primary, 1.6), T(lx + mm(10), ly + mm(4.8), "Supply curve", { size: mm(2.2), fill: C.ink }));
  el.push(`<circle cx="${(lx + mm(5)).toFixed(1)}" cy="${(ly + mm(9)).toFixed(1)}" r="${mm(1.4).toFixed(1)}" fill="${C.bad}"/>`, T(lx + mm(10), ly + mm(9.8), `Demand ${u.q(s.totalDemandGpm)} @ ${u.p(s.sourcePressurePsi)}`, { size: mm(2.2), fill: C.ink }));
  return { title: "Graph Sheet", inner: el.join("") };
}

// ── heads summary (per-sprinkler discharge) ──
function headsSummarySpecs(model: ProjectModel, sol: ProjectSolution): Spec[] {
  const u = units(model);
  const cols: Column[] = [
    { label: "Head", w: 0.12 },
    { label: "Type", w: 0.18 },
    { label: "K", w: 0.1, align: "r" },
    { label: "Coverage", unit: "ft²", w: 0.16, align: "r" },
    { label: "Elev", unit: u.U.l, w: 0.12, align: "r" },
    { label: "Pressure", unit: u.U.p, w: 0.16, align: "r" },
    { label: "Flow", unit: u.U.q, w: 0.16, align: "r" },
  ];
  const rows = model.network.nodes
    .filter((n) => n.type === "sprinkler" && (n.kFactor ?? 0) > 0)
    .map((n) => {
      const r = sol.results.nodes[n.id];
      return [n.id, String(n.sprinkler ?? "—"), n.kFactor ? String(n.kFactor) : "—", n.coverageAreaFt2 ? String(n.coverageAreaFt2) : "—", u.l(n.elevationFt ?? 0), u.p(r?.totalPressurePsi), u.q(r?.dischargeGpm)];
    });
  if (rows.length === 0) return [];
  return tableSpecs("Sprinkler Heads Summary", cols, rows);
}

// ── report of utilities / bill of materials ──
function bomSpecs(model: ProjectModel): Spec[] {
  const u = units(model);
  const { x, w } = INNER;
  const pipeAgg = new Map<string, { material: string; size: string; count: number; length: number }>();
  for (const p of model.network.pipes) {
    const material = p.material ?? "steel-sch40";
    const size = p.nominalSize ?? "—";
    const key = `${material}|${size}`;
    const a = pipeAgg.get(key) ?? { material, size, count: 0, length: 0 };
    a.count++;
    a.length += (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0);
    pipeAgg.set(key, a);
  }
  const pipeRows = [...pipeAgg.values()]
    .sort((a, b) => a.material.localeCompare(b.material) || a.size.localeCompare(b.size))
    .map((a) => [pipeMaterial(a.material).label, `${a.size}"`, String(a.count), u.l(a.length)]);

  const valveAgg = new Map<string, number>();
  for (const v of model.network.valves ?? []) valveAgg.set(v.type, (valveAgg.get(v.type) ?? 0) + 1);
  const fittingAgg = new Map<string, number>();
  for (const p of model.network.pipes) for (const f of p.fittings ?? []) fittingAgg.set(f.type, (fittingAgg.get(f.type) ?? 0) + (f.qty ?? 1));
  const vfRows = [
    ...[...valveAgg.entries()].map(([t, n]) => [t, "valve", String(n)]),
    ...[...fittingAgg.entries()].map(([t, n]) => [t, "fitting", String(n)]),
  ];

  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Report of Utilities — Bill of Materials")];
  y += mm(7);
  const t1 = table(x, y, w, [{ label: "Pipe material", w: 0.42 }, { label: "Size", w: 0.16 }, { label: "Segments", w: 0.18, align: "r" }, { label: "Total length", unit: u.U.l, w: 0.24, align: "r" }], pipeRows.length ? pipeRows : [["—", "—", "0", "0"]]);
  el.push(t1.svg);
  y = t1.endY + mm(8);
  el.push(sectionTitle(x, y, w, "Valves & fittings"));
  y += mm(7);
  el.push(table(x, y, w, [{ label: "Item", w: 0.6 }, { label: "Kind", w: 0.2 }, { label: "Qty", w: 0.2, align: "r" }], vfRows.length ? vfRows : [["none", "—", "0"]]).svg);
  return [{ title: "Report of Utilities", inner: el.join("") }];
}

// ── generic paginated table specs ──
function tableSpecs(title: string, cols: Column[], rows: string[][]): Spec[] {
  const pages = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const out: Spec[] = [];
  for (let p = 0; p < pages; p++) {
    const { x, w } = INNER;
    let y = CONTENT_TOP + mm(4);
    const el: string[] = [sectionTitle(x, y, w, pages > 1 ? `${title}  (${p + 1}/${pages})` : title)];
    y += mm(7);
    el.push(table(x, y, w, cols, rows.slice(p * ROWS_PER_PAGE, (p + 1) * ROWS_PER_PAGE)).svg);
    out.push({ title, inner: el.join("") });
  }
  return out;
}

function nodeSpecs(model: ProjectModel, sol: ProjectSolution): Spec[] {
  const u = units(model);
  const cols: Column[] = [
    { label: "Node", w: 0.2 },
    { label: "Type", w: 0.24 },
    { label: "Elev", unit: u.U.l, w: 0.14, align: "r" },
    { label: "Pt", unit: u.U.p, w: 0.14, align: "r" },
    { label: "Pn", unit: u.U.p, w: 0.14, align: "r" },
    { label: "Discharge", unit: u.U.q, w: 0.14, align: "r" },
  ];
  const rows = model.network.nodes.map((n) => {
    const r = sol.results.nodes[n.id];
    return [n.id, n.type, u.l(n.elevationFt ?? 0), u.p(r?.totalPressurePsi), u.p(r?.normalPressurePsi), u.q(r?.dischargeGpm)];
  });
  return tableSpecs("Node Analysis — §27.4.5.5", cols, rows);
}

function pipeSpecs(model: ProjectModel, sol: ProjectSolution): Spec[] {
  const u = units(model);
  const cols: Column[] = [
    { label: "Pipe", w: 0.1 },
    { label: "From → To", w: 0.2 },
    { label: "Size", w: 0.09 },
    { label: "C", w: 0.06, align: "r" },
    { label: "Len", unit: u.U.l, w: 0.09, align: "r" },
    { label: "EqL", unit: u.U.l, w: 0.08, align: "r" },
    { label: "Flow", unit: u.U.q, w: 0.11, align: "r" },
    { label: "Vel", unit: u.U.v, w: 0.09, align: "r" },
    { label: "Pf", unit: u.U.p, w: 0.09, align: "r" },
    { label: "Pe", unit: u.U.p, w: 0.09, align: "r" },
  ];
  const rows = model.network.pipes.map((p) => {
    const r = sol.results.pipes[p.id];
    const l = sol.gga.links[p.id];
    return [p.id, `${p.from} → ${p.to}`, String(p.nominalSize ?? "—"), String(p.cFactor ?? l?.cFactorUsed ?? "—"), u.l(p.lengthFt ?? 0), u.l(l?.equivalentLengthFt ?? 0), u.q(r?.flowGpm), u.v(r?.velocityFps), u.p(r?.frictionLossPsi), u.p(r?.elevationLossPsi)];
  });
  return tableSpecs("Detailed Worksheet — Pipe Information §27.4.5.6", cols, rows);
}

function junctionSpecs(model: ProjectModel, sol: ProjectSolution): Spec[] {
  const rows = Object.entries(sol.gga.nodeImbalanceGpm)
    .map(([id, v]) => [id, v.toFixed(4)] as [string, string])
    .sort((a, b) => Math.abs(Number(b[1])) - Math.abs(Number(a[1])));
  return tableSpecs(`Hydraulic Junction Points — balance ≤ 0.5 psi (§27.2.2.4.1) · max ${sol.summary.maxJunctionImbalanceGpm.toFixed(4)} gpm`, [{ label: "Junction node", w: 0.6 }, { label: "Flow imbalance", unit: "gpm", w: 0.4, align: "r" }], rows);
}

// ── reference sheets ──
function textSpec(title: string, blocks: { heading: string; lines: string[] }[]): Spec {
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, title)];
  y += mm(9);
  for (const b of blocks) {
    el.push(T(x, y, b.heading, { size: mm(2.9), fill: C.primary, weight: "700" }));
    y += mm(5.5);
    for (const ln of b.lines) {
      el.push(T(x + mm(3), y, ln, { size: mm(2.5), fill: C.ink }));
      y += mm(5);
    }
    y += mm(3);
  }
  return { title, inner: el.join("") };
}

function formulasSpec(): Spec {
  return textSpec("Formulas & Calculation Procedure — NFPA 13 §27.2", [
    { heading: "Friction loss — Hazen-Williams (§27.2.2.1.1)", lines: ["p = 4.52 · Q^1.85 / (C^1.85 · d^4.87)   [psi per ft]", "P_friction = p × (pipe length + fitting equivalent length)"] },
    { heading: "Discharge — K-factor (§27.2.2.5)", lines: ["Q = K · √P   (P = pressure at the node)"] },
    { heading: "Velocity & normal pressure (§27.2.2.2–3)", lines: ["V = 0.4085 · Q / d²   [ft/s]", "P_v = 0.001123 · Q² / d⁴   [psi]", "P_n = P_t − P_v"] },
    { heading: "Elevation head (§27.2.2)", lines: ["ΔP = 0.433 psi/ft × Δelevation"] },
    { heading: "Equivalent length (§27.2.3)", lines: ["modifier = (actual ID / Sch-40 ID)^4.87   (§27.2.3.1.3.1)", "Table 27.2.3.1.1 is at C = 120; multiply by the Table 27.2.3.2.1 factor for other C."] },
    { heading: "Procedure", lines: ["Density/area method · begin at the hydraulically most-remote sprinkler.", "Each design-area sprinkler discharges ≥ density × coverage area.", "Junction pressures balance within 0.5 psi (§27.2.2.4.1)."] },
  ]);
}

function cValuesSpec(model: ProjectModel): Spec {
  let cvals: Record<string, number> = {};
  try {
    cvals = getStandard((model.meta.standardId ?? "nfpa13") as StandardId).hazenWilliamsCValues?.() ?? {};
  } catch {
    /* not implemented */
  }
  const rows = Object.entries(cvals).sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0])).map(([m, c]) => [m, String(c)]);
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Hazen-Williams C Values — Table 27.2.4.8.1")];
  y += mm(7);
  el.push(table(x, y, w, [{ label: "Pipe / material", w: 0.75 }, { label: "C", w: 0.25, align: "r" }], rows).svg);
  return { title: "Hazen-Williams C Values", inner: el.join("") };
}

function equivSpec(): Spec {
  const { x, w } = INNER;
  let y = CONTENT_TOP + mm(4);
  const el: string[] = [sectionTitle(x, y, w, "Equivalent Pipe Lengths & C-Multiplier — §27.2.3")];
  y += mm(9);
  el.push(T(x, y, "C-value multiplier (Table 27.2.3.2.1)", { size: mm(2.9), fill: C.primary, weight: "700" }));
  y += mm(5.5);
  el.push(table(x, y, (w - mm(8)) / 2, [{ label: "Value of C", w: 0.6 }, { label: "× factor", w: 0.4, align: "r" }], Object.entries(C_VALUE_MULTIPLIER).map(([c, m]) => [c, String(m)])).svg);
  y += mm(8);
  const sizes = ["1", "1-1/2", "2", "2-1/2", "4", "6"];
  const cols: Column[] = [{ label: "Fitting / valve", w: 0.34 }, ...sizes.map((s) => ({ label: `${s}"`, w: 0.11, align: "r" as const }))];
  const rows = Object.entries(FITTING_EQUIV_LENGTH_FT).map(([fit, row]) => [fit, ...sizes.map((s) => (row[s] !== undefined ? String(row[s]) : "—"))]);
  el.push(T(x, y, "Equivalent Sch-40 length, ft (Table 27.2.3.1.1, C = 120)", { size: mm(2.9), fill: C.primary, weight: "700" }));
  y += mm(5);
  el.push(table(x, y, w, cols, rows).svg);
  el.push(T(x, CONTENT_BOTTOM - mm(2), "Reference table — audit against the printed NFPA 13 before production use.", { size: mm(2), fill: C.faint }));
  return { title: "Equivalent Lengths", inner: el.join("") };
}

function pumpSpecs(model: ProjectModel, sol: ProjectSolution): Spec[] {
  const ws = model.waterSupply as Record<string, unknown> | undefined;
  const fp = ws?.["firePump"] as Record<string, unknown> | undefined;
  const pump = model.network.pump;
  if (!fp && !pump) return [];
  const u = units(model);
  const ds = pump?.datasheet ?? {};
  const rf = ds.ratedFlowGpm ?? (fp?.["ratedFlowGpm"] as number | undefined);
  const rp = ds.ratedPsi ?? (fp?.["ratedPsi"] as number | undefined);
  const ch = ds.churnPsi ?? (fp?.["churnPsi"] as number | undefined);
  const of = ds.overloadFlowGpm ?? (fp?.["overloadFlowGpm"] as number | undefined);
  const op = ds.overloadPsi ?? (fp?.["overloadPsi"] as number | undefined);
  const s = sol.summary;
  const { x, w } = INNER;
  const out: Spec[] = [];

  let y = CONTENT_TOP + mm(4);
  let el: string[] = [sectionTitle(x, y, w, "Fire Pump — Datasheet")];
  y += mm(8);
  el.push(
    infoBox(x, y, w, "Nameplate / listing", [
      ["Make", String(ds.make ?? "—")],
      ["Model", String(ds.model ?? "—")],
      ["Type", String(ds.type ?? "—")],
      ["Listed", String(ds.listed ?? fp?.["listed"] ?? "—")],
      ["Rated point", rf !== undefined ? `${u.qU(rf)} @ ${u.pU(rp)}` : "—"],
      ["Churn (shutoff)", u.pU(ch)],
      ["150% overload", of !== undefined ? `${u.qU(of)} @ ${u.pU(op)}` : "—"],
      ["RPM / impeller / motor", `${ds.rpm ?? "—"} · ${ds.impellerIn ?? "—"} in · ${ds.motorHp ?? "—"} hp`],
    ]).svg,
  );
  out.push({ title: "Fire Pump — Datasheet", inner: el.join("") });

  y = CONTENT_TOP + mm(4);
  el = [sectionTitle(x, y, w, "Fire Pump — Hydraulic Calculation")];
  y += mm(8);
  const half = (w - mm(6)) / 2;
  const a = infoBox(x, y, half, "Performance points (NFPA 20)", [
    ["Churn @ 0 gpm", u.pU(ch)],
    ["Rated point", rf !== undefined ? `${u.qU(rf)} @ ${u.pU(rp)}` : "—"],
    ["150% point", of !== undefined ? `${u.qU(of)} @ ${u.pU(op)}` : "—"],
  ]);
  const b = infoBox(x + (w + mm(6)) / 2, y, half, "System operating point", [
    ["System demand", u.qU(s.totalDemandGpm)],
    ["Required source pressure", u.pU(s.sourcePressurePsi)],
    ["Available (with pump)", u.pU(s.availablePsi)],
    ["Margin", u.pU(s.marginPsi)],
    ["Suction vel @ 150% (≤15 ft/s)", s.suctionCheck ? `${s.suctionCheck.velocityFps.toFixed(1)} ${u.U.v} ${s.suctionCheck.ok ? "OK" : "HIGH"}` : "—"],
    ["Adequate", s.passesSupply ? "YES" : "NO"],
  ]);
  el.push(a.svg, b.svg);
  out.push({ title: "Fire Pump — Hydraulic Calc", inner: el.join("") });

  const st = pump?.shopTest ?? [];
  y = CONTENT_TOP + mm(4);
  el = [sectionTitle(x, y, w, "Fire Pump — Shop Test Data")];
  y += mm(8);
  if (st.length) {
    el.push(table(x, y, w, [{ label: "Flow", unit: u.U.q, w: 0.34, align: "r" }, { label: "Pressure", unit: u.U.p, w: 0.33, align: "r" }, { label: "RPM", w: 0.33, align: "r" }], st.map((p) => [u.q(p.flowGpm), u.p(p.psi), p.rpm !== undefined ? String(p.rpm) : "—"])).svg);
  } else {
    el.push(infoBox(x, y, w, "Field / acceptance test", [["Shop-test curve", "not provided — attach witnessed test results"]]).svg);
  }
  out.push({ title: "Fire Pump — Shop Test", inner: el.join("") });
  return out;
}

/** Frame an array of content specs with a consistent header/footer + page x/total. */
function frameAll(model: ProjectModel, specs: Spec[]): Sheet[] {
  const total = specs.length;
  return specs.map((sp, i) => ({ title: sp.title, svg: frame(model, { title: sp.title, page: i + 1, total } as SheetMeta, sp.inner) }));
}

/** The full ordered §27.4 report. */
export function reportSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  const specs: Spec[] = [
    coverSpec(model, sol),
    riserNameplateSpec(model, sol),
    summarySpec(model, sol),
    graphSpec(model, sol),
    supplySpec(model, sol),
    ...nodeSpecs(model, sol),
    ...headsSummarySpecs(model, sol),
    ...pipeSpecs(model, sol),
    ...junctionSpecs(model, sol),
    formulasSpec(),
    cValuesSpec(model),
    equivSpec(),
    ...pumpSpecs(model, sol),
    ...bomSpecs(model),
  ];
  return frameAll(model, specs);
}

// named exports used elsewhere / by tests
export function summarySheet(model: ProjectModel, sol: ProjectSolution): Sheet {
  return frameAll(model, [summarySpec(model, sol)])[0]!;
}
export function pipeWorksheetSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  return frameAll(model, pipeSpecs(model, sol));
}
export function nodeAnalysisSheets(model: ProjectModel, sol: ProjectSolution): Sheet[] {
  return frameAll(model, nodeSpecs(model, sol));
}
export function graphSheet(model: ProjectModel, sol: ProjectSolution): Sheet {
  return frameAll(model, [graphSpec(model, sol)])[0]!;
}
