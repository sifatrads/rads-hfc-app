import { describe, it, expect } from "vitest";
import { parseProject } from "@rads/model";
import { checkModel, issueCounts } from "./network-validate";

const mk = (nodes: unknown[], pipes: unknown[]) =>
  parseProject({ schemaVersion: 2, meta: { id: "t", name: "t" }, network: { nodes, pipes, valves: [] } });

describe("checkModel", () => {
  it("passes a clean source → sprinkler network", () => {
    const m = mk(
      [{ id: "1", type: "junction" }, { id: "2", type: "sprinkler", kFactor: 5.6 }],
      [{ id: "P1", from: "1", to: "2", nominalSize: "1", lengthFt: 10 }],
    );
    expect(issueCounts(checkModel(m)).errors).toBe(0);
  });

  it("flags a hanging end (pipe to an unknown node)", () => {
    const m = mk([{ id: "1", type: "junction" }], [{ id: "P1", from: "1", to: "99", nominalSize: "1", lengthFt: 5 }]);
    const issues = checkModel(m);
    expect(issues.some((i) => i.severity === "error" && i.message.includes("99"))).toBe(true);
  });

  it("flags a fully cyclic network with no source", () => {
    const m = mk(
      [{ id: "1", type: "junction" }, { id: "2", type: "junction" }],
      [{ id: "P1", from: "1", to: "2", nominalSize: "1", lengthFt: 5 }, { id: "P2", from: "2", to: "1", nominalSize: "1", lengthFt: 5 }],
    );
    expect(checkModel(m).some((i) => i.message.includes("No source"))).toBe(true);
  });

  it("warns when there are no discharging sprinklers", () => {
    const m = mk([{ id: "1", type: "junction" }, { id: "2", type: "junction" }], [{ id: "P1", from: "1", to: "2", nominalSize: "1", lengthFt: 5 }]);
    expect(checkModel(m).some((i) => i.message.includes("No sprinklers"))).toBe(true);
  });
});
