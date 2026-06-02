/**
 * The RADS-HFC-APP project model — the decoded contents of a `.rhfc` file.
 * On disk this is always wrapped in the encrypted single-file container
 * (`@rads/container`); it is never written as plain JSON.
 *
 * This is an early, deliberately loose shape (network/drawing/results are
 * refined as the calc engine and CAD layers land). A `zod` schema + migrations
 * will replace the hand validation in a later step.
 */

export const CURRENT_SCHEMA_VERSION = 1;

export type Units = "imperial" | "metric";

export interface ProjectMeta {
  id: string;
  name: string;
  engineer?: string;
  standardId: string;
  units: Units;
  /** Monotonic revision counter for sync/conflict resolution. */
  rev: number;
  createdAt: string;
  updatedAt: string;
  appVersion?: string;
}

export interface ProjectModel {
  schemaVersion: number;
  meta: ProjectMeta;
  /** Hydraulic network (nodes, pipes, sources, design areas, params). */
  network: Record<string, unknown>;
  /** CAD drawing (layers, entities, scale, viewports). */
  drawing: Record<string, unknown>;
  /** Last calculation results. */
  results: Record<string, unknown>;
}

export interface CreateProjectInput {
  id: string;
  name: string;
  standardId?: string;
  units?: Units;
  engineer?: string;
  now?: string;
}

/** Build an empty, schema-valid project. */
export function createEmptyProject(input: CreateProjectInput): ProjectModel {
  const now = input.now ?? new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      id: input.id,
      name: input.name,
      standardId: input.standardId ?? "nfpa13",
      units: input.units ?? "imperial",
      ...(input.engineer !== undefined ? { engineer: input.engineer } : {}),
      rev: 1,
      createdAt: now,
      updatedAt: now,
    },
    network: { nodes: [], pipes: [], sources: [], designAreas: [], params: {} },
    drawing: { layers: [], entities: [], scale: "1:100", viewports: [] },
    results: {},
  };
}

/** Minimal structural guard (placeholder until zod). */
export function isProjectModel(value: unknown): value is ProjectModel {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v["schemaVersion"] !== "number") return false;
  const meta = v["meta"];
  if (typeof meta !== "object" || meta === null) return false;
  const m = meta as Record<string, unknown>;
  return typeof m["id"] === "string" && typeof m["name"] === "string" && typeof m["standardId"] === "string";
}
