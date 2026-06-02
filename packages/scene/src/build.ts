/**
 * buildScene — assemble an {@link AnnotatedScene} from a ProjectModel and
 * optional calc results. Geometry comes from @rads/geometry auto-layout (or
 * explicit node.geometry). Label requests are emitted for every category; the
 * label engine decides which actually render given the active toggles + zoom.
 */
import type { ProjectModel, Vec3, Valve } from "@rads/model";
import { autoLayout, directionOf, type LayoutOptions } from "@rads/geometry";
import type { AnnotatedScene, SceneNode, ScenePipe, SceneDevice, SceneEquipment, SceneLabel, SceneResults, NodeKind } from "./types";
import { nominalSizeToMm, formatterFor } from "./units";

export interface BuildOptions {
  results?: SceneResults;
  /** Auto-layout tuning (e.g. compressLongRuns for schematic drawings). */
  layout?: LayoutOptions;
}

const num = (o: unknown, k: string): number | undefined => {
  const v = (o as Record<string, unknown> | undefined)?.[k];
  return typeof v === "number" ? v : undefined;
};
const str = (o: unknown, k: string): string | undefined => {
  const v = (o as Record<string, unknown> | undefined)?.[k];
  return typeof v === "string" ? v : undefined;
};
const mid = (a: Vec3, b: Vec3): Vec3 => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 });

function nodeKind(rawType: string): NodeKind {
  if (rawType === "sprinkler") return "sprinkler";
  if (rawType === "hose-station") return "hose-station";
  if (rawType === "junction") return "junction";
  return "other";
}

/** Map a model valve/device type to an NFPA-170 symbol id (resolved by renderer). */
function deviceSymbol(type: string, subtype?: string): string {
  const t = type.toLowerCase();
  if (subtype === "post-indicator" || t.includes("post-indicator")) return "valve-piv";
  if (t.includes("butterfly")) return "valve-butterfly";
  if (t.includes("gate")) return "valve-gate";
  if (t.includes("check")) return "valve-check";
  if (t.includes("alarm")) return "valve-alarm";
  if (t.includes("backflow")) return "valve-backflow";
  if (t.includes("prv") || t.includes("pressure-reducing")) return "valve-prv";
  if (t.includes("flow-switch") || t.includes("flow")) return "flow-switch";
  if (t.includes("drain")) return "drain";
  return "valve-generic";
}

export function buildScene(model: ProjectModel, opts: BuildOptions = {}): AnnotatedScene {
  const units = model.meta.units;
  const fmt = formatterFor(units);
  const results = opts.results;
  const { positions, bbox } = autoLayout(model.network, opts.layout);
  const at = (id: string): Vec3 => positions.get(id) ?? { x: 0, y: 0, z: 0 };

  // ── nodes ──
  const nodes: SceneNode[] = model.network.nodes.map((n) => ({
    id: n.id,
    kind: nodeKind(n.type),
    rawType: n.type,
    pos: at(n.id),
    elevationFt: n.elevationFt ?? 0,
    ...(n.kFactor !== undefined ? { kFactor: n.kFactor } : {}),
    ...(n.coverageAreaFt2 !== undefined ? { coverageAreaFt2: n.coverageAreaFt2 } : {}),
    ...(n.sprinkler !== undefined ? { sprinklerType: n.sprinkler } : {}),
    ...(results?.nodes?.[n.id] ? { result: results.nodes[n.id] } : {}),
  }));

  // ── pipes ──
  const pipes: ScenePipe[] = model.network.pipes.map((p) => {
    const a = at(p.from), b = at(p.to);
    return {
      id: p.id,
      from: p.from,
      to: p.to,
      a,
      b,
      ...(p.role !== undefined ? { role: p.role } : {}),
      ...(p.material !== undefined ? { material: p.material } : {}),
      ...(p.cFactor !== undefined ? { cFactor: p.cFactor } : {}),
      ...(p.nominalSize !== undefined ? { nominalSize: p.nominalSize } : {}),
      sizeMm: nominalSizeToMm(p.nominalSize, units),
      ...(p.internalDiameterIn !== undefined ? { internalDiameterIn: p.internalDiameterIn } : {}),
      lengthFt: p.lengthFt ?? 0,
      ...(results?.pipes?.[p.id] ? { result: results.pipes[p.id] } : {}),
    };
  });

  // host pipe per role (for placing valves whose `onPipe` is a role string)
  const pipeByRole = new Map<string, ScenePipe[]>();
  for (const p of pipes) (pipeByRole.get(p.role ?? "") ?? pipeByRole.set(p.role ?? "", []).get(p.role ?? "")!).push(p);
  const pipeById = new Map(pipes.map((p) => [p.id, p]));

  // ── devices (valves) ──
  const devices: SceneDevice[] = [];
  const roleSeen = new Map<string, number>();
  for (const v of model.network.valves) {
    const host = (v.onPipe && pipeById.get(v.onPipe)) || (v.onPipe ? pipeByRole.get(v.onPipe)?.[0] : undefined);
    let pos: Vec3;
    if (host) {
      // stagger multiple valves on the same role along the pipe
      const k = roleSeen.get(v.onPipe ?? "") ?? 0;
      roleSeen.set(v.onPipe ?? "", k + 1);
      const t = 0.35 + Math.min(0.3, k * 0.12);
      pos = { x: host.a.x + (host.b.x - host.a.x) * t, y: host.a.y + (host.b.y - host.a.y) * t, z: host.a.z + (host.b.z - host.a.z) * t };
    } else {
      pos = bbox.center;
    }
    const sizeLabel = v.sizeIn !== undefined ? fmt.size(String(v.sizeIn)) : undefined;
    devices.push({
      id: v.id,
      symbol: deviceSymbol(v.type, v.subtype),
      rawType: v.type,
      pos,
      ...(host ? { hostPipe: host.id } : {}),
      ...(sizeLabel ? { sizeLabel } : {}),
    });
  }

  // ── equipment (source / pump / reservoir) ──
  const equipment: SceneEquipment[] = [];
  const incoming = new Set(model.network.pipes.map((p) => p.to));
  const rootId = model.network.nodes.find((n) => !incoming.has(n.id))?.id ?? model.network.pipes.find((p) => !incoming.has(p.from))?.from;
  const ws = model.waterSupply;
  if (ws) {
    const srcPos = rootId ? at(rootId) : bbox.center;
    const ft = (ws as Record<string, unknown>)["flowTest"];
    equipment.push({
      id: "SOURCE",
      kind: "source",
      pos: srcPos,
      label: "Water supply",
      details: { static: num(ft, "staticPsi"), residual: num(ft, "residualPsi"), testFlow: num(ft, "testFlowGpm"), type: str(ws, "type") },
    });
    const fp = (ws as Record<string, unknown>)["firePump"];
    if (fp) {
      equipment.push({
        id: "PUMP",
        kind: "pump",
        pos: { x: srcPos.x, y: srcPos.y - Math.max(bbox.size.y * 0.08, 4), z: srcPos.z },
        sizeFt: { x: 6, y: 6, z: 4 },
        label: "Fire pump",
        details: { rated: num(fp, "ratedFlowGpm"), ratedPsi: num(fp, "ratedPsi"), churnPsi: num(fp, "churnPsi"), listed: str(fp, "listed") },
      });
    }
  }
  const pump = model.network.pump;
  if (pump?.datasheet) {
    const p = pump.datasheet;
    const pos = pump.atNode ? at(pump.atNode) : bbox.center;
    equipment.push({ id: "PUMP-DS", kind: "pump", pos, sizeFt: { x: 6, y: 6, z: 4 }, label: p.model ?? "Pump", details: { make: p.make, model: p.model, rated: p.ratedFlowGpm, ratedPsi: p.ratedPsi } });
  }
  const r = model.network.reservoir;
  if (r) {
    const pos = r.connectedNode ? at(r.connectedNode) : { x: bbox.min.x - Math.max(bbox.size.x * 0.1, 6), y: bbox.center.y, z: r.baseElevationFt ?? 0 };
    equipment.push({
      id: r.id ?? "RESERVOIR",
      kind: r.kind?.includes("tank") ? "tank" : "reservoir",
      pos,
      sizeFt: { x: r.lengthFt ?? r.diameterFt ?? 10, y: r.widthFt ?? r.diameterFt ?? 10, z: r.heightFt ?? 10 },
      label: r.kind ?? "Reservoir",
      details: { capacityGal: r.capacityGal, heightFt: r.heightFt, lengthFt: r.lengthFt, widthFt: r.widthFt },
    });
  }

  // ── labels ──
  const labels: SceneLabel[] = [];
  const push = (id: string, anchor: Vec3, text: string, category: SceneLabel["category"], priority: number) => {
    if (text) labels.push({ id, anchor, text, category, priority });
  };
  for (const n of nodes) {
    push(`no:${n.id}`, n.pos, n.id, "nodeNo", n.kind === "junction" ? 7 : 6);
    push(`el:${n.id}`, n.pos, fmt.len(n.elevationFt), "elevation", 2);
    if (n.kFactor !== undefined) push(`k:${n.id}`, n.pos, `K${n.kFactor}`, "kFactor", 3);
    if (n.coverageAreaFt2 !== undefined) push(`cov:${n.id}`, n.pos, `${n.coverageAreaFt2} ft²`, "coverage", 1);
    if (n.result?.totalPressurePsi !== undefined) push(`pt:${n.id}`, n.pos, fmt.pressure(n.result.totalPressurePsi), "pressureTotal", 5);
    if (n.result?.normalPressurePsi !== undefined) push(`pn:${n.id}`, n.pos, fmt.pressure(n.result.normalPressurePsi), "pressureNormal", 4);
    if (n.result?.velocityPressurePsi !== undefined) push(`pv:${n.id}`, n.pos, fmt.pressure(n.result.velocityPressurePsi), "pressureVelocity", 2);
    if (n.result?.dischargeGpm !== undefined) push(`q:${n.id}`, n.pos, fmt.flow(n.result.dischargeGpm), "flow", 4);
  }
  for (const p of pipes) {
    const m = mid(p.a, p.b);
    push(`pno:${p.id}`, m, p.id, "pipeNo", 5);
    if (p.nominalSize) push(`sz:${p.id}`, m, fmt.size(p.nominalSize), "pipeSize", 4);
    if (p.internalDiameterIn !== undefined) push(`id:${p.id}`, m, `⌀${p.internalDiameterIn}"`, "internalDia", 2);
    if (p.result?.flowGpm !== undefined) push(`fl:${p.id}`, m, fmt.flow(p.result.flowGpm), "flow", 4);
    if (p.result?.velocityFps !== undefined) push(`vel:${p.id}`, m, fmt.velocity(p.result.velocityFps), "velocity", 3);
    const drop = p.result?.totalLossPsi ?? p.result?.frictionLossPsi;
    if (drop !== undefined) push(`dp:${p.id}`, m, fmt.pressure(drop), "pressureDrop", 3);
  }
  for (const d of devices) push(`dev:${d.id}`, d.pos, d.sizeLabel ? `${d.rawType} ${d.sizeLabel}` : d.rawType, "valve", 8);
  for (const e of equipment) {
    const cat = e.kind === "source" ? "source" : e.kind === "pump" ? "pump" : "reservoir";
    const extra =
      e.kind === "source"
        ? `${fmt.pressure(num(e.details, "static"))} / ${fmt.pressure(num(e.details, "residual"))} @ ${fmt.flow(num(e.details, "testFlow"))}`
        : e.kind === "pump"
          ? `${fmt.flow(num(e.details, "rated"))} @ ${fmt.pressure(num(e.details, "ratedPsi"))}`
          : `${num(e.details, "capacityGal") ?? "?"} gal`;
    push(`eq:${e.id}`, e.pos, `${e.label}: ${extra}`, cat, 9);
  }

  return {
    projectId: model.meta.id,
    name: model.meta.name,
    units,
    ...(model.meta.standardId ? { standardId: model.meta.standardId } : {}),
    ...(model.meta.systemType ? { systemType: model.meta.systemType } : {}),
    nodes,
    pipes,
    devices,
    equipment,
    labels,
    bbox,
  };
}
