/**
 * @rads/model — the RADS-HFC-APP project model (the decoded contents of a
 * `.rhfc` file). Schema + types are defined with zod in `./schema`; loading
 * applies versioned migrations (`./migrate`) before validation.
 */
import { z } from "zod";
import { ProjectModelSchema, type ProjectModel, type Units } from "./schema";
import { migrate, CURRENT_SCHEMA_VERSION } from "./migrate";

export * from "./schema";
export { migrate, CURRENT_SCHEMA_VERSION } from "./migrate";

export interface CreateProjectInput {
  id: string;
  name: string;
  standardId?: string;
  units?: Units;
  engineer?: string;
  systemType?: string;
  now?: string;
}

/** Build an empty, schema-valid project at the current schema version. */
export function createEmptyProject(input: CreateProjectInput): ProjectModel {
  const now = input.now ?? new Date().toISOString();
  return ProjectModelSchema.parse({
    schemaVersion: CURRENT_SCHEMA_VERSION,
    meta: {
      id: input.id,
      name: input.name,
      standardId: input.standardId ?? "nfpa13",
      units: input.units ?? "imperial",
      systemType: input.systemType ?? "sprinkler",
      ...(input.engineer !== undefined ? { engineer: input.engineer } : {}),
      rev: 1,
      createdAt: now,
      updatedAt: now,
    },
    network: { nodes: [], pipes: [], valves: [], sources: [], designAreas: [], params: {} },
    drawing: { layers: [], entities: [], scale: "1:100", viewports: [] },
    results: {},
  });
}

/**
 * Migrate + validate an arbitrary value into a {@link ProjectModel}. Throws a
 * `ZodError` with field-level detail when the value is not a valid project.
 */
export function parseProject(value: unknown): ProjectModel {
  return ProjectModelSchema.parse(migrate(value));
}

/** Non-throwing variant of {@link parseProject}. */
export function safeParseProject(value: unknown): z.SafeParseReturnType<unknown, ProjectModel> {
  return ProjectModelSchema.safeParse(migrate(value));
}

/** Structural guard: true when `value` migrates+validates to a ProjectModel. */
export function isProjectModel(value: unknown): value is ProjectModel {
  return safeParseProject(value).success;
}
