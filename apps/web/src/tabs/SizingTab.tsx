/** Sizing tab — interactive "size as you review": edit each pipe's nominal size
 * or material inline and watch flow / velocity / loss and the supply margin
 * re-solve live (the App re-solves on every model change). Velocity over the
 * NFPA-13 guidance is flagged so you can upsize the bottlenecks first. */
import { useState, type CSSProperties } from "react";
import type { ProjectModel, Pipe } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { MATERIAL_OPTIONS, NOMINAL_SIZES, withModel } from "../network-edit";
import { autoSizeVelocity, autoSizeToPass } from "../auto-size";
import { units } from "../units";
import { C, FONT, card, sectionTitle, select, th, td, tdNum, toneColor } from "../ui";

const VLIMIT = 20; // ft/s — NFPA 13 velocity guidance

export function SizingTab({ model, solution, error, onChange }: { model: ProjectModel; solution: ProjectSolution | null; error?: string; onChange: (m: ProjectModel) => void }): JSX.Element {
  const [worstFirst, setWorstFirst] = useState(false);
  const [hotOnly, setHotOnly] = useState(false);
  const [autoMsg, setAutoMsg] = useState("");
  if (!solution) return <div style={{ ...page, alignItems: "center", justifyContent: "center", color: C.muted }}>{error ? error : "Add nodes, pipes and a water supply to size the system."}</div>;
  const u = units(model);
  const s = solution.summary;
  const pr = solution.results.pipes;
  const pipes = model.network.pipes;

  const setPipe = (id: string, patch: Partial<Pipe>) => onChange(withModel(model, { network: { ...model.network, pipes: pipes.map((p) => (p.id === id ? { ...p, ...patch } : p)) } }));
  // Resizing clears any manual ID override so the new size's default bore applies.
  const resize = (id: string, size: string) => setPipe(id, { nominalSize: size, idOverride: false, internalDiameterIn: undefined });
  const bump = (id: string, dir: 1 | -1) => {
    const p = pipes.find((x) => x.id === id);
    if (!p) return;
    const i = NOMINAL_SIZES.indexOf((p.nominalSize ?? "1") as (typeof NOMINAL_SIZES)[number]);
    const ni = Math.min(NOMINAL_SIZES.length - 1, Math.max(0, (i < 0 ? 2 : i) + dir));
    resize(id, NOMINAL_SIZES[ni]!);
  };
  const doAutoSize = () => {
    const { model: sized, changed, remaining } = autoSizeVelocity(model, VLIMIT);
    if (changed > 0) onChange(sized);
    setAutoMsg(
      changed === 0
        ? remaining ? `${remaining} pipe(s) at the largest size, still over the limit` : "All pipes already within the velocity limit"
        : `Auto-sized ${changed} pipe${changed === 1 ? "" : "s"}${remaining ? ` · ${remaining} still over (maxed)` : " · all within the limit"}`,
    );
    setTimeout(() => setAutoMsg(""), 5000);
  };
  const doAutoPass = () => {
    const { model: sized, changed, passed } = autoSizeToPass(model);
    if (changed > 0) onChange(sized);
    setAutoMsg(
      changed === 0
        ? passed ? "Already passing — supply meets demand" : "Couldn't reduce required pressure — supply may be inadequate (add a pump / larger supply)"
        : passed ? `Upsized ${changed} pipe${changed === 1 ? "" : "s"} → now passing` : `Upsized ${changed} pipe${changed === 1 ? "" : "s"} but still short — supply may be inadequate`,
    );
    setTimeout(() => setAutoMsg(""), 6000);
  };

  const rows = pipes
    .map((p) => ({ p, r: pr[p.id], v: pr[p.id]?.velocityFps ?? 0 }))
    .filter((x) => !hotOnly || x.v > VLIMIT)
    .sort((a, b) => (worstFirst ? b.v - a.v : 0));
  const overCount = pipes.filter((p) => (pr[p.id]?.velocityFps ?? 0) > VLIMIT).length;
  const pass = s.passesSupply && s.meetsMinPressure;

  return (
    <div style={page}>
      <div style={{ ...card, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 18 }}>
        <Stat label="Required" value={`${u.p(s.sourcePressurePsi)} ${u.U.p}`} />
        <Stat label="Available" value={`${u.p(s.availablePsi)} ${u.U.p}`} />
        <Stat label="Margin" value={`${s.marginPsi >= 0 ? "+" : ""}${u.p(s.marginPsi)} ${u.U.p}`} tone={s.marginPsi >= 0 ? "good" : "bad"} />
        <Stat label="Most-remote" value={s.mostRemoteSprinkler ? `${u.p(s.mostRemoteSprinkler.pressurePsi)} ${u.U.p}` : "—"} tone={s.meetsMinPressure ? "good" : "bad"} />
        <Stat label="System flow" value={`${u.q(s.systemFlowGpm, 0)} ${u.U.q}`} />
        <Stat label={`Over ${u.v(VLIMIT)} ${u.U.v}`} value={`${overCount}`} tone={overCount ? "bad" : "good"} />
        <span style={{ flex: 1 }} />
        <div style={{ ...badge, background: pass ? C.good : C.bad }}>{pass ? "PASS" : "REVIEW"}</div>
      </div>

      <div style={{ ...card, padding: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 8 }}>
          <span style={sectionTitle}>Pipe sizing · {pipes.length}</span>
          <button style={autoBtn} onClick={doAutoSize} title="Upsize every pipe over the velocity limit, one nominal step at a time, until all are within it (undoable)">⚡ Auto-size velocity</button>
          <button style={{ ...autoBtn, background: C.good }} onClick={doAutoPass} title="Upsize the highest-friction pipes until the supply margin passes (undoable)">⚡ Auto-size to pass</button>
          {autoMsg && <span style={{ fontSize: 12, fontWeight: 700, color: C.good }}>✓ {autoMsg}</span>}
          <span style={{ flex: 1 }} />
          <label style={chk}><input type="checkbox" checked={worstFirst} onChange={(e) => setWorstFirst(e.target.checked)} /> Worst velocity first</label>
          <label style={chk}><input type="checkbox" checked={hotOnly} onChange={(e) => setHotOnly(e.target.checked)} /> Only over {u.v(VLIMIT)} {u.U.v}</label>
        </div>
        <div style={hint}>Change a size or material and the whole system re-solves instantly. Velocity over {u.v(VLIMIT)} {u.U.v} is flagged red (NFPA 13 guidance) — upsize those first. ⬆ / ⬇ bump one nominal size.</div>
        <div style={scroll}>
          <table style={tbl}>
            <thead><tr>{["#", "From → To", "Role", "Size", "Material", `Flow (${u.U.q})`, `Velocity (${u.U.v})`, `Friction (${u.U.p})`, `Total loss (${u.U.p})`, ""].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ p, r, v }) => {
                const vHot = v > VLIMIT;
                return (
                  <tr key={p.id} style={vHot ? { background: "#fff1f0" } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: C.accent }}>{p.id}</td>
                    <td style={td}>{p.from} → {p.to}</td>
                    <td style={td}>{p.role ?? "—"}</td>
                    <td style={td}><select style={{ ...select, width: 76, padding: "3px 5px" }} value={p.nominalSize ?? "1"} onChange={(e) => resize(p.id, e.target.value)}>{NOMINAL_SIZES.map((o) => <option key={o} value={o}>{o}"</option>)}</select></td>
                    <td style={td}><select style={{ ...select, width: 140, padding: "3px 5px" }} value={p.material ?? "steel-sch40"} onChange={(e) => setPipe(p.id, { material: e.target.value })}>{MATERIAL_OPTIONS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select></td>
                    <td style={tdNum}>{u.q(r?.flowGpm)}</td>
                    <td style={{ ...tdNum, color: vHot ? C.bad : C.ink, fontWeight: vHot ? 800 : 400 }}>{u.v(v)}</td>
                    <td style={tdNum}>{u.p(r?.frictionLossPsi, 2)}</td>
                    <td style={tdNum}>{u.p(r?.totalLossPsi, 2)}</td>
                    <td style={td}><div style={{ display: "flex", gap: 3 }}>
                      <button style={mini} title="Down one nominal size" onClick={() => bump(p.id, -1)}>⬇</button>
                      <button style={mini} title="Up one nominal size" onClick={() => bump(p.id, 1)}>⬆</button>
                    </div></td>
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td style={{ ...td, color: C.muted }} colSpan={10}>{hotOnly ? `No pipes over ${u.v(VLIMIT)} ${u.U.v}.` : "No pipes — add some on the Project tab."}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "warn" | "bad" }): JSX.Element {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, color: C.muted, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 17, fontWeight: 800, color: toneColor(tone) }}>{value}</span>
    </div>
  );
}

const page: CSSProperties = { padding: 18, overflow: "auto", height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT, background: C.page };
const scroll: CSSProperties = { overflow: "auto", maxHeight: "62vh", border: `1px solid ${C.line}`, borderRadius: 8, marginTop: 8 };
const tbl: CSSProperties = { width: "100%", borderCollapse: "collapse", fontFamily: FONT };
const chk: CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.ink, cursor: "pointer" };
const hint: CSSProperties = { fontSize: 11.5, color: C.muted, lineHeight: 1.5 };
const badge: CSSProperties = { color: "#fff", fontWeight: 800, fontSize: 14, letterSpacing: 1, padding: "6px 16px", borderRadius: 7 };
const mini: CSSProperties = { fontSize: 11, fontWeight: 700, color: C.accent, background: "#eef3fb", border: `1px solid ${C.line}`, borderRadius: 5, padding: "2px 6px", cursor: "pointer" };
const autoBtn: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#fff", background: C.accent, border: "none", borderRadius: 7, padding: "6px 12px", cursor: "pointer" };
