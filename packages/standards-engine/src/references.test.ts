import { describe, it, expect } from "vitest";
import { standardReferences, jurisdictionReferences, GOVERNING_CODES } from "./references";

describe("standard references (basis-of-design citations)", () => {
  it("NFPA 13 is verified and cites the key clauses", () => {
    const r = standardReferences("nfpa13")!;
    expect(r.verified).toBe(true);
    expect(r.edition).toBe("2019");
    const clauses = r.clauses.map((c) => c.clause).join(" | ");
    expect(clauses).toContain("Table 27.2.4.8.1"); // C-factors
    expect(clauses).toContain("Table 19.3.3.1.2"); // hose / duration
    expect(clauses).toContain("Figure 19.3.3.1.1"); // density/area (NOT 19.2.3.1.1 — verified vs the 2019 doc)
    expect(clauses).toContain("§27.2.4.2.1"); // remote-area 1.2·√A shape
  });

  it("FM is verified for non-storage and the grounded DS 8-9 storage tables", () => {
    const r = standardReferences("fmds")!;
    expect(r.verified).toBe(true);
    expect(r.clauses.some((c) => c.clause.includes("DS 3-26 Table 2.3.1.10"))).toBe(true);
    expect(r.clauses.some((c) => c.clause.includes("DS 8-9 Tables 2–6"))).toBe(true); // grounded, no longer AUDIT
  });

  it("EN 12845 / AS 2118 are representative (not yet verified)", () => {
    expect(standardReferences("en12845")!.verified).toBe(false);
    expect(standardReferences("as2118")!.verified).toBe(false);
  });

  it("RSC mandates NFPA 13 (OH2) for Bangladesh RMG; BNBC cites Table 4.4.7", () => {
    const rsc = jurisdictionReferences("rsc")!;
    expect(rsc.adopts).toMatch(/NFPA 13/);
    expect(rsc.body).toMatch(/RMG/);
    expect(jurisdictionReferences("bnbc")!.clauses.some((c) => c.clause.includes("4.4.7"))).toBe(true);
    expect(GOVERNING_CODES).toContain("rsc");
  });

  it("unknown ids return undefined", () => {
    expect(standardReferences("bogus")).toBeUndefined();
    expect(jurisdictionReferences(undefined)).toBeUndefined();
  });
});
