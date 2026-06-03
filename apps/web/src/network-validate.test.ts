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

  // ── sprinkler catalog cross-checks (opt-in: only heads with a SIN) ──
  const head = (extra: Record<string, unknown>) =>
    mk([{ id: "1", type: "junction" }, { id: "2", type: "sprinkler", kFactor: 5.6, ...extra }], [{ id: "P1", from: "1", to: "2", nominalSize: "1", lengthFt: 10 }]);

  it("does not cross-check legacy heads without a SIN (backward-compat)", () => {
    const issues = checkModel(head({}));
    expect(issues.some((i) => i.message.includes("catalog") || i.message.includes("differs"))).toBe(false);
    expect(issueCounts(issues).errors).toBe(0);
  });

  it("accepts a head whose K matches its assigned SIN (within ±5%)", () => {
    expect(checkModel(head({ sin: "TY3251", kFactor: 5.6 })).some((i) => i.message.includes("differs"))).toBe(false);
    expect(checkModel(head({ sin: "TY3251", kFactor: 5.7 })).some((i) => i.message.includes("differs"))).toBe(false); // rounding tolerance
  });

  it("warns on a K-mismatch vs the catalog (>5%)", () => {
    const issues = checkModel(head({ sin: "TY3251", kFactor: 8.0 }));
    expect(issues.some((i) => i.severity === "warning" && i.message.includes("differs from catalog K"))).toBe(true);
    expect(issueCounts(issues).errors).toBe(0); // never an error — manual overrides are legitimate
  });

  it("warns on orientation / temp / unknown-SIN mismatches", () => {
    expect(checkModel(head({ sin: "TY3251", sprinkler: "upright" })).some((i) => i.message.includes("orientation"))).toBe(true);
    expect(checkModel(head({ sin: "TY3251", tempRatingF: 999 })).some((i) => i.message.includes("not a listed rating"))).toBe(true);
    expect(checkModel(head({ sin: "TY3251", tempRatingF: 155 })).some((i) => i.message.includes("not a listed rating"))).toBe(false);
    expect(checkModel(head({ sin: "ZZZ99" })).some((i) => i.message.includes("not in the sprinkler catalog"))).toBe(true);
  });
});
