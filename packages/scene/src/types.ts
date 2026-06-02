/**
 * AnnotatedScene — the framework-agnostic view model built once from a
 * ProjectModel (+ optional calc results), then consumed by BOTH the WebGL
 * viewer (@rads/viewer-3d) and the vector print/report engine (@rads/report).
 * Pure data: no three.js, no DOM.
 */
import type { Vec3, Units } from "@rads/model";
import type { BBox } from "@rads/geometry";

/** Toggleable annotation layers. Each label belongs to exactly one category. */
export type LabelCategory =
  | "pipeNo"
  | "nodeNo"
  | "pipeSize"
  | "internalDia"
  | "valve"
  | "device"
  | "elevation"
  | "kFactor"
  | "coverage"
  | "flow"
  | "velocity"
  | "pressureTotal"
  | "pressureNormal"
  | "pressureVelocity"
  | "pressureStatic"
  | "pressureResidual"
  | "pressureDrop"
  | "source"
  | "reservoir"
  | "suction"
  | "pump";

/** Per-node hydraulic results (filled by the calc adapter; all optional). */
export interface NodeResult {
  totalPressurePsi?: number;
  normalPressurePsi?: number;
  velocityPressurePsi?: number;
  dischargeGpm?: number;
}

/** Per-pipe hydraulic results (filled by the calc adapter; all optional). */
export interface PipeResult {
  flowGpm?: number;
  velocityFps?: number;
  frictionLossPsi?: number;
  elevationLossPsi?: number;
  totalLossPsi?: number;
}

export interface SceneResults {
  nodes?: Record<string, NodeResult>;
  pipes?: Record<string, PipeResult>;
}

export type NodeKind = "sprinkler" | "hose-station" | "junction" | "source" | "other";

export interface SceneNode {
  id: string;
  kind: NodeKind;
  rawType: string;
  pos: Vec3;
  elevationFt: number;
  kFactor?: number;
  coverageAreaFt2?: number;
  sprinklerType?: string;
  result?: NodeResult;
}

export interface ScenePipe {
  id: string;
  from: string;
  to: string;
  a: Vec3;
  b: Vec3;
  role?: string;
  material?: string;
  cFactor?: number;
  nominalSize?: string;
  /** Nominal bore in mm (for stroke-width / radius scaling), 0 when unknown. */
  sizeMm: number;
  internalDiameterIn?: number;
  lengthFt: number;
  result?: PipeResult;
}

/** A symbol placement (valve / FDC / hydrant / alarm etc.) on a host pipe. */
export interface SceneDevice {
  id: string;
  /** NFPA-170 symbol id resolved by the renderer. */
  symbol: string;
  rawType: string;
  pos: Vec3;
  hostPipe?: string;
  sizeLabel?: string;
}

/** Bulky equipment drawn as parametric 3D primitives (pump / tank / reservoir). */
export interface SceneEquipment {
  id: string;
  kind: "pump" | "reservoir" | "tank" | "source";
  pos: Vec3;
  /** Box dimensions in model units (feet); cylinders use sizeFt.x as diameter. */
  sizeFt?: Vec3;
  label?: string;
  details?: Record<string, string | number | undefined>;
}

export interface SceneLabel {
  id: string;
  anchor: Vec3;
  text: string;
  category: LabelCategory;
  /** Higher = placed first / kept when space is tight. */
  priority: number;
}

export interface AnnotatedScene {
  projectId: string;
  name: string;
  units: Units;
  standardId?: string;
  systemType?: string;
  nodes: SceneNode[];
  pipes: ScenePipe[];
  devices: SceneDevice[];
  equipment: SceneEquipment[];
  labels: SceneLabel[];
  bbox: BBox;
}

// ── colorizer ──────────────────────────────────────────────────────────────

export type ColorMetric = "role" | "size" | "material" | "velocity" | "flow" | "pressure" | "pressureDrop";

export interface LegendEntry {
  swatch: string;
  label: string;
  range?: [number, number];
}

export interface LegendModel {
  title: string;
  kind: "categorical" | "gradient";
  entries: LegendEntry[];
  units?: string;
  /** True when the metric needs calc results that were absent. */
  needsCalc?: boolean;
}

export interface ColorizeResult {
  /** pipe id → hex color. */
  pipeColors: Map<string, string>;
  /** node id → hex color. */
  nodeColors: Map<string, string>;
  legend: LegendModel;
}
