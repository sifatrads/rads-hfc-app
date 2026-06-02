import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseProject } from "@rads/model";
import { autoLayout } from "./autolayout";

const net = (nodes: unknown[], pipes: unknown[]) =>
  parseProject({ schemaVersion: 2, meta: { id: "t", name: "t" }, network: { nodes, pipes } }).network;

describe("autoLayout", () => {
  it("walks pipe directions from the root, applying elevation on risers", () => {
    const network = net(
      [
        { id: "BFP-OUT", type: "junction", elevationFt: 0 },
        { id: "BOR", type: "junction", elevationFt: 0 },
        { id: "RTOP", type: "junction", elevationFt: 90 },
        { id: "CM-0", type: "junction", elevationFt: 90 },
        { id: "S-1", type: "sprinkler", elevationFt: 90, kFactor: 5.6 },
      ],
      [
        { id: "P1", from: "BFP-OUT", to: "BOR", role: "supply-main", lengthFt: 36 },
        { id: "P2", from: "BOR", to: "RTOP", role: "riser", lengthFt: 95, elevationChangeFt: 90 },
        { id: "P3", from: "RTOP", to: "CM-0", role: "feed-main", lengthFt: 20 },
        { id: "P4", from: "CM-0", to: "S-1", role: "branch-line", lengthFt: 15 },
      ],
    );
    const { positions } = autoLayout(network);
    expect(positions.get("BFP-OUT")).toEqual({ x: 0, y: 0, z: 0 });
    expect(positions.get("BOR")).toEqual({ x: 36, y: 0, z: 0 }); // E by 36
    expect(positions.get("RTOP")).toEqual({ x: 36, y: 0, z: 90 }); // U by elevationChange 90
    expect(positions.get("CM-0")).toEqual({ x: 56, y: 0, z: 90 }); // E by 20
    expect(positions.get("S-1")).toEqual({ x: 71, y: 0, z: 90 }); // E by 15
  });

  it("honours explicit node.geometry over the walk", () => {
    const network = net(
      [
        { id: "A", type: "junction", geometry: { x: 5, y: 6, z: 7 } },
        { id: "B", type: "sprinkler", kFactor: 5.6 },
      ],
      [{ id: "P1", from: "A", to: "B", role: "branch-line", lengthFt: 10 }],
    );
    const { positions } = autoLayout(network);
    expect(positions.get("A")).toEqual({ x: 5, y: 6, z: 7 });
    expect(positions.get("B")).toEqual({ x: 15, y: 6, z: 7 }); // E by 10 from explicit A
  });

  it("de-overlaps two siblings that would land on the same point", () => {
    const network = net(
      [
        { id: "J", type: "junction" },
        { id: "L1", type: "sprinkler", kFactor: 5.6 },
        { id: "L2", type: "sprinkler", kFactor: 5.6 },
      ],
      [
        { id: "P1", from: "J", to: "L1", role: "branch-line", lengthFt: 10 },
        { id: "P2", from: "J", to: "L2", role: "branch-line", lengthFt: 10 }, // same dir+len → would coincide
      ],
    );
    const { positions } = autoLayout(network);
    const a = positions.get("L1")!;
    const b = positions.get("L2")!;
    const coincident = Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs(a.z - b.z) < 1e-6;
    expect(coincident).toBe(false);
  });

  // Local-only: every generated sample must place every node with no two coincident.
  const testDataDir = resolve(process.cwd(), "test_data");
  const sampleDirs = ["sprinkler", "standpipe"].map((d) => join(testDataDir, d));
  const hasSamples = existsSync(testDataDir) && sampleDirs.some((d) => existsSync(d));
  it.skipIf(!hasSamples)("lays out every sample with a unique position per node", () => {
    let files = 0;
    for (const dir of sampleDirs) {
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
        const model = parseProject(JSON.parse(readFileSync(join(dir, f), "utf8")));
        const { positions } = autoLayout(model.network);
        // every node id has a finite position
        for (const n of model.network.nodes) {
          const p = positions.get(n.id);
          expect(p, `${f}:${n.id}`).toBeDefined();
          expect(Number.isFinite(p!.x) && Number.isFinite(p!.y) && Number.isFinite(p!.z)).toBe(true);
        }
        // no two nodes share an identical (rounded) coordinate
        const keys = new Set<string>();
        for (const p of positions.values()) {
          const k = `${Math.round(p.x * 100)}|${Math.round(p.y * 100)}|${Math.round(p.z * 100)}`;
          expect(keys.has(k), `${f} coincident @ ${k}`).toBe(false);
          keys.add(k);
        }
        files++;
      }
    }
    expect(files).toBeGreaterThanOrEqual(60);
  });
});
