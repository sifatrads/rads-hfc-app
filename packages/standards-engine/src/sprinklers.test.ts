import { describe, it, expect } from "vitest";
import { catalog, findSprinklers, sprinklerBySin, SPRINKLERS } from "./sprinklers";

describe("sprinkler catalog", () => {
  it("exposes the full catalog with unique SINs", () => {
    const all = catalog();
    expect(all.length).toBe(SPRINKLERS.length);
    expect(all.length).toBeGreaterThan(20);
    const sins = new Set(all.map((s) => s.sin));
    expect(sins.size).toBe(all.length); // no duplicate SIN keys
  });

  it("every profile is internally valid", () => {
    const orientations = new Set(["pendent", "upright", "sidewall", "concealed-pendent", "recessed-pendent", "dry-pendent", "dry-sidewall", "dry-upright"]);
    const types = new Set(["spray", "esfr", "cmsa", "residential", "dry", "institutional"]);
    for (const s of catalog()) {
      expect(s.kImperial, s.sin).toBeGreaterThan(0);
      expect(s.kMetric, s.sin).toBeGreaterThan(0);
      expect(s.tempRatingsF.length, s.sin).toBeGreaterThanOrEqual(1);
      expect(orientations.has(s.orientation), `${s.sin} orientation`).toBe(true);
      expect(types.has(s.type), `${s.sin} type`).toBe(true);
      expect(s.response === "QR" || s.response === "SR", `${s.sin} response`).toBe(true);
    }
  });

  it("Tyco SINs follow the 4-digit TYxxxx format (guards against truncation)", () => {
    for (const s of catalog().filter((p) => p.manufacturer === "Tyco/JCI")) {
      expect(s.sin, s.model).toMatch(/^TY\d{4}$/);
    }
  });

  it("looks up a profile by SIN (O(1))", () => {
    const p = sprinklerBySin("TY3251")!;
    expect(p).toBeDefined();
    expect(p.kImperial).toBe(5.6);
    expect(p.orientation).toBe("pendent");
    expect(sprinklerBySin("NOPE")).toBeUndefined();
    expect(sprinklerBySin(undefined)).toBeUndefined();
  });

  it("filters by any subset of fields", () => {
    expect(findSprinklers({ k: 5.6 }).every((s) => s.kImperial === 5.6)).toBe(true);
    expect(findSprinklers({ orientation: "upright", type: "spray" }).every((s) => s.orientation === "upright" && s.type === "spray")).toBe(true);
    expect(findSprinklers({ manufacturer: "Viking", response: "QR" }).every((s) => s.manufacturer === "Viking" && s.response === "QR")).toBe(true);
    expect(findSprinklers({ type: "esfr" }).every((s) => s.type === "esfr")).toBe(true);
    expect(findSprinklers({}).length).toBe(catalog().length);
    expect(findSprinklers({ k: 999 }).length).toBe(0);
  });
});
