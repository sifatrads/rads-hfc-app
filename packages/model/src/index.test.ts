import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createEmptyProject, isProjectModel, parseProject, safeParseProject, migrate, CURRENT_SCHEMA_VERSION } from "./index";

describe("project model", () => {
  it("creates a schema-valid empty project at the current version", () => {
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
    // meta missing `name` → invalid
    expect(isProjectModel({ schemaVersion: 1, meta: { id: "x" } })).toBe(false);
  });

  it("migrates a v1 sample-shaped project to v2 and backfills standardId", () => {
    const v1 = {
      schemaVersion: 1,
      meta: { id: "SPK", name: "Demo", systemType: "sprinkler", standard: "NFPA 13 (2019)", units: "imperial" },
      designBasis: { method: "density/area", densityGpmFt2: 0.2 },
      waterSupply: { type: "city", flowTest: { staticPsi: 70 } },
      network: {
        nodes: [{ id: "S-1", type: "sprinkler", elevationFt: 12, kFactor: 5.6 }],
        pipes: [{ id: "P-1", from: "CM-0", to: "S-1", lengthFt: 10, nominalSize: "1" }],
      },
    };
    const p = parseProject(v1);
    expect(p.schemaVersion).toBe(2);
    expect(p.meta.standardId).toBe("nfpa13");
    expect(p.network.valves).toEqual([]); // defaulted
    expect(p.network.pipes[0]?.fittings).toEqual([]); // defaulted
  });

  it("preserves unknown fields through a parse round-trip (passthrough)", () => {
    const raw = {
      schemaVersion: 2,
      meta: { id: "x", name: "y", futureMetaField: 42 },
      network: { nodes: [], pipes: [], valves: [] },
      futureTopLevel: { keep: true },
    };
    const p = parseProject(raw) as Record<string, unknown>;
    expect((p["meta"] as Record<string, unknown>)["futureMetaField"]).toBe(42);
    expect(p["futureTopLevel"]).toEqual({ keep: true });
  });

  it("reports field-level errors for invalid projects", () => {
    const res = safeParseProject({ schemaVersion: 2, meta: { id: "x" } });
    expect(res.success).toBe(false);
  });

  // Local-only: every generated sample (git-ignored test_data/) must round-trip.
  const testDataDir = resolve(process.cwd(), "test_data");
  const sampleDirs = ["sprinkler", "standpipe"].map((d) => join(testDataDir, d));
  const hasSamples = existsSync(testDataDir) && sampleDirs.some((d) => existsSync(d));
  it.skipIf(!hasSamples)("parses all generated sample projects", () => {
    let count = 0;
    for (const dir of sampleDirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const res = safeParseProject(raw);
        if (!res.success) throw new Error(`${f}: ${res.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
        expect(res.data.schemaVersion).toBe(2);
        count++;
      }
    }
    expect(count).toBeGreaterThanOrEqual(60);
  });
});
