/**
 * Project / Data-Entry tab — build or edit a project entirely in-app. Project
 * info, design basis, water supply (+ optional fire pump), reservoir, and the
 * node + pipe grids (Canute-style: size + length + direction code → geometry).
 * Every edit re-parses the model and bubbles up so the 3D view + results stay
 * live. Nodes are numbered 1..N; "Renumber" normalizes ids after edits.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { ProjectModel, NetworkNode, Pipe, Direction } from "@rads/model";
import {
  NOMINAL_SIZES, PIPE_ROLES, NODE_TYPES, DIRECTIONS, DIRECTION_LABEL,
  renumberNetwork, normalizePipe, withModel,
} from "../network-edit";
import { C, FONT, card, sectionTitle, field, fieldLabel, input, select, btnPrimary, btnGhost, btnDanger, th, td } from "../ui";

export function ProjectTab({ model, onChange }: { model: ProjectModel; onChange: (m: ProjectModel) => void }): JSX.Element {
  const ds = (model.designBasis ?? {}) as Record<string, unknown>;
  const ws = (model.waterSupply ?? {}) as Record<string, unknown>;
  const ft = (ws["flowTest"] ?? {}) as Record<string, unknown>;
  const fp = (ws["firePump"] ?? {}) as Record<string, unknown>;
  const res = (model.network.reservoir ?? {}) as Record<string, unknown>;
  const nodes = model.network.nodes;
  const pipes = model.network.pipes;
  const nodeIds = useMemo(() => nodes.map((n) => n.id), [nodes]);

  // ---- committers ------------------------------------------------------
  const setMeta = (k: string, v: unknown) => onChange(withModel(model, { meta: { ...model.meta, [k]: v } }));
  const setBasis = (k: string, v: unknown) => onChange(withModel(model, { designBasis: { ...ds, [k]: v } }));
  const setSupply = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, [k]: v } }));
  const setFlow = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, flowTest: { ...ft, [k]: v } } }));
  const setPump = (k: string, v: unknown) => onChange(withModel(model, { waterSupply: { ...ws, type: "city+fire-pump", firePump: { ...fp, [k]: v } } }));
  const togglePump = (on: boolean) =>
    onChange(withModel(model, {
      waterSupply: on
        ? { ...ws, type: "city+fire-pump", firePump: { ratedFlowGpm: 750, ratedPsi: 100, churnPsi: 115 } }
        : { ...ws, type: "city", firePump: undefined },
    }));
  const setRes = (k: string, v: unknown) => onChange(withModel(model, { network: { ...model.network, reservoir: { ...res, [k]: v } } }));
  const toggleRes = (on: boolean) =>
    onChange(withModel(model, {
      network: { ...model.network, reservoir: on ? { kind: "ground-tank", capacityGal: 20000, heightFt: 12, lengthFt: 20, widthFt: 20, connectedNode: nodeIds[0] } : undefined },
    }));

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
            <Sel label="Hazard" value={str(model.meta.hazardClass, "oh2")} options={["lh", "oh1", "oh2", "eh1", "eh2"]} onChange={(v) => setMeta("hazardClass", v)} />
            <Sel label="Units" value={str(model.meta.units, "imperial")} options={["imperial", "metric"]} onChange={(v) => setMeta("units", v)} />
          </Row>
          <Row>
            <Txt label="Standard" value={str(model.meta.standard, "NFPA 13 (2019)")} onChange={(v) => setMeta("standard", v)} />
            <Txt label="Engineer" value={str(model.meta.engineer)} onChange={(v) => setMeta("engineer", v)} />
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
          <label style={checkRow}>
            <input type="checkbox" checked={!!ws["firePump"]} onChange={(e) => togglePump(e.target.checked)} />
            <span>Fire pump on supply</span>
          </label>
          {!!ws["firePump"] && (
            <Row>
              <Num label="Rated flow (gpm)" value={num(fp["ratedFlowGpm"])} step={50} onChange={(v) => setPump("ratedFlowGpm", v)} />
              <Num label="Rated (psi)" value={num(fp["ratedPsi"])} step={5} onChange={(v) => setPump("ratedPsi", v)} />
              <Num label="Churn (psi)" value={num(fp["churnPsi"])} step={5} onChange={(v) => setPump("churnPsi", v)} />
            </Row>
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
            <thead><tr>{["#", "Type", "Elevation (ft)", "K-factor", "Coverage (ft²)", "Note", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
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
            <thead><tr>{["#", "From", "To", "Role", "Size", "Length (ft)", "Direction", "ΔElev (ft)", ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {pipes.map((p, i) => (
                <tr key={i} style={i % 2 ? { background: C.zebra } : undefined}>
                  <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.from} onChange={(v) => setPipe(i, { from: v })} /></td>
                  <td style={td}><NodeSel ids={nodeIds} value={p.to} onChange={(v) => setPipe(i, { to: v })} /></td>
                  <td style={td}><select style={cellInput} value={p.role ?? "branch-line"} onChange={(e) => setPipe(i, { role: e.target.value })}>{PIPE_ROLES.map((o) => <option key={o} value={o}>{o}</option>)}</select></td>
                  <td style={td}><select style={{ ...cellInput, width: 64 }} value={p.nominalSize ?? "1"} onChange={(e) => setPipe(i, { nominalSize: e.target.value })}>{NOMINAL_SIZES.map((o) => <option key={o} value={o}>{o}"</option>)}</select></td>
                  <td style={td}><NumCell value={p.lengthFt} onChange={(v) => setPipe(i, { lengthFt: v ?? 0 })} /></td>
                  <td style={td}>
                    <select style={{ ...cellInput, width: 92 }} value={p.direction ?? ""} onChange={(e) => setPipe(i, { direction: (e.target.value || undefined) as Direction | undefined })}>
                      <option value="">(auto)</option>
                      {DIRECTIONS.map((d) => <option key={d} value={d}>{DIRECTION_LABEL[d]}</option>)}
                    </select>
                  </td>
                  <td style={td}><NumCell value={p.elevationChangeFt} onChange={(v) => setPipe(i, { elevationChangeFt: v })} /></td>
                  <td style={td}><button style={btnDanger} onClick={() => delPipe(i)} title="Delete pipe">✕</button></td>
                </tr>
              ))}
              {pipes.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={9}>No pipes yet — add nodes, then connect them. The first node (#1) is the supply source.</td></tr>}
            </tbody>
          </table>
        </div>
        <div style={hint}>Tip: direction codes route the schematic — E/W = ±X, N/S = ±Y, U/D = ±Z. Leave “(auto)” to route by pipe role. Internal diameter is set from the nominal size (Sch-40).</div>
      </div>
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
