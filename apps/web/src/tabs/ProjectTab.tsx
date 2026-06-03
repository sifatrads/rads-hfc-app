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
  DIRECTIONS, DIRECTION_LABEL, renumberNetwork, normalizePipe, withModel, splitPipeInModel,
} from "../network-edit";
import { defaultCFactorForMaterial, pipeMaterial } from "@rads/standards-engine";
import { C, FONT, card, sectionTitle, field, fieldLabel, input, select, btnPrimary, btnGhost, btnDanger, th, td } from "../ui";

export function ProjectTab({ model, onChange }: { model: ProjectModel; onChange: (m: ProjectModel) => void }): JSX.Element {
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
  // Effective C-factor a pipe will solve with (material default, derated for dry
  // steel) — shown in the C cell so it always matches the calc.
  const dryFill = model.meta.fillType === "dry" || model.meta.fillType === "preaction";
  const effC = (p: Pipe): number => {
    if (typeof p.cFactor === "number") return p.cFactor;
    const c = defaultCFactorForMaterial(p.material);
    return dryFill && pipeMaterial(p.material).family === "steel" ? Math.min(c, 100) : c;
  };

  // ---- committers ------------------------------------------------------
  const setMeta = (k: string, v: unknown) => onChange(withModel(model, { meta: { ...model.meta, [k]: v } }));
  const setBasis = (k: string, v: unknown) => onChange(withModel(model, { designBasis: { ...ds, [k]: v } }));
  const setSupply = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, [k]: v } }));
  const setFlow = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, flowTest: { ...ft, [k]: v } } }));
  const setRes = (k: string, v: unknown) => onChange(withModel(model, { network: { ...model.network, reservoir: { ...res, [k]: v } } }));
  const toggleRes = (on: boolean) =>
    onChange(withModel(model, {
      network: { ...model.network, reservoir: on ? { kind: "ground-tank", capacityGal: 20000, heightFt: 12, lengthFt: 20, widthFt: 20, connectedNode: nodeIds[0] } : undefined },
    }));

  // ── suction line ──
  const setSuc = (k: string, v: unknown) => onChange(withModel(model, { network: { ...model.network, suction: { ...suc, [k]: v } } }));
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
    commitStructural([...nodes, { id: String(nodes.length + 1), type: "sprinkler", elevationFt: last?.elevationFt ?? 0, kFactor: 5.6, coverageAreaFt2: 100 }], pipes);
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

  const renumber = () => commitStructural(nodes, pipes);

  return (
    <div style={page}>
      <div style={grid2}>
        {/* Project info */}
        <Section title="Project information">
          <Row>
            <Txt label="Project name" value={str(model.meta.name)} onChange={(v) => setMeta("name", v)} />
            <Txt label="Project no." value={str(model.meta.id)} onChange={(v) => setMeta("id", v)} />
          </Row>
          <Row>
            <Sel label="System" value={str(model.meta.systemType, "sprinkler")} options={["sprinkler", "standpipe"]} onChange={(v) => setMeta("systemType", v)} />
            <Sel label="Fill type" value={str(model.meta.fillType, "wet")} options={["wet", "dry", "preaction", "deluge"]} onChange={(v) => setMeta("fillType", v)} />
            <Sel label="Hazard" value={str(model.meta.hazardClass, "oh2")} options={["lh", "oh1", "oh2", "eh1", "eh2"]} onChange={(v) => setMeta("hazardClass", v)} />
            <Sel label="Units" value={str(model.meta.units, "imperial")} options={["imperial", "metric"]} onChange={(v) => setMeta("units", v)} />
          </Row>
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
        </Section>

        {/* Design basis */}
        <Section title="Design basis">
          <Row>
            <Num label="Density (gpm/ft²)" value={num(ds["densityGpmFt2"])} step={0.01} onChange={(v) => setBasis("densityGpmFt2", v)} />
            <Num label="Design area (ft²)" value={num(ds["designAreaFt2"])} step={50} onChange={(v) => setBasis("designAreaFt2", v)} />
          </Row>
          <Row>
            <Num label="Sprinkler K" value={num(ds["sprinklerKFactor"])} step={0.1} onChange={(v) => setBasis("sprinklerKFactor", v)} />
            <Num label="Operating heads" value={num(ds["operatingSprinklers"])} step={1} onChange={(v) => setBasis("operatingSprinklers", v)} />
          </Row>
          <Row>
            <Num label="Min head pressure (psi)" value={num(ds["minSprinklerPressurePsi"])} step={1} onChange={(v) => setBasis("minSprinklerPressurePsi", v)} />
            <Num label="Hose allowance (gpm)" value={num(ds["hoseAllowanceGpm"])} step={50} onChange={(v) => setBasis("hoseAllowanceGpm", v)} />
          </Row>
        </Section>

        {/* Water supply */}
        <Section title="Water supply (city flow test)">
          <Row>
            <Num label="Static (psi)" value={num(ft["staticPsi"])} step={1} onChange={(v) => setFlow("staticPsi", v)} />
            <Num label="Residual (psi)" value={num(ft["residualPsi"])} step={1} onChange={(v) => setFlow("residualPsi", v)} />
            <Num label="Test flow (gpm)" value={num(ft["testFlowGpm"])} step={50} onChange={(v) => setFlow("testFlowGpm", v)} />
          </Row>
          <div style={hint}>Add a fire pump in the Fire Pump section below — it feeds this supply curve.</div>
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
                <Num label="Size (in)" value={num(suc["sizeIn"])} step={1} onChange={(v) => setSuc("sizeIn", v)} />
                <Num label="Length (ft)" value={num(suc["lengthFt"])} step={5} onChange={(v) => setSuc("lengthFt", v)} />
                <Num label="C-factor" value={num(suc["cFactor"])} step={5} onChange={(v) => setSuc("cFactor", v)} />
              </Row>
              <Row>
                <Num label="Lift (ft, − = flooded)" value={num(suc["liftFt"])} step={1} onChange={(v) => setSuc("liftFt", v)} />
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
                <Num label="Capacity (gal)" value={num(res["capacityGal"])} step={1000} onChange={(v) => setRes("capacityGal", v)} />
              </Row>
              <Row>
                <Num label="Height (ft)" value={num(res["heightFt"])} step={1} onChange={(v) => setRes("heightFt", v)} />
                <Num label="Length (ft)" value={num(res["lengthFt"])} step={1} onChange={(v) => setRes("lengthFt", v)} />
                <Num label="Width (ft)" value={num(res["widthFt"])} step={1} onChange={(v) => setRes("widthFt", v)} />
              </Row>
              <Row>
                <Num label="Base elevation (ft)" value={num(res["baseElevationFt"])} step={1} onChange={(v) => setRes("baseElevationFt", v)} />
                <Sel label="Connected node" value={str(res["connectedNode"], nodeIds[0] ?? "")} options={nodeIds} onChange={(v) => setRes("connectedNode", v)} />
              </Row>
            </>
          )}
        </Section>
      </div>

      {/* Nodes */}
      <div style={{ ...card, padding: 14 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Nodes · {nodes.length}</span>
          <span style={{ flex: 1 }} />
          <button style={btnGhost} onClick={renumber} title="Renumber nodes 1…N and pipes P-1…">Renumber 1…N</button>
          <button style={btnPrimary} onClick={addNode}>+ Add node</button>
        </div>
        <div style={tableScroll}>
          <table style={table}>
            <thead><tr>{["#", "Type", "Elevation (ft)", "K-factor", "Coverage (ft²)", "Fixed flow (gpm)", "Note", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {nodes.map((n, i) => {
                const spk = n.type === "sprinkler";
                return (
                  <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.primary }}>{n.id}</td>
                    <td style={td}><Cell><select style={cellInput} value={n.type} onChange={(e) => setNode(i, { type: e.target.value })}>{NODE_TYPES.map((o) => <option key={o} value={o}>{o}</option>)}</select></Cell></td>
                    <td style={td}><NumCell value={n.elevationFt} onChange={(v) => setNode(i, { elevationFt: v ?? 0 })} /></td>
                    <td style={td}>{spk ? <NumCell value={n.kFactor} onChange={(v) => setNode(i, { kFactor: v })} /> : <Dim>—</Dim>}</td>
                    <td style={td}>{spk ? <NumCell value={n.coverageAreaFt2} onChange={(v) => setNode(i, { coverageAreaFt2: v })} /> : <Dim>—</Dim>}</td>
                    <td style={td} title="Fixed hose/hydrant demand for junction & hose-station nodes (sprinklers flow Q=K√P)">{spk ? <Dim>—</Dim> : <NumCell value={n.flowGpm} onChange={(v) => setNode(i, { flowGpm: v })} />}</td>
                    <td style={td}><input style={cellInput} value={n.note ?? ""} onChange={(e) => setNode(i, { note: e.target.value })} /></td>
                    <td style={td}><button style={btnDanger} onClick={() => delNode(i)} title="Delete node">✕</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pipes */}
      <div style={{ ...card, padding: 14 }}>
        <div style={tableHead}>
          <span style={sectionTitle}>Pipes · {pipes.length}</span>
          <span style={{ flex: 1 }} />
          <button style={btnPrimary} onClick={addPipe} disabled={nodes.length < 2}>+ Add pipe</button>
        </div>
        <div style={tableScroll}>
          <table style={table}>
            <thead><tr>{["#", "From", "To", "Role", "Size", "Material", "C", "ID (in)", "Length (ft)", "Add'l (ft)", "Direction", "ΔElev (ft)", "Fixed ΔP", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {pipes.map((p, i) => (
                <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                  <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.from} onChange={(v) => setPipe(i, { from: v })} /></td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.to} onChange={(v) => setPipe(i, { to: v })} /></td>
                  <td style={td}><select style={cellInput} value={p.role ?? "branch-line"} onChange={(e) => setPipe(i, { role: e.target.value })}>{PIPE_ROLES.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  <td style={td}><select style={{ ...cellInput, width: 64 }} value={p.nominalSize ?? "1"} onChange={(e) => setPipe(i, { nominalSize: e.target.value })}>{NOMINAL_SIZES.map((o) => <option key={o} value={o}>{o}"</option>)}</select></td>
                  <td style={td}><select style={{ ...cellInput, width: 130 }} value={p.material ?? "steel-sch40"} onChange={(e) => setPipe(i, { material: e.target.value })}>{MATERIAL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></td>
                  <td style={td}><NumCell value={effC(p)} onChange={(v) => setPipe(i, { cFactor: v })} /></td>
                  <td style={td}><NumCell value={p.internalDiameterIn} onChange={(v) => setPipe(i, v === undefined ? { idOverride: false, internalDiameterIn: undefined } : { idOverride: true, internalDiameterIn: v })} /></td>
                  <td style={td}><NumCell value={p.lengthFt} onChange={(v) => setPipe(i, { lengthFt: v ?? 0 })} /></td>
                  <td style={td}><NumCell value={p.additionalLengthFt} onChange={(v) => setPipe(i, { additionalLengthFt: v })} /></td>
                  <td style={td}>
                    <select style={{ ...cellInput, width: 92 }} value={p.direction ?? ""} onChange={(e) => setPipe(i, { direction: (e.target.value || undefined) as Direction | undefined })}>
                      <option value="">(auto)</option>
                      {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
                    </select>
                  </td>
                  <td style={td}><NumCell value={p.elevationChangeFt} onChange={(v) => setPipe(i, { elevationChangeFt: v })} /></td>
                  <td style={td}><NumCell value={p.fixedDropPsi} onChange={(v) => setPipe(i, { fixedDropPsi: v })} /></td>
                  <td style={td}>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button style={splitBtn} onClick={() => splitPipe(i)} title="Divide pipe (insert a node at the midpoint)">⊟ Split</button>
                      <button style={btnDanger} onClick={() => delPipe(i)} title="Delete pipe">✕</button>
                    </div>
                  </td>
                </tr>
              ))}
              {pipes.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={14}>No pipes yet — add nodes, then connect them. The first node (#1) is the supply source.</td></tr>}
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
              <Num label="Rated flow (gpm)" value={num(pds["ratedFlowGpm"])} step={50} onChange={(v) => setDs("ratedFlowGpm", v)} />
              <Num label="Rated pressure (psi)" value={num(pds["ratedPsi"])} step={5} onChange={(v) => setDs("ratedPsi", v)} />
              <Num label="Churn / shutoff (psi)" value={num(pds["churnPsi"])} step={5} onChange={(v) => setDs("churnPsi", v)} />
            </Row>
            <Row>
              <Num label="150% flow (gpm)" value={num(pds["overloadFlowGpm"])} step={50} onChange={(v) => setDs("overloadFlowGpm", v)} />
              <Num label="150% pressure (psi)" value={num(pds["overloadPsi"])} step={5} onChange={(v) => setDs("overloadPsi", v)} />
              <Num label="RPM" value={num(pds["rpm"])} step={100} onChange={(v) => setDs("rpm", v)} />
            </Row>
            <Row>
              <Num label="Impeller (in)" value={num(pds["impellerIn"])} step={0.1} onChange={(v) => setDs("impellerIn", v)} />
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
              <CurveTable title="Rated curve (datasheet)" rpm={false} pts={ratedCurve} onChange={(p) => setCurve("ratedCurve", p)} />
              <CurveTable title="Shop test (field/factory)" rpm pts={shopTest} onChange={(p) => setCurve("shopTest", p)} />
            </div>
            <div style={hint}>The rated flow/pressure/churn here feed the supply curve in the calc. Curves drive the three pump report sheets (datasheet · hydraulic · shop-test).</div>
          </div>
        )}
      </div>
    </div>
  );
}

function CurveTable({ title, pts, rpm, onChange }: { title: string; pts: PumpCurvePoint[]; rpm: boolean; onChange: (p: PumpCurvePoint[]) => void }): JSX.Element {
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
        <thead><tr>{["Flow (gpm)", "Pressure (psi)", ...(rpm ? ["RPM"] : []), ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
        <tbody>
          {pts.map((pt, i) => (
            <tr key={i}>
              <td style={td}><NumCell value={pt.flowGpm} onChange={(v) => set(i, { flowGpm: v ?? 0 })} /></td>
              <td style={td}><NumCell value={pt.psi} onChange={(v) => set(i, { psi: v ?? 0 })} /></td>
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
const splitBtn: CSSProperties = { fontSize: 11, fontWeight: 600, color: C.accent, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 5, padding: "3px 7px", cursor: "pointer", whiteSpace: "nowrap" };
const uploadRow: CSSProperties = { display: "flex", alignItems: "center", gap: 12 };
const uploadBtn: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, fontWeight: 600, color: C.primary, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 7, padding: "6px 12px", cursor: "pointer" };
const fileChip: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 8, fontSize: 12.5, background: "#f6f9fd", border: `1px solid ${C.line}`, borderRadius: 7, padding: "5px 10px" };
