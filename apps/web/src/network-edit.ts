/**
 * Pure helpers for the in-app data-entry grid (Project tab). The network is
 * entered Canute-style: a table of nodes (numbered 1,2,3…) and a table of pipes
 * with size + length + a routing direction (N/S/E/W/U/D). @rads/geometry walks
 * the directions to build the 3D/iso, so no drawing is needed.
 */
import { parseProject, type ProjectModel, type NetworkNode, type Pipe, type Direction } from "@rads/model";
import { SCH40_ID_IN } from "@rads/standards-engine";

/** Nominal pipe sizes offered in the size dropdown (Schedule-40 bore known). */
export const NOMINAL_SIZES = ["1/2", "3/4", "1", "1-1/4", "1-1/2", "2", "2-1/2", "3", "3-1/2", "4", "5", "6", "8", "10", "12"] as const;

export const PIPE_ROLES = ["branch-line", "cross-main", "feed-main", "riser", "supply-main", "standpipe-riser"] as const;

export const NODE_TYPES = ["junction", "sprinkler", "hose-station"] as const;

export const VALVE_TYPES = ["gate-valve", "butterfly-valve", "check-valve", "alarm-valve", "backflow-preventer", "prv", "flow-switch", "main-drain"] as const;

export const PUMP_TYPES = ["horizontal-split-case", "vertical-turbine", "end-suction", "vertical-inline"] as const;

export const PUMP_DRIVERS = ["electric", "diesel"] as const;

/** Default valve equivalent length (ft) by type — editable; rough Sch-40 4–6" values. */
export const VALVE_EQUIV_FT: Record<string, number> = {
  "gate-valve": 3, "butterfly-valve": 12, "check-valve": 22, "alarm-valve": 5, "backflow-preventer": 40, prv: 0, "flow-switch": 0, "main-drain": 0,
};

export const DIRECTIONS: Direction[] = ["N", "S", "E", "W", "U", "D"];

/** Human label for each routing direction code. */
export const DIRECTION_LABEL: Record<Direction, string> = {
  N: "N (north +Y)",
  S: "S (south −Y)",
  E: "E (east +X)",
  W: "W (west −X)",
  U: "U (up +Z)",
  D: "D (down −Z)",
};

/** Schedule-40 internal diameter for a nominal size (fallback 1.049 = 1"). */
export function internalDiameterFor(size: string): number {
  return SCH40_ID_IN[size] ?? 1.049;
}

/**
 * Renumber nodes to "1".."N" by array order and pipes to "P-1".."P-M", remapping
 * every pipe's from/to to the new node ids. Keeps the network self-consistent
 * after an add/delete/reorder. The first node is the source (no incoming pipe).
 */
export function renumberNetwork(nodes: NetworkNode[], pipes: Pipe[]): { nodes: NetworkNode[]; pipes: Pipe[] } {
  const remap = new Map<string, string>();
  const outNodes = nodes.map((n, i) => {
    const id = String(i + 1);
    remap.set(n.id, id);
    return { ...n, id };
  });
  const outPipes = pipes.map((p, i) => ({
    ...p,
    id: `P-${i + 1}`,
    from: remap.get(p.from) ?? p.from,
    to: remap.get(p.to) ?? p.to,
  }));
  return { nodes: outNodes, pipes: outPipes };
}

/** Fill internalDiameterIn from the chosen nominal size + a default C-factor. */
export function normalizePipe(p: Pipe): Pipe {
  return {
    ...p,
    internalDiameterIn: p.nominalSize ? internalDiameterFor(p.nominalSize) : p.internalDiameterIn,
    cFactor: p.cFactor ?? 120,
  };
}

/** A fresh, schema-valid project with one source node, ready to extend. */
export function newProject(now: string): ProjectModel {
  return parseProject({
    schemaVersion: 2,
    meta: {
      id: `HFC-${now.slice(0, 10).replace(/-/g, "")}`,
      name: "New Project",
      systemType: "sprinkler",
      standard: "NFPA 13 (2019)",
      standardId: "nfpa13",
      hazardClass: "oh2",
      units: "imperial",
      date: now.slice(0, 10),
      rev: 1,
      createdAt: now,
      updatedAt: now,
    },
    designBasis: {
      densityGpmFt2: 0.2,
      designAreaFt2: 1500,
      sprinklerKFactor: 5.6,
      operatingSprinklers: 12,
      minSprinklerPressurePsi: 7,
      hoseAllowanceGpm: 250,
    },
    waterSupply: {
      type: "city",
      flowTest: { staticPsi: 70, residualPsi: 55, testFlowGpm: 1500 },
    },
    network: {
      nodes: [{ id: "1", type: "junction", elevationFt: 0, note: "City supply / source" }],
      pipes: [],
      valves: [],
    },
  });
}

/** Re-parse a model after an edit (keeps unknown fields via passthrough). */
export function withModel(model: ProjectModel, patch: Partial<ProjectModel>): ProjectModel {
  return parseProject({ ...model, ...patch });
}

/** Replace the network's nodes+pipes, renumbering to 1..N / P-1.., and re-parse. */
function commitNetwork(model: ProjectModel, nodes: NetworkNode[], pipes: Pipe[]): ProjectModel {
  const r = renumberNetwork(nodes, pipes.map(normalizePipe));
  return withModel(model, { network: { ...model.network, nodes: r.nodes, pipes: r.pipes } });
}

/**
 * Divide a pipe at `fraction` (0..1) of its length: insert a junction there and
 * split length + elevation change proportionally. Used by both the Project-tab
 * Split button and click-to-split in the 3D view.
 */
export function splitPipeInModel(model: ProjectModel, pipeId: string, fraction = 0.5): ProjectModel {
  const pipes = model.network.pipes;
  const i = pipes.findIndex((p) => p.id === pipeId);
  if (i < 0) return model;
  const p = pipes[i]!;
  const fr = Math.min(0.9, Math.max(0.1, fraction));
  const byId = new Map(model.network.nodes.map((n) => [n.id, n]));
  const e1 = byId.get(p.from)?.elevationFt ?? 0, e2 = byId.get(p.to)?.elevationFt ?? 0;
  const mid = { id: "tmp-mid", type: "junction", elevationFt: e1 + (e2 - e1) * fr, fittings: [] } as NetworkNode;
  const len = p.lengthFt ?? 0, ec = p.elevationChangeFt;
  const p1: Pipe = { ...p, to: "tmp-mid", lengthFt: len * fr, ...(ec !== undefined ? { elevationChangeFt: ec * fr } : {}) };
  const p2: Pipe = { ...p, from: "tmp-mid", to: p.to, lengthFt: len * (1 - fr), fittings: [], ...(ec !== undefined ? { elevationChangeFt: ec * (1 - fr) } : {}) };
  return commitNetwork(model, [...model.network.nodes, mid], [...pipes.slice(0, i), p1, p2, ...pipes.slice(i + 1)]);
}

/** Delete a node and every pipe touching it. */
export function deleteNodeInModel(model: ProjectModel, nodeId: string): ProjectModel {
  return commitNetwork(
    model,
    model.network.nodes.filter((n) => n.id !== nodeId),
    model.network.pipes.filter((p) => p.from !== nodeId && p.to !== nodeId),
  );
}

/** Delete a single pipe (nodes untouched). */
export function deletePipeInModel(model: ProjectModel, pipeId: string): ProjectModel {
  return commitNetwork(model, model.network.nodes, model.network.pipes.filter((p) => p.id !== pipeId));
}

export interface AddBranchOpts {
  direction: Direction;
  lengthFt: number;
  nominalSize: string;
  /** "sprinkler" adds a head (K from design basis); anything else adds a junction. */
  nodeType: string;
  role?: string;
  kFactor?: number;
}

/**
 * Extend the network from an existing node: add a new node a `lengthFt` run away
 * in `direction`, connected by a new pipe. Up/Down set the new node's elevation
 * and the pipe's elevation change. Used by "Add branch" in the 3D view.
 */
export function addBranchInModel(model: ProjectModel, fromNodeId: string, opts: AddBranchOpts): ProjectModel {
  const from = model.network.nodes.find((n) => n.id === fromNodeId);
  const fromElev = from?.elevationFt ?? 0;
  const dz = opts.direction === "U" ? opts.lengthFt : opts.direction === "D" ? -opts.lengthFt : 0;
  const isSpk = opts.nodeType === "sprinkler";
  const dbK = (model.designBasis as Record<string, unknown> | undefined)?.["sprinklerKFactor"];
  const k = opts.kFactor ?? (typeof dbK === "number" ? dbK : 5.6);
  const newNode = {
    id: "tmp-new",
    type: isSpk ? "sprinkler" : "junction",
    elevationFt: fromElev + dz,
    ...(isSpk ? { kFactor: k, coverageAreaFt2: 100 } : {}),
    fittings: [],
  } as NetworkNode;
  const newPipe: Pipe = {
    id: "tmp-newpipe",
    from: fromNodeId,
    to: "tmp-new",
    role: opts.role ?? (isSpk ? "branch-line" : "cross-main"),
    nominalSize: opts.nominalSize,
    lengthFt: opts.lengthFt,
    direction: opts.direction,
    fittings: [],
    ...(dz !== 0 ? { elevationChangeFt: dz } : {}),
  };
  return commitNetwork(model, [...model.network.nodes, newNode], [...model.network.pipes, newPipe]);
}

/**
 * Connect two existing nodes with a new pipe (close a loop / grid). No-op if the
 * ends are the same or already directly connected. Geometry comes from the two
 * nodes' existing positions, so no direction is set — only length drives the calc.
 */
export function addPipeBetweenInModel(model: ProjectModel, fromId: string, toId: string, opts: { lengthFt: number; nominalSize: string; role?: string }): ProjectModel {
  if (fromId === toId) return model;
  if (model.network.pipes.some((p) => (p.from === fromId && p.to === toId) || (p.from === toId && p.to === fromId))) return model;
  const newPipe: Pipe = {
    id: "tmp-conn",
    from: fromId,
    to: toId,
    role: opts.role ?? "cross-main",
    nominalSize: opts.nominalSize,
    lengthFt: Math.max(0.1, opts.lengthFt),
    fittings: [],
  };
  return commitNetwork(model, model.network.nodes, [...model.network.pipes, newPipe]);
}
