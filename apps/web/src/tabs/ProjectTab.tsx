/**
 * Project / Data-Entry tab — build or edit a project entirely in-app. Project
 * info, design basis, water supply (+ optional fire pump), reservoir, and the
 * node + pipe grids (Canute-style: size + length + direction code → geometry).
 * Every edit re-parses the model and bubbles up so the 3D view + results stay
 * live. Nodes are numbered 1..N; "Renumber" normalizes ids after edits.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode, type ChangeEvent } from "react";
import type { ProjectModel, NetworkNode, Pipe, Valve, Pump, PumpCurvePoint, Direction } from "@rads/model";
import {
  NOMINAL_SIZES, PIPE_ROLES, NODE_TYPES, VALVE_TYPES, PUMP_TYPES, PUMP_DRIVERS, VALVE_EQUIV_FT, MATERIAL_OPTIONS,
  DIRECTIONS, DIRECTION_LABEL, renumberNetwork, normalizePipe, withModel, splitPipeInModel, cleanupModel,
} from "../network-edit";
import { defaultCFactorForMaterial, pipeMaterial, parseFittingCodes, hazardClassesFor, designBasisForHazard, standardIsMetric, storageSchemesFor, designBasisForScheme, catalog, sprinklerBySin, type SprinklerProfile, fluidViscosityCst, type FluidType } from "@rads/standards-engine";
import { C, FONT, card, sectionTitle, field, fieldLabel, input, select, btnPrimary, btnGhost, btnDanger, th, td } from "../ui";
import type { Issue } from "../network-validate";

export function ProjectTab({ model, onChange, issues }: { model: ProjectModel; onChange: (m: ProjectModel) => void; issues?: Issue[] }): JSX.Element {
  const ds = (model.designBasis ?? {}) as Record<string, unknown>;
  const ws = (model.waterSupply ?? {}) as Record<string, unknown>;
  const ft = (ws["flowTest"] ?? {}) as Record<string, unknown>;
  const res = (model.network.reservoir ?? {}) as Record<string, unknown>;
  const suc = (model.network.suction ?? {}) as Record<string, unknown>;
  const pump = model.network.pump;
  const pds = (pump?.datasheet ?? {}) as Record<string, unknown>;
  const ratedCurve = pump?.ratedCurve ?? [];
  const shopTest = pump?.shopTest ?? [];
  const valves = model.network.valves ?? [];
  const nodes = model.network.nodes;
  const pipes = model.network.pipes;
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);
  // Project-defined (custom) materials — appear in the material dropdowns + solver.
  type CustomMat = { id: string; label: string; cFactor: number; roughnessMm?: number; basedOn?: string };
  const customMats = ((model as { customMaterials?: CustomMat[] }).customMaterials ?? []);
  const matOptions = [...MATERIAL_OPTIONS, ...customMats.map((c) => ({ id: c.id, label: `${c.label} (custom)` }))];
  const setCustomMats = (list: CustomMat[]) => onChange(withModel(model, { customMaterials: list }));
  const addCustomMat = () => setCustomMats([...customMats, { id: `mat-${Date.now().toString(36)}`, label: "Custom pipe", cFactor: 120, basedOn: "steel-sch40" }]);
  const updCustomMat = (i: number, patch: Partial<CustomMat>) => setCustomMats(customMats.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const delCustomMat = (i: number) => setCustomMats(customMats.filter((_, j) => j !== i));
  // Effective C-factor a pipe will solve with (material default, derated for dry
  // steel) — shown in the C cell so it always matches the calc.
  const dryFill = model.meta.fillType === "dry" || model.meta.fillType === "preaction";
  const effC = (p: Pipe): number => {
    if (typeof p.cFactor === "number") return p.cFactor;
    const c = defaultCFactorForMaterial(p.material);
    return dryFill && pipeMaterial(p.material).family === "steel" ? Math.min(c, 100) : c;
  };
  const [bulkRole, setBulkRole] = useState("");
  const [showAdv, setShowAdv] = useState(false); // pipe-table advanced columns (material/C/ID/add'l/fittings/ΔElev/ΔP)
  const [bulkNote, setBulkNote] = useState(""); // transient "Updated N pipes" confirmation
  // Metric data entry: when units=metric, table cells show/accept metric and
  // convert to the model's imperial storage (the solver is imperial-internal).
  const metric = model.meta.units === "metric";
  const rnd = (v: number, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
  const dispLen = (v?: number) => (v === undefined ? undefined : metric ? rnd(v * 0.3048) : v); // ft→m
  const storLen = (v?: number) => (v === undefined ? undefined : metric ? v / 0.3048 : v);
  const dispK = (v?: number) => (v === undefined ? undefined : metric ? rnd(v * 14.415, 1) : v); // imperial→metric K
  const storK = (v?: number) => (v === undefined ? undefined : metric ? v / 14.415 : v);
  const dispArea = (v?: number) => (v === undefined ? undefined : metric ? rnd(v / 10.7639, 1) : v); // ft²→m²
  const storArea = (v?: number) => (v === undefined ? undefined : metric ? v * 10.7639 : v);
  const dispFlow = (v?: number) => (v === undefined ? undefined : metric ? Math.round(v * 3.78541) : v); // gpm→L/min
  const storFlow = (v?: number) => (v === undefined ? undefined : metric ? v / 3.78541 : v);
  const dispId = (v?: number) => (v === undefined ? undefined : metric ? rnd(v * 25.4, 1) : v); // in→mm
  const storId = (v?: number) => (v === undefined ? undefined : metric ? v / 25.4 : v);
  const dispPsi = (v?: number) => (v === undefined ? undefined : metric ? rnd(v * 0.0689476, 2) : v); // psi→bar
  const storPsi = (v?: number) => (v === undefined ? undefined : metric ? v / 0.0689476 : v);
  const dispGal = (v?: number) => (v === undefined ? undefined : metric ? Math.round(v * 3.785412) : v); // gal→L
  const storGal = (v?: number) => (v === undefined ? undefined : metric ? v / 3.785412 : v);
  const dispVel = (v?: number) => (v === undefined ? undefined : metric ? Math.round(v * 0.3048 * 10) / 10 : v); // ft/s→m/s
  const storVel = (v?: number) => (v === undefined ? undefined : metric ? v / 0.3048 : v);
  const dispDens = (v?: number) => (v === undefined ? undefined : metric ? rnd(v * 40.7458, 1) : v); // gpm/ft²→mm/min
  const storDens = (v?: number) => (v === undefined ? undefined : metric ? v / 40.7458 : v);
  const dispTemp = (v?: number) => (v === undefined ? undefined : metric ? rnd((v - 32) / 1.8, 1) : v); // °F→°C
  const storTemp = (v?: number) => (v === undefined ? undefined : metric ? v * 1.8 + 32 : v);
  const U = { len: metric ? "m" : "ft", area: metric ? "m²" : "ft²", k: metric ? "metric" : "imp", flow: metric ? "L/min" : "gpm", id: metric ? "mm" : "in", p: metric ? "bar" : "psi", dens: metric ? "mm/min" : "gpm/ft²", gal: metric ? "L" : "gal", temp: metric ? "°C" : "°F" };
  const curveConv = { dispF: dispFlow, storF: storFlow, dispP: dispPsi, storP: storPsi, uFlow: U.flow, uP: U.p };
  // Hazard classes + density preset from the active code (EN 12845 is metric).
  const standardId = str(model.meta.standardId, "nfpa13");
  const hzClasses = hazardClassesFor(standardId);
  const hazardOpts = hzClasses.length ? hzClasses.map((h) => h.id) : ["lh", "oh1", "oh2", "eh1", "eh2"];
  const applyDensity = () => {
    const db = designBasisForHazard(standardId, str(model.meta.hazardClass, hazardOpts[0]));
    if (!db) return;
    // Leaving a storage scheme → also drop its scheme-written K + duration so a
    // density design isn't computed/printed against a stale storage K-factor or
    // storage water-supply duration. (Preserve user-entered K/duration otherwise.)
    const fromStorage = ds["method"] === "fm-storage";
    onChange(withModel(model, {
      designBasis: { ...ds, densityGpmFt2: db.densityGpmFt2, designAreaFt2: db.designAreaFt2, minSprinklerPressurePsi: db.minPressurePsi, hoseAllowanceGpm: db.hoseAllowanceGpm, operatingSprinklers: undefined, method: undefined, schemeLabel: undefined, ...(fromStorage ? { sprinklerKFactor: undefined, durationMin: undefined } : {}) },
      ...(standardIsMetric(standardId) ? { meta: { ...model.meta, units: "metric" } } : {}),
    }));
  };
  // FM DS 8-9 storage: count-at-pressure schemes (K + N design heads @ min psi).
  const storageSchemes = storageSchemesFor(standardId);
  const storageSchemeId = str(model.meta.storageSchemeId, storageSchemes[0]?.id ?? "");
  const pickedScheme = storageSchemes.find((s) => s.id === storageSchemeId);
  const applyScheme = () => {
    const b = designBasisForScheme(standardId, storageSchemeId);
    if (!b) return;
    // Mirror of applyDensity: write count+pressure+K, clear density/area so the
    // solver runs pure count-at-pressure. FM is imperial — no units flip.
    onChange(withModel(model, {
      designBasis: { ...ds, operatingSprinklers: b.operatingSprinklers, minSprinklerPressurePsi: b.minPressurePsi, sprinklerKFactor: b.kFactor, hoseAllowanceGpm: b.hoseAllowanceGpm, durationMin: b.durationMin, method: b.method, schemeLabel: b.schemeLabel, densityGpmFt2: undefined, designAreaFt2: undefined },
    }));
  };
  const [find, setFind] = useState("");
  const fq = find.toLowerCase().trim();
  const nodeMatch = (n: NetworkNode) => !fq || `${n.id} ${n.type} ${n.note ?? ""}`.toLowerCase().includes(fq);
  const pipeMatch = (p: Pipe) => !fq || `${p.id} ${p.from} ${p.to} ${p.role ?? ""} ${p.material ?? ""} ${p.nominalSize ?? ""}`.toLowerCase().includes(fq);

  // ---- committers ------------------------------------------------------
  const setMeta = (k: string, v: unknown) => onChange(withModel(model, { meta: { ...model.meta, [k]: v } }));
  const setBasis = (k: string, v: unknown) => onChange(withModel(model, { designBasis: { ...ds, [k]: v } }));
  // Fluid model → recompute the Darcy-Weisbach kinematic viscosity and commit it
  // along with the fluid params (the solver reads designBasis.fluidViscosityCst).
  const applyFluid = (patch: { fluidType?: string; fluidTempF?: number; fluidConcPct?: number }) => {
    const type = (patch.fluidType ?? str(ds["fluidType"], "water")) as FluidType;
    const tempF = patch.fluidTempF ?? num(ds["fluidTempF"]) ?? 68;
    const conc = patch.fluidConcPct ?? num(ds["fluidConcPct"]) ?? 0;
    const cst = fluidViscosityCst(type, tempF, type === "water" ? 0 : conc);
    onChange(withModel(model, { designBasis: { ...ds, fluidType: type, fluidTempF: tempF, fluidConcPct: conc, fluidViscosityCst: cst } }));
  };
  const setSupply = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, [k]: v } }));
  const setFlow = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, flowTest: { ...ft, [k]: v } } }));
  const setRes = (k: string, v: unknown) => onChange(withModel(model, { network: { ...model.network, reservoir: { ...res, [k]: v } } as ProjectModel["network"] }));
  const toggleRes = (on: boolean) =>
    onChange(withModel(model, {
      network: { ...model.network, reservoir: on ? { kind: "ground-tank", capacityGal: 20000, heightFt: 12, lengthFt: 20, widthFt: 20, connectedNode: nodeIds[0] } : undefined },
    }));

  // ── suction line ──
  const setSuc = (k: string, v: unknown) => onChange(withModel(model, { network: { ...model.network, suction: { ...suc, [k]: v } } as ProjectModel["network"] }));
  const toggleSuc = (on: boolean) =>
    onChange(withModel(model, { network: { ...model.network, suction: on ? { sizeIn: 6, lengthFt: 20, material: "ductile-iron", cFactor: 140, liftFt: 0, fittings: [] } : undefined } }));

  // ── fire pump (datasheet + curves) — also feeds the supply curve in the calc ──
  /** Re-derive waterSupply.firePump from the datasheet so the solve uses the pump. */
  const syncPump = (next: Pump | undefined): ProjectModel => {
    const d = (next?.datasheet ?? {}) as Record<string, unknown>;
    const hasPump = typeof d["ratedFlowGpm"] === "number";
    const firePump = hasPump
      ? { ratedFlowGpm: d["ratedFlowGpm"], ratedPsi: d["ratedPsi"] ?? 0, churnPsi: d["churnPsi"] ?? (d["ratedPsi"] as number) * 1.2, ...(typeof d["overloadFlowGpm"] === "number" ? { overloadFlowGpm: d["overloadFlowGpm"] } : {}), ...(typeof d["overloadPsi"] === "number" ? { overloadPsi: d["overloadPsi"] } : {}) }
      : undefined;
    return withModel(model, { network: { ...model.network, pump: next }, waterSupply: { ...ws, type: hasPump ? "city+fire-pump" : "city", firePump } });
  };
  const setDs = (k: string, v: unknown) => onChange(syncPump({ ...pump, datasheet: { ...pds, [k]: v } }));
  const setDsMany = (patch: Record<string, unknown>) => onChange(syncPump({ ...pump, datasheet: { ...pds, ...patch } }));
  const onUploadDatasheet = (e: ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 900 * 1024) window.alert("Heads up: files over ~900 KB may exceed the cloud-save limit. It will still embed in the local .rhfc / JSON.");
    const reader = new FileReader();
    reader.onload = () => setDsMany({ attachmentName: file.name, attachmentDataUrl: String(reader.result) });
    reader.readAsDataURL(file);
  };
  const togglePump = (on: boolean) =>
    onChange(syncPump(on
      ? { datasheet: { type: "horizontal-split-case", ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115, overloadFlowGpm: 1125, overloadPsi: 65, driver: "electric" }, ratedCurve: [{ flowGpm: 0, psi: 115 }, { flowGpm: 750, psi: 100 }, { flowGpm: 1125, psi: 65 }], shopTest: [] }
      : undefined));
  const setCurve = (which: "ratedCurve" | "shopTest", pts: PumpCurvePoint[]) => onChange(withModel(model, { network: { ...model.network, pump: { ...pump, [which]: pts } } }));

  // ── valves ──
  const commitValves = (v: Valve[]) => onChange(withModel(model, { network: { ...model.network, valves: v } }));
  const setValve = (i: number, patch: Partial<Valve>) => { const v = valves.slice(); v[i] = { ...v[i]!, ...patch }; commitValves(v); };
  const addValve = () => commitValves([...valves, { id: `V-${valves.length + 1}`, type: "gate-valve", onPipe: pipes[0]?.id, sizeIn: "4", equivalentLengthFt: VALVE_EQUIV_FT["gate-valve"] }]);
  const delValve = (i: number) => commitValves(valves.filter((_, j) => j !== i).map((v, j) => ({ ...v, id: `V-${j + 1}` })));

  const commit = (n: NetworkNode[], p: Pipe[]) =>
    onChange(withModel(model, { network: { ...model.network, nodes: n, pipes: p.map(normalizePipe) } }));
  const commitStructural = (n: NetworkNode[], p: Pipe[]) => {
    const r = renumberNetwork(n, p);
    commit(r.nodes, r.pipes);
  };

  // ---- node ops --------------------------------------------------------
  const setNode = (i: number, patch: Partial<NetworkNode>) => {
    const n = nodes.slice();
    n[i] = { ...n[i]!, ...patch };
    commit(n, pipes);
  };
  const addNode = () => {
    const last = nodes[nodes.length - 1];
    const def = sprinklerBySin(str(ds["defaultSprinklerSin"]) || undefined);
    const head: Partial<NetworkNode> = def
      ? { kFactor: def.kImperial, sprinkler: def.orientation, sin: def.sin, manufacturer: def.manufacturer, model: def.model, tempRatingF: def.tempRatingsF[0], response: def.response }
      : { kFactor: num(ds["sprinklerKFactor"]) ?? 5.6 };
    commitStructural([...nodes, { id: String(nodes.length + 1), type: "sprinkler", elevationFt: last?.elevationFt ?? 0, coverageAreaFt2: 100, ...head }], pipes);
  };
  const delNode = (i: number) => {
    const id = nodes[i]!.id;
    commitStructural(nodes.filter((_, j) => j !== i), pipes.filter((p) => p.from !== id && p.to !== id));
  };

  // ---- pipe ops --------------------------------------------------------
  const setPipe = (i: number, patch: Partial<Pipe>) => {
    const p = pipes.slice();
    p[i] = { ...p[i]!, ...patch };
    commit(nodes, p);
  };
  const addPipe = () => {
    const lastTo = pipes[pipes.length - 1]?.to ?? nodeIds[0] ?? "1";
    const to = nodeIds[nodeIds.length - 1] ?? "1";
    commitStructural(nodes, [...pipes, { id: `P-${pipes.length + 1}`, from: lastTo, to, role: "branch-line", nominalSize: "1", lengthFt: 10, fittings: [] }]);
  };
  const delPipe = (i: number) => commitStructural(nodes, pipes.filter((_, j) => j !== i));
  const splitPipe = (i: number) => onChange(splitPipeInModel(model, pipes[i]!.id, 0.5));
  // Bulk edit: apply a patch to every pipe matching the role filter ("" = all).
  const bulkMatch = (p: Pipe) => !bulkRole || (p.role ?? "") === bulkRole;
  const bulkApply = (patch: Partial<Pipe>) => {
    const n = pipes.filter(bulkMatch).length;
    commit(nodes, pipes.map((p) => (bulkMatch(p) ? { ...p, ...patch } : p)));
    const what = patch.material ? "material (C reset to default)" : patch.nominalSize ? "size" : patch.role ? "role" : "field";
    setBulkNote(`Updated ${what} on ${n} pipe${n === 1 ? "" : "s"}`);
    setTimeout(() => setBulkNote(""), 3000);
  };

  const renumber = () => commitStructural(nodes, pipes);

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input style={{ ...input, maxWidth: 340 }} placeholder="🔎 Find node / pipe — id, role, material, note…" value={find} onChange={(e) => setFind(e.target.value)} />
        {find && <button style={btnGhost} onClick={() => setFind("")}>Clear</button>}
      </div>
      {issues && issues.length > 0 && (
        <div style={validBanner}>
          <div style={{ fontWeight: 700, color: C.ink, marginBottom: 4 }}>⚠ Model check — {issues.filter((i) => i.severity === "error").length} error(s), {issues.filter((i) => i.severity === "warning").length} warning(s)</div>
          {issues.slice(0, 8).map((it, i) => <div key={i} style={{ fontSize: 12, color: it.severity === "error" ? C.bad : C.warn }}>• {it.message}</div>)}
          {issues.length > 8 && <div style={{ fontSize: 11.5, color: C.muted }}>…and {issues.length - 8} more</div>}
        </div>
      )}
      <div style={grid2}>
        {/* Project info */}
        <Section title="Project information">
          <Row>
            <Txt label="Project name" value={str(model.meta.name)} onChange={(v) => setMeta("name", v)} />
            <Txt label="Project no." value={str(model.meta.id)} onChange={(v) => setMeta("id", v)} />
          </Row>
          <Row>
            <Sel label="Code" value={str(model.meta.standardId, "nfpa13")} options={["nfpa13", "nfpa13d", "nfpa13r", "nfpa14", "nfpa750", "en12845", "fmds", "as2118"]} onChange={(v) => onChange(withModel(model, { meta: { ...model.meta, standardId: v, units: standardIsMetric(v) ? "metric" : "imperial", ...(v === "nfpa750" ? { systemType: "water-mist" } : {}) } }))} />
            <Sel label="System" value={str(model.meta.systemType, "sprinkler")} options={["sprinkler", "standpipe", "water-mist"]} onChange={(v) => setMeta("systemType", v)} />
            <Sel label="Fill type" value={str(model.meta.fillType, "wet")} options={["wet", "dry", "preaction", "deluge"]} onChange={(v) => setMeta("fillType", v)} />
            <Sel label="Hazard" value={str(model.meta.hazardClass, hazardOpts[0])} options={hazardOpts} onChange={(v) => setMeta("hazardClass", v)} />
            <Sel label="Units" value={str(model.meta.units, "imperial")} options={["imperial", "metric"]} onChange={(v) => setMeta("units", v)} />
            <Sel label="Governing code" value={str(model.meta.governingCode, "none")} options={["none", "bnbc", "rsc", "ibc"]} onChange={(v) => setMeta("governingCode", v === "none" ? undefined : v)} />
          </Row>
          {model.meta.systemType === "standpipe" && (
            <Row>
              <Sel label="Standpipe class" value={str(model.meta.standpipeClass, "I")} options={["I", "II", "III"]} onChange={(v) => setMeta("standpipeClass", v)} />
              <label style={{ ...checkRow, flex: 1, alignSelf: "end", paddingBottom: 4 }}><input type="checkbox" checked={ds["sprinkleredThroughout"] !== false} onChange={(e) => setBasis("sprinkleredThroughout", e.target.checked ? undefined : false)} /><span>Sprinklered throughout (cap 1000 gpm; off → 1250, §7.10.1.1.5)</span></label>
            </Row>
          )}
          <Row>
            <Txt label="Standard" value={str(model.meta.standard, "NFPA 13 (2019)")} onChange={(v) => setMeta("standard", v)} />
            <Txt label="Engineer" value={str(model.meta.engineer)} onChange={(v) => setMeta("engineer", v)} />
            <Txt label="Drawing no." value={str(model.meta.drawingNo)} onChange={(v) => setMeta("drawingNo", v)} />
            <Txt label="Date" value={str(model.meta.date)} onChange={(v) => setMeta("date", v)} />
          </Row>
          <Row>
            <Txt label="Client" value={str(model.meta.client)} onChange={(v) => setMeta("client", v)} />
            <Txt label="Contractor" value={str(model.meta.contractor)} onChange={(v) => setMeta("contractor", v)} />
          </Row>
          <Row>
            <Txt label="Designer / company" value={str(model.meta.designer)} onChange={(v) => setMeta("designer", v)} />
            <Txt label="Site address" value={str(model.meta.address)} onChange={(v) => setMeta("address", v)} />
          </Row>
          <Row>
            <TxtArea label="Design notes / assumptions / exclusions" value={str(model.meta.designNotes)} placeholder="e.g. Antifreeze loop to loading dock by others · seismic bracing per separate calc · C-factors per NFPA 13 Table 27.2.4.8.1 · one line per note" onChange={(v) => setMeta("designNotes", v)} />
          </Row>
        </Section>

        {/* Design basis */}
        <Section title="Design basis">
          {designBasisForHazard(standardId, str(model.meta.hazardClass, hazardOpts[0])) && (
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: -4 }}>
              <button style={btnGhost} onClick={applyDensity} title="Fill density/area/pressure from the selected code + hazard class">↧ Apply {standardId.toUpperCase()} {str(model.meta.hazardClass, "").toUpperCase()} density</button>
            </div>
          )}
          {storageSchemes.length > 0 && (
            <div style={{ border: `1px solid ${C.line}`, borderRadius: 8, padding: "10px 12px", background: C.band, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
                <label style={{ ...field, flex: 1 }}>
                  <span style={fieldLabel}>FM storage scheme (DS 8‑9 — count‑at‑pressure)</span>
                  <select style={select} value={storageSchemeId} onChange={(e) => setMeta("storageSchemeId", e.target.value)}>
                    {storageSchemes.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </label>
                <button style={btnGhost} onClick={applyScheme} title="Fill operating heads / min pressure / K from the chosen FM storage scheme">↧ Apply scheme</button>
              </div>
              {pickedScheme && (
                <div style={hint}>
                  {pickedScheme.mode === "suppression" ? "Suppression (ESFR)" : "Control mode"} · {pickedScheme.designSprinklers} heads @ {pickedScheme.minPressurePsi} psi · K{pickedScheme.kFactor} · hose {pickedScheme.hoseAllowanceGpm} gpm / {pickedScheme.durationMin} min{pickedScheme.commodity ? ` · ${pickedScheme.commodity}` : ""}.
                  {pickedScheme.note ? <><br />Note: {pickedScheme.note}</> : null}
                  <br />⚠ Representative FM DS 8‑9 data — verify the exact table cell + edition. <strong>Ceiling sprinklers only</strong> — does NOT design in‑rack sprinklers (which DS 8‑9 may require), and assumes the listed commodity, storage/ceiling height, aisle width, flue spaces and storage arrangement. Preliminary sizing, not an approved design.
                </div>
              )}
            </div>
          )}
          <Row>
            <label style={{ ...field, flex: 1 }}>
              <span style={fieldLabel}>Default sprinkler (SIN / model) — applied to new heads</span>
              <select style={select} value={str(ds["defaultSprinklerSin"])} onChange={(e) => { const p = catalog().find((s) => s.sin === e.target.value); onChange(withModel(model, { designBasis: { ...ds, defaultSprinklerSin: e.target.value, sprinklerKFactor: p ? p.kImperial : num(ds["sprinklerKFactor"]), defaultSprinklerOrientation: p?.orientation, defaultSprinklerTempF: p?.tempRatingsF[0], defaultSprinklerResponse: p?.response } })); }}>
                <option value="">(none / manual K)</option>
                {catalog().map((s) => <option key={s.sin} value={s.sin}>{`${s.manufacturer} ${s.sin} — ${s.model} · K${dispK(s.kImperial)}${s.audit ? " ⚠" : ""}`}</option>)}
              </select>
            </label>
          </Row>
          <div style={hint}>Picking a catalog sprinkler (here or per‑head in the Nodes table) prefills K / orientation / temperature / response. ⚠ = SIN inferred from family convention. Catalog values are representative — confirm SIN, K‑factor, temperature ratings and listings against the current manufacturer datasheet/edition before approval.</div>
          <Row>
            <Num label={`Density (${U.dens})`} value={dispDens(num(ds["densityGpmFt2"]))} step={metric ? 0.5 : 0.01} onChange={(v) => setBasis("densityGpmFt2", storDens(v))} />
            <Num label={`Design area (${U.area})`} value={dispArea(num(ds["designAreaFt2"]))} step={metric ? 5 : 50} onChange={(v) => setBasis("designAreaFt2", storArea(v))} />
            <Num label={`Protected floor area (${U.area})`} value={dispArea(num((model.meta as Record<string, unknown>)["protectedAreaFt2"]))} step={metric ? 50 : 500} onChange={(v) => setMeta("protectedAreaFt2", storArea(v))} />
            <Sel label="Coverage" value={str(ds["coverageType"], "standard")} options={["standard", "extended-coverage"]} onChange={(v) => setBasis("coverageType", v)} />
          </Row>
          <Row>
            <Num label={`Sprinkler K (${U.k})`} value={dispK(num(ds["sprinklerKFactor"]))} step={metric ? 1 : 0.1} onChange={(v) => setBasis("sprinklerKFactor", storK(v))} />
            <Num label="Operating heads" value={num(ds["operatingSprinklers"])} step={1} onChange={(v) => setBasis("operatingSprinklers", v)} />
          </Row>
          <Row>
            <Num label={`Min head pressure (${U.p})`} value={dispPsi(num(ds["minSprinklerPressurePsi"]))} step={metric ? 0.1 : 1} onChange={(v) => setBasis("minSprinklerPressurePsi", storPsi(v))} />
            <Num label={`Hose allowance (${U.flow})`} value={dispFlow(num(ds["hoseAllowanceGpm"]))} step={metric ? 100 : 50} onChange={(v) => setBasis("hoseAllowanceGpm", storFlow(v))} />
            <Num label="Supply duration (min, auto by hazard)" value={num(ds["durationMin"])} step={10} onChange={(v) => setBasis("durationMin", v)} />
            <Num label={`Component rating (${U.p}, def 175)`} value={dispPsi(num(ds["maxComponentPressurePsi"]))} step={metric ? 5 : 25} onChange={(v) => setBasis("maxComponentPressurePsi", storPsi(v))} />
          </Row>
          <Row>
            <Sel label="Friction method" value={str(ds["frictionMethod"], "hazen-williams")} options={["hazen-williams", "darcy-weisbach"]} onChange={(v) => setBasis("frictionMethod", v)} />
            <Num label={`Max velocity (${metric ? "m/s" : "ft/s"}, default ${metric ? "6.1" : "20"})`} value={dispVel(num(ds["maxVelocityFps"]))} step={metric ? 0.5 : 1} onChange={(v) => setBasis("maxVelocityFps", storVel(v))} />
            <Num label={`Target margin (${U.p})`} value={dispPsi(num(ds["targetMarginPsi"]))} step={metric ? 0.5 : 1} onChange={(v) => setBasis("targetMarginPsi", storPsi(v))} />
            <Num label="QR area reduction (%)" value={num(ds["qrAreaReductionPct"])} step={5} onChange={(v) => setBasis("qrAreaReductionPct", v)} />
            <label style={{ ...checkRow, flex: 1 }}><input type="checkbox" checked={ds["steepSlope"] === true} onChange={(e) => setBasis("steepSlope", e.target.checked || undefined)} /><span>Sloped ceiling &gt; 2/12 (+30%)</span></label>
          </Row>
          {ds["frictionMethod"] === "darcy-weisbach" && (() => {
            const ft = str(ds["fluidType"], "water") as FluidType;
            const tempF = num(ds["fluidTempF"]) ?? 68;
            const conc = num(ds["fluidConcPct"]) ?? 0;
            const cst = num(ds["fluidViscosityCst"]) ?? fluidViscosityCst(ft, tempF, ft === "water" ? 0 : conc);
            return (
              <>
                <Row>
                  <Sel label="Fluid" value={ft} options={["water", "propylene-glycol", "ethylene-glycol"]} onChange={(v) => applyFluid({ fluidType: v })} />
                  <Num label={`Temperature (${U.temp})`} value={dispTemp(tempF)} step={metric ? 1 : 2} onChange={(v) => applyFluid({ fluidTempF: storTemp(v) ?? 68 })} />
                  {ft !== "water" && <Num label="Antifreeze conc. (% vol)" value={conc} step={5} onChange={(v) => applyFluid({ fluidConcPct: v ?? 0 })} />}
                </Row>
                <div style={hint}>Kinematic viscosity ≈ {cst.toFixed(2)} cSt → drives the Darcy‑Weisbach friction factor. ⚠ Antifreeze viscosity is representative — verify against the product data sheet before approval.</div>
              </>
            );
          })()}
          <label style={checkRow}>
            <input type="checkbox" checked={!!ds["autoFittings"]} onChange={(e) => setBasis("autoFittings", e.target.checked)} />
            <span>Auto-add a 90° elbow where a pipe changes direction</span>
          </label>
          <div style={hint}>Leave operating heads blank to auto‑peak the design area. Fitting codes per pipe: E elbow · LE long elbow · FE 45° · T tee · GV/BV/CV valves (e.g. “2E 1T”).</div>
        </Section>

        {/* Water supply */}
        <Section title="Water supply">
          <Row>
            <Sel label="Supply type" value={str(ws["supplyType"], "flow-test")} options={["flow-test", "fixed-pressure"]} onChange={(v) => setSupply("supplyType", v)} />
          </Row>
          {str(ws["supplyType"], "flow-test") === "fixed-pressure" ? (
            <Row>
              <Num label={`Available pressure (${U.p})`} value={dispPsi(num(ws["fixedPressurePsi"]))} step={metric ? 0.1 : 1} onChange={(v) => setSupply("fixedPressurePsi", storPsi(v))} />
            </Row>
          ) : (
            <Row>
              <Num label={`Static (${U.p})`} value={dispPsi(num(ft["staticPsi"]))} step={metric ? 0.1 : 1} onChange={(v) => setFlow("staticPsi", storPsi(v))} />
              <Num label={`Residual (${U.p})`} value={dispPsi(num(ft["residualPsi"]))} step={metric ? 0.1 : 1} onChange={(v) => setFlow("residualPsi", storPsi(v))} />
              <Num label={`Test flow (${U.flow})`} value={dispFlow(num(ft["testFlowGpm"]))} step={metric ? 100 : 50} onChange={(v) => setFlow("testFlowGpm", storFlow(v))} />
            </Row>
          )}
          <div style={hint}>{str(ws["supplyType"], "flow-test") === "fixed-pressure" ? "Gravity / elevated tank — a roughly constant head regardless of flow. Leave the pressure blank to derive it from the reservoir height below ((base + height − source elev) × 0.433)." : "City flow test — pressure drops with flow (N¹·⁸⁵ curve)."} A fire pump in the section below boosts either supply.</div>
        </Section>

        {/* Suction */}
        <Section title="Pump suction line">
          <label style={checkRow}>
            <input type="checkbox" checked={!!model.network.suction} onChange={(e) => toggleSuc(e.target.checked)} />
            <span>This system has a pump suction line</span>
          </label>
          {!!model.network.suction && (
            <>
              <Row>
                <Num label={`Size (${U.id})`} value={dispId(num(suc["sizeIn"]))} step={metric ? 10 : 1} onChange={(v) => setSuc("sizeIn", storId(v))} />
                <Num label={`Length (${U.len})`} value={dispLen(num(suc["lengthFt"]))} step={metric ? 1 : 5} onChange={(v) => setSuc("lengthFt", storLen(v))} />
                <Num label="C-factor" value={num(suc["cFactor"])} step={5} onChange={(v) => setSuc("cFactor", v)} />
              </Row>
              <Row>
                <Num label={`Lift (${U.len}, − = flooded)`} value={dispLen(num(suc["liftFt"]))} step={metric ? 0.5 : 1} onChange={(v) => setSuc("liftFt", storLen(v))} />
                <Sel label="To pump node" value={str(suc["toPumpNode"], nodeIds[0] ?? "")} options={nodeIds} onChange={(v) => setSuc("toPumpNode", v)} />
              </Row>
            </>
          )}
        </Section>

        {/* Reservoir */}
        <Section title="Reservoir / storage tank">
          <label style={checkRow}>
            <input type="checkbox" checked={!!model.network.reservoir} onChange={(e) => toggleRes(e.target.checked)} />
            <span>This system has a reservoir / tank</span>
          </label>
          {!!model.network.reservoir && (
            <>
              <Row>
                <Sel label="Kind" value={str(res["kind"], "ground-tank")} options={["ground-tank", "elevated-tank", "reservoir", "break-tank"]} onChange={(v) => setRes("kind", v)} />
                <Num label={`Capacity (${U.gal})`} value={dispGal(num(res["capacityGal"]))} step={metric ? 5000 : 1000} onChange={(v) => setRes("capacityGal", storGal(v))} />
              </Row>
              <Row>
                <Num label={`Height (${U.len})`} value={dispLen(num(res["heightFt"]))} step={metric ? 0.5 : 1} onChange={(v) => setRes("heightFt", storLen(v))} />
                <Num label={`Length (${U.len})`} value={dispLen(num(res["lengthFt"]))} step={metric ? 0.5 : 1} onChange={(v) => setRes("lengthFt", storLen(v))} />
                <Num label={`Width (${U.len})`} value={dispLen(num(res["widthFt"]))} step={metric ? 0.5 : 1} onChange={(v) => setRes("widthFt", storLen(v))} />
              </Row>
              <Row>
                <Num label={`Base elevation (${U.len})`} value={dispLen(num(res["baseElevationFt"]))} step={metric ? 0.5 : 1} onChange={(v) => setRes("baseElevationFt", storLen(v))} />
                <Sel label="Connected node" value={str(res["connectedNode"], nodeIds[0] ?? "")} options={nodeIds} onChange={(v) => setRes("connectedNode", v)} />
              </Row>
            </>
          )}
        </Section>

        {/* Custom pipe materials */}
        <Section title="Custom pipe materials">
          <div style={hint}>Define proprietary pipe materials (a Hazen-Williams C and optional D-W roughness, using a standard schedule's bore). They appear in every Material dropdown and drive the solver + reports. ⚠ Verify against the manufacturer's data.</div>
          {customMats.length > 0 && (
            <div style={tableScroll}>
              <table style={table}>
                <thead><tr>{["Label", "C-factor", "Roughness (mm)", "Bore from", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {customMats.map((m, i) => (
                    <tr key={m.id} style={i % 2 ? { background: C.zebra } : undefined}>
                      <td style={td}><input style={cellInput} value={m.label} onChange={(e) => updCustomMat(i, { label: e.target.value })} /></td>
                      <td style={td}><NumCell value={m.cFactor} onChange={(v) => updCustomMat(i, { cFactor: v ?? 120 })} /></td>
                      <td style={td}><NumCell value={m.roughnessMm} onChange={(v) => updCustomMat(i, { roughnessMm: v })} /></td>
                      <td style={td}><select style={{ ...cellInput, width: 140 }} value={m.basedOn ?? "steel-sch40"} onChange={(e) => updCustomMat(i, { basedOn: e.target.value })}>{MATERIAL_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select></td>
                      <td style={td}><button style={btnDanger} onClick={() => delCustomMat(i)} title="Delete material">✕</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div><button style={btnGhost} onClick={addCustomMat}>+ Add material</button></div>
        </Section>
      </div>

      {/* Nodes */}
      <div style={{ ...card, padding: 14 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Nodes · {nodes.length}{fq ? ` · ${nodes.filter(nodeMatch).length} match` : ""}</span>
          <span style={{ flex: 1 }} />
          <button style={btnGhost} onClick={() => onChange(cleanupModel(model))} title="Remove nodes connected to no pipe">Cleanup</button>
          <button style={btnGhost} onClick={renumber} title="Renumber nodes 1…N and pipes P-1…">Renumber 1…N</button>
          <button style={btnPrimary} onClick={addNode}>+ Add node</button>
        </div>
        <div style={tableScroll}>
          <table style={table}>
            <thead><tr>{["#", "Type", "Sprinkler", `Elevation (${U.len})`, `K (${U.k})`, `Coverage (${U.area})`, `Fixed flow (${U.flow})`, "Note", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {nodes.map((n, i) => {
                if (!nodeMatch(n)) return null;
                const spk = n.type === "sprinkler";
                return (
                  <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.primary }}>{n.id}</td>
                    <td style={td}><Cell><select style={cellInput} value={n.type} onChange={(e) => setNode(i, { type: e.target.value })}>{NODE_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}</select></Cell></td>
                    <td style={td}>{spk ? <SprinklerSel value={str(n.sin)} dispK={dispK} onPick={(p) => setNode(i, { sin: p.sin, manufacturer: p.manufacturer, model: p.model, kFactor: p.kImperial, sprinkler: p.orientation, tempRatingF: p.tempRatingsF[0], response: p.response })} /> : <Dim>—</Dim>}</td>
                    <td style={td}><NumCell value={dispLen(n.elevationFt)} onChange={(v) => setNode(i, { elevationFt: storLen(v) ?? 0 })} /></td>
                    <td style={td}>{spk ? <NumCell value={dispK(n.kFactor)} onChange={(v) => setNode(i, { kFactor: storK(v) })} /> : <Dim>—</Dim>}</td>
                    <td style={td}>{spk ? <NumCell value={dispArea(n.coverageAreaFt2)} onChange={(v) => setNode(i, { coverageAreaFt2: storArea(v) })} /> : <Dim>—</Dim>}</td>
                    <td style={td} title="Fixed hose/hydrant demand for junction & hose-station nodes (sprinklers flow Q=K√P)">{spk ? <Dim>—</Dim> : <NumCell value={dispFlow(n.flowGpm)} onChange={(v) => setNode(i, { flowGpm: storFlow(v) })} />}</td>
                    <td style={td}><input style={cellInput} value={n.note ?? ""} onChange={(e) => setNode(i, { note: e.target.value })} /></td>
                    <td style={td}><button style={btnDanger} onClick={() => delNode(i)} title="Delete node">✕</button></td>
                  </tr>
                );
              })}
              {fq && nodes.length > 0 && nodes.filter(nodeMatch).length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={9}>No nodes match “{find}”.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipes */}
      <div style={{ ...card, padding: 14 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Pipes · {pipes.length}{fq ? ` · ${pipes.filter(pipeMatch).length} match` : ""}</span>
          <span style={{ flex: 1 }} />
          <label style={{ ...checkRow, marginRight: 10 }} title="Show material, C-factor, ID override, added length, fitting codes, ΔElevation and fixed ΔP columns">
            <input type="checkbox" checked={showAdv} onChange={(e) => setShowAdv(e.target.checked)} />
            <span>Advanced columns</span>
          </label>
          <button style={btnPrimary} onClick={addPipe} disabled={nodes.length < 2}>+ Add pipe</button>
        </div>
        {pipes.length > 1 && (
          <div style={bulkBar}>
            <span style={{ fontWeight: 700, color: C.muted }}>Bulk edit · where role</span>
            <select style={{ ...cellInput, width: 110 }} value={bulkRole} onChange={(e) => setBulkRole(e.target.value)}>
              <option value="">(all)</option>
              {PIPE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <span style={{ color: C.muted }}>set →</span>
            <select style={{ ...cellInput, width: 124 }} value="" onChange={(e) => { if (e.target.value) bulkApply({ material: e.target.value, cFactor: undefined }); }}><option value="">material…</option>{matOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
            <select style={{ ...cellInput, width: 64 }} value="" onChange={(e) => { if (e.target.value) bulkApply({ nominalSize: e.target.value }); }}><option value="">size…</option>{NOMINAL_SIZES.map((s) => <option key={s} value={s}>{s}"</option>)}</select>
            <select style={{ ...cellInput, width: 110 }} value="" onChange={(e) => { if (e.target.value) bulkApply({ role: e.target.value }); }}><option value="">role…</option>{PIPE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}</select>
            <span style={{ color: C.muted }}>({pipes.filter(bulkMatch).length} match)</span>
            {bulkNote && <span style={{ color: C.good, fontWeight: 700 }}>✓ {bulkNote}</span>}
          </div>
        )}
        <div style={tableScroll}>
          <table style={table}>
            <thead><tr>{["#", "From", "To", "Role", "Size", ...(showAdv ? ["Material", "C", `ID (${U.id})`] : []), `Length (${U.len})`, ...(showAdv ? [`Add'l (${U.len})`, "Fittings"] : []), "Direction", ...(showAdv ? [`ΔElev (${U.len})`, "Fixed ΔP"] : []), ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {pipes.map((p, i) => pipeMatch(p) ? (
                <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                  <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.from} onChange={(v) => setPipe(i, { from: v })} /></td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.to} onChange={(v) => setPipe(i, { to: v })} /></td>
                  <td style={td}><select style={cellInput} value={p.role ?? "branch-line"} onChange={(e) => setPipe(i, { role: e.target.value })}>{PIPE_ROLES.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  <td style={td}><select style={{ ...cellInput, width: 64 }} value={p.nominalSize ?? "1"} onChange={(e) => setPipe(i, { nominalSize: e.target.value, ...(p.fittingCode ? { fittings: parseFittingCodes(p.fittingCode, e.target.value) as Pipe["fittings"] } : {}) })}>{NOMINAL_SIZES.map((o) => <option key={o} value={o}>{o}"</option>)}</select></td>
                  {showAdv && <>
                    <td style={td}><select style={{ ...cellInput, width: 130 }} value={p.material ?? "steel-sch40"} onChange={(e) => setPipe(i, { material: e.target.value })}>{matOptions.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></td>
                    <td style={td}><NumCell value={effC(p)} onChange={(v) => setPipe(i, { cFactor: v })} /></td>
                    <td style={td}><NumCell value={dispId(p.internalDiameterIn)} onChange={(v) => setPipe(i, v === undefined ? { idOverride: false, internalDiameterIn: undefined } : { idOverride: true, internalDiameterIn: storId(v) })} /></td>
                  </>}
                  <td style={td}><NumCell value={dispLen(p.lengthFt)} onChange={(v) => setPipe(i, { lengthFt: storLen(v) ?? 0 })} /></td>
                  {showAdv && <>
                    <td style={td}><NumCell value={dispLen(p.additionalLengthFt)} onChange={(v) => setPipe(i, { additionalLengthFt: storLen(v) })} /></td>
                    <td style={td}><input style={{ ...cellInput, width: 70 }} value={p.fittingCode ?? ""} placeholder="2E 1T" title="Fitting codes: E elbow, T tee, GV/BV/CV valves" onChange={(e) => setPipe(i, { fittingCode: e.target.value, fittings: parseFittingCodes(e.target.value, p.nominalSize ?? "1") as Pipe["fittings"] })} /></td>
                  </>}
                  <td style={td}>
                    <select style={{ ...cellInput, width: 92 }} value={p.direction ?? ""} onChange={(e) => setPipe(i, { direction: (e.target.value || undefined) as Direction | undefined })}>
                      <option value="">(auto)</option>
                      {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
                    </select>
                  </td>
                  {showAdv && <>
                    <td style={td}><NumCell value={dispLen(p.elevationChangeFt)} onChange={(v) => setPipe(i, { elevationChangeFt: storLen(v) })} /></td>
                    <td style={td}><NumCell value={p.fixedDropPsi} onChange={(v) => setPipe(i, { fixedDropPsi: v })} /></td>
                  </>}
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={splitBtn} onClick={() => splitPipe(i)} title="Divide pipe (insert a node at the midpoint)">⊟ Split</button>
                      <button style={btnDanger} onClick={() => delPipe(i)} title="Delete pipe">✕</button>
                    </div>
                  </td>
                </tr>
              ) : null)}
              {pipes.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={showAdv ? 15 : 8}>No pipes yet — add nodes, then connect them. The first node (#1) is the supply source.</td></tr>}
              {fq && pipes.length > 0 && pipes.filter(pipeMatch).length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={showAdv ? 15 : 8}>No pipes match “{find}”.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={hint}>Tip: direction codes route the schematic — E/W = ±X, N/S = ±Y, U/D = ±Z. Leave “(auto)” to route by pipe role. Internal diameter comes from the material + nominal size; C-factor defaults from the material (override per-row).</div>
      </div>

      {/* Valves */}
      <div style={{ ...card, padding: 14 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Valves &amp; fittings · {valves.length}</span>
          <span style={{ flex: 1 }} />
          <button style={btnPrimary} onClick={addValve} disabled={pipes.length === 0}>+ Add valve</button>
        </div>
        <div style={tableScroll}>
          <table style={table}>
            <thead><tr>{["#", "Type", "On pipe", "Size (in)", "Equiv. length (ft)", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {valves.map((v, i) => (
                <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                  <td style={{ ...td, fontWeight: 700, color: C.accent }}>{v.id}</td>
                  <td style={td}><select style={cellInput} value={v.type} onChange={(e) => setValve(i, { type: e.target.value, equivalentLengthFt: VALVE_EQUIV_FT[e.target.value] ?? v.equivalentLengthFt })}>{VALVE_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  <td style={td}><select style={{ ...cellInput, width: 72 }} value={String(v.onPipe ?? "")} onChange={(e) => setValve(i, { onPipe: e.target.value })}>{pipes.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}</select></td>
                  <td style={td}><input style={{ ...cellInput, width: 56 }} value={String(v.sizeIn ?? "")} onChange={(e) => setValve(i, { sizeIn: e.target.value })} /></td>
                  <td style={td}><NumCell value={typeof v.equivalentLengthFt === "number" ? v.equivalentLengthFt : undefined} onChange={(x) => setValve(i, { equivalentLengthFt: x })} /></td>
                  <td style={td}><button style={btnDanger} onClick={() => delValve(i)} title="Delete valve">✕</button></td>
                </tr>
              ))}
              {valves.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={6}>No valves — add gate / check / alarm / backflow etc. Equivalent length adds to the host pipe in the calc.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Fire pump */}
      <div style={{ ...card, padding: 16 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Fire pump — datasheet &amp; test curves</span>
          <span style={{ flex: 1 }} />
          <label style={checkRow}>
            <input type="checkbox" checked={!!pump} onChange={(e) => togglePump(e.target.checked)} />
            <span>System has a fire pump</span>
          </label>
        </div>
        {pump && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <Row>
              <Txt label="Make" value={str(pds["make"])} onChange={(v) => setDs("make", v)} />
              <Txt label="Model" value={str(pds["model"])} onChange={(v) => setDs("model", v)} />
              <Sel label="Type" value={str(pds["type"], "horizontal-split-case")} options={PUMP_TYPES} onChange={(v) => setDs("type", v)} />
              <Sel label="Driver" value={str(pds["driver"], "electric")} options={PUMP_DRIVERS} onChange={(v) => setDs("driver", v)} />
            </Row>
            <Row>
              <Num label={`Rated flow (${U.flow})`} value={dispFlow(num(pds["ratedFlowGpm"]))} step={metric ? 100 : 50} onChange={(v) => setDs("ratedFlowGpm", storFlow(v))} />
              <Num label={`Rated pressure (${U.p})`} value={dispPsi(num(pds["ratedPsi"]))} step={metric ? 0.5 : 5} onChange={(v) => setDs("ratedPsi", storPsi(v))} />
              <Num label={`Churn / shutoff (${U.p})`} value={dispPsi(num(pds["churnPsi"]))} step={metric ? 0.5 : 5} onChange={(v) => setDs("churnPsi", storPsi(v))} />
            </Row>
            <Row>
              <Num label={`150% flow (${U.flow})`} value={dispFlow(num(pds["overloadFlowGpm"]))} step={metric ? 100 : 50} onChange={(v) => setDs("overloadFlowGpm", storFlow(v))} />
              <Num label={`150% pressure (${U.p})`} value={dispPsi(num(pds["overloadPsi"]))} step={metric ? 0.5 : 5} onChange={(v) => setDs("overloadPsi", storPsi(v))} />
              <Num label="RPM" value={num(pds["rpm"])} step={100} onChange={(v) => setDs("rpm", v)} />
            </Row>
            <Row>
              <Num label={`Impeller (${U.id})`} value={dispId(num(pds["impellerIn"]))} step={metric ? 1 : 0.1} onChange={(v) => setDs("impellerIn", storId(v))} />
              <Num label="Motor (hp)" value={num(pds["motorHp"])} step={5} onChange={(v) => setDs("motorHp", v)} />
              <Sel label="At node" value={str(pump.atNode, nodeIds[0] ?? "")} options={nodeIds} onChange={(v) => onChange(withModel(model, { network: { ...model.network, pump: { ...pump, atNode: v } } }))} />
            </Row>
            <div style={uploadRow}>
              <span style={fieldLabel}>Datasheet file (PDF / image)</span>
              {pds["attachmentName"] ? (
                <span style={fileChip}>
                  📎 <a href={String(pds["attachmentDataUrl"])} target="_blank" rel="noreferrer" style={{ color: C.primary, fontWeight: 600 }}>{String(pds["attachmentName"])}</a>
                  <button style={btnDanger} onClick={() => setDsMany({ attachmentName: undefined, attachmentDataUrl: undefined })} title="Remove">✕</button>
                </span>
              ) : (
                <label style={uploadBtn}>⤓ Upload datasheet
                  <input type="file" accept=".pdf,image/*" style={{ display: "none" }} onChange={onUploadDatasheet} />
                </label>
              )}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              <CurveTable title="Rated curve (datasheet)" rpm={false} pts={ratedCurve} onChange={(p) => setCurve("ratedCurve", p)} u={curveConv} />
              <CurveTable title="Shop test (field/factory)" rpm pts={shopTest} onChange={(p) => setCurve("shopTest", p)} u={curveConv} />
            </div>
            <div style={hint}>The rated flow/pressure/churn here feed the supply curve in the calc. Curves drive the three pump report sheets (datasheet · hydraulic · shop-test).</div>
          </div>
        )}
      </div>
    </div>
  );
}

type CurveConv = { dispF: (v?: number) => number | undefined; storF: (v?: number) => number | undefined; dispP: (v?: number) => number | undefined; storP: (v?: number) => number | undefined; uFlow: string; uP: string };
function CurveTable({ title, pts, rpm, onChange, u }: { title: string; pts: PumpCurvePoint[]; rpm: boolean; onChange: (p: PumpCurvePoint[]) => void; u: CurveConv }): JSX.Element {
  const set = (i: number, patch: Partial<PumpCurvePoint>) => { const p = pts.slice(); p[i] = { ...p[i]!, ...patch }; onChange(p); };
  const add = () => onChange([...pts, { flowGpm: 0, psi: 0 }]);
  const del = (i: number) => onChange(pts.filter((_, j) => j !== i));
  return (
    <div style={{ ...card, padding: 10 }}>
      <div style={tableHead}>
        <span style={{ ...sectionTitle, marginBottom: 0 }}>{title}</span>
        <span style={{ flex: 1 }} />
        <button style={btnGhost} onClick={add}>+ Point</button>
      </div>
      <table style={table}>
        <thead><tr>{[`Flow (${u.uFlow})`, `Pressure (${u.uP})`, ...(rpm ? ["RPM"] : []), ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {pts.map((pt, i) => (
            <tr key={i}>
              <td style={td}><NumCell value={u.dispF(pt.flowGpm)} onChange={(v) => set(i, { flowGpm: u.storF(v) ?? 0 })} /></td>
              <td style={td}><NumCell value={u.dispP(pt.psi)} onChange={(v) => set(i, { psi: u.storP(v) ?? 0 })} /></td>
              {rpm && <td style={td}><NumCell value={pt.rpm} onChange={(v) => set(i, { rpm: v })} /></td>}
              <td style={td}><button style={btnDanger} onClick={() => del(i)} title="Delete point">✕</button></td>
            </tr>
          ))}
          {pts.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={rpm ? 4 : 3}>No points.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ---- small field components -------------------------------------------
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return <div style={{ ...card, padding: 16 }}><div style={sectionTitle}>{title}</div><div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{children}</div></div>;
}
function Row({ children }: { children: ReactNode }): JSX.Element {
  return <div style={{ display: "flex", gap: 10 }}>{children}</div>;
}
function Txt({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }): JSX.Element {
  return <label style={{ ...field, flex: 1 }}><span style={fieldLabel}>{label}</span><input style={input} value={value} onChange={(e) => onChange(e.target.value)} /></label>;
}
function TxtArea({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }): JSX.Element {
  return <label style={{ ...field, flex: 1 }}><span style={fieldLabel}>{label}</span><textarea style={{ ...input, minHeight: 60, resize: "vertical", fontFamily: "inherit", lineHeight: 1.4 }} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /></label>;
}
function Num({ label, value, step, onChange }: { label: string; value: number | undefined; step?: number; onChange: (v: number | undefined) => void }): JSX.Element {
  const [raw, setRaw] = useState<string>(value === undefined ? "" : String(value));
  useEffect(() => setRaw(value === undefined ? "" : String(value)), [value]);
  const commit = () => onChange(raw.trim() === "" ? undefined : Number(raw));
  return <label style={{ ...field, flex: 1 }}><span style={fieldLabel}>{label}</span><input type="number" step={step} style={input} value={raw} onFocus={(e) => e.target.select()} onChange={(e) => setRaw(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} /></label>;
}
function Sel({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }): JSX.Element {
  return <label style={{ ...field, flex: 1 }}><span style={fieldLabel}>{label}</span><select style={select} value={value} onChange={(e) => onChange(e.target.value)}>{options.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>;
}
function Cell({ children }: { children: ReactNode }): JSX.Element { return <>{children}</>; }
function Dim({ children }: { children: ReactNode }): JSX.Element { return <span style={{ color: C.muted }}>{children}</span>; }
function NumCell({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }): JSX.Element {
  const [raw, setRaw] = useState<string>(value === undefined ? "" : String(value));
  useEffect(() => setRaw(value === undefined ? "" : String(value)), [value]);
  const commit = () => onChange(raw.trim() === "" ? undefined : Number(raw));
  return <input type="number" style={{ ...cellInput, width: 76, textAlign: "right" }} value={raw} onFocus={(e) => e.target.select()} onChange={(e) => setRaw(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />;
}
function NodeSel({ ids, value, onChange }: { ids: string[]; value: string; onChange: (v: string) => void }): JSX.Element {
  return <select style={{ ...cellInput, width: 58 }} value={value} onChange={(e) => onChange(e.target.value)}>{ids.map((id) => <option key={id} value={id}>{id}</option>)}</select>;
}
function SprinklerSel({ value, dispK, onPick }: { value: string; dispK: (v?: number) => number | undefined; onPick: (p: SprinklerProfile) => void }): JSX.Element {
  return (
    <select style={{ ...cellInput, width: 168 }} value={value} title="Pick a catalog sprinkler to prefill K / orientation / temp / response" onChange={(e) => { const p = catalog().find((s) => s.sin === e.target.value); if (p) onPick(p); }}>
      <option value="">(custom)</option>
      {catalog().map((s) => <option key={s.sin} value={s.sin}>{`${s.manufacturer} ${s.sin} K${dispK(s.kImperial)}${s.audit ? " ⚠" : ""}`}</option>)}
    </select>
  );
}

const str = (v: unknown, d = ""): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

const page: CSSProperties = { padding: 16, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const grid2: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(330px, 1fr))", gap: 14, alignItems: "start" };
const checkRow: CSSProperties = { display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: C.ink, cursor: "pointer" };
const tableHead: CSSProperties = { display: "flex", alignItems: "center", gap: 8, marginBottom: 10 };
const tableScroll: CSSProperties = { overflow: "auto", maxHeight: 420, border: `1px solid ${C.line}`, borderRadius: 8 };
const table: CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: FONT };
const cellInput: CSSProperties = { fontSize: 12.5, padding: "3px 5px", border: `1px solid ${C.line}`, borderRadius: 5, background: "#fff", color: C.ink, fontFamily: FONT, width: "100%", boxSizing: "border-box" };
const hint: CSSProperties = { fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5 };
const validBanner: CSSProperties = { ...card, padding: "12px 16px", borderLeft: `4px solid ${C.warn}`, background: "#fffbeb" };
const bulkBar: CSSProperties = { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11.5, color: C.ink, background: C.band, border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 10px", marginBottom: 8 };
const splitBtn: CSSProperties = { fontSize: 11, fontWeight: 600, color: C.accent, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer", whiteSpace: "nowrap" };
const uploadRow: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const uploadBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.primary, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 12px", cursor: "pointer" };
const fileChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "#f6f9fd", border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 10px" };
