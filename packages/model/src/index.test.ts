import { describe, it, expect } from "vitest";
import { createEmptyProject, isProjectModel, CURRENT_SCHEMA_VERSION } from "./index";

describe("project model", () => {
  it("creates a schema-valid empty project", () => {
    const p = createEmptyProject({ id: "p1", name: "Demo", now: "2026-01-01T00:00:00.000Z" });
    expect(p.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(p.meta.id).toBe("p1");
    expect(p.meta.standardId).toBe("nfpa13");
    expect(p.meta.units).toBe("imperial");
    expect(p.meta.rev).toBe(1);
    expect(isProjectModel(p)).toBe(true);
  });

  it("guards against malformed objects", () => {
    expect(isProjectModel(null)).toBe(false);
    expect(isProjectModel({})).toBe(false);
    expect(isProjectModel({ schemaVersion: 1, meta: { id: "x" } })).toBe(false);
  });
});
