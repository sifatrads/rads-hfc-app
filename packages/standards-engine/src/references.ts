/**
 * Prepared standard references (clause citations) for the design-philosophy /
 * basis-of-design narrative. Each design standard lists the specific
 * clauses/tables that govern hazard classification, design demand, hydraulics,
 * C-factors, fittings and minimum pressure — grounded against the real documents
 * where verified (NFPA 13/14, FM DS 3-26), AUDIT-flagged where representative.
 *
 * Governing jurisdiction codes (BNBC / RSC / IBC) sit above the design standard:
 * they ADOPT a design standard (e.g. NFPA 13 for Bangladesh RMG) and add their
 * own occupancy / coverage requirements.
 */
export interface ClauseRef { topic: string; clause: string }
export interface StandardReference {
  standard: string;
  edition?: string;
  verified: boolean; // true = cross-checked against the printed document
  clauses: ClauseRef[];
}
export interface JurisdictionReference {
  code: string; // short tag for citations (e.g. "RSC")
  title: string; // full document name
  body: string;
  adopts: string; // the design standard it mandates
  clauses: ClauseRef[];
}

const STANDARD_REFS: Record<string, StandardReference> = {
  nfpa13: {
    standard: "NFPA 13 — Standard for the Installation of Sprinkler Systems",
    edition: "2019",
    verified: true,
    clauses: [
      { topic: "Occupancy hazard classification", clause: "§4.3 (Light / Ordinary / Extra Hazard)" },
      { topic: "Density/area design approach", clause: "§19.2; Figure 19.2.3.1.1" },
      { topic: "Hose-stream allowance & water-supply duration", clause: "Table 19.3.3.1.2" },
      { topic: "Hydraulic calculation procedure", clause: "Chapter 27" },
      { topic: "Hazen-Williams C-factors", clause: "Table 27.2.4.8.1" },
      { topic: "Fitting & valve equivalent pipe lengths", clause: "Table 27.2.3.1.1" },
      { topic: "Minimum operating pressure at the most remote sprinkler", clause: "§27.2 (7 psi / 0.5 bar)" },
    ],
  },
  nfpa13d: {
    standard: "NFPA 13D — Sprinkler Systems in One- and Two-Family Dwellings and Manufactured Homes",
    edition: "2019",
    verified: false,
    clauses: [
      { topic: "Design — two most-remote sprinklers (single-/two-family)", clause: "§10.1" },
      { topic: "Minimum flow & pressure per the sprinkler listing", clause: "§8.1" },
    ],
  },
  nfpa13r: {
    standard: "NFPA 13R — Sprinkler Systems in Low-Rise Residential Occupancies",
    edition: "2019",
    verified: false,
    clauses: [
      { topic: "Design — four most-remote sprinklers", clause: "§6.x" },
      { topic: "Minimum flow & pressure per the sprinkler listing", clause: "§6.x" },
    ],
  },
  nfpa14: {
    standard: "NFPA 14 — Standpipe and Hose Systems",
    edition: "2019",
    verified: true,
    clauses: [
      { topic: "Class I/III: 500 gpm first standpipe + 250 gpm each additional, max 1000 gpm", clause: "§7.10.1.1" },
      { topic: "Minimum residual pressure 100 psi (Class I/III) / 65 psi at 1½″ outlets", clause: "§7.8 / §7.10" },
      { topic: "Hydraulic calculation & working plans", clause: "§8 / NFPA 13 Ch. 27" },
    ],
  },
  nfpa15: {
    standard: "NFPA 15 — Water Spray Fixed Systems for Fire Protection",
    edition: "2017",
    verified: false,
    clauses: [
      { topic: "Design — all nozzles in the zone discharge (deluge)", clause: "§7" },
      { topic: "Design density over the protected surface/area", clause: "§7.4" },
    ],
  },
  nfpa20: {
    standard: "NFPA 20 — Stationary Pumps for Fire Protection",
    edition: "2019",
    verified: true,
    clauses: [
      { topic: "Pump-rated performance & 150% overload point", clause: "§4 (rated / churn / 150%)" },
      { topic: "Suction-pipe velocity limit (≤ 15 ft/s at 150% flow)", clause: "§4.15 / A.4.15" },
    ],
  },
  nfpa750: {
    standard: "NFPA 750 — Water Mist Fire Protection Systems",
    edition: "2019",
    verified: false,
    clauses: [
      { topic: "Performance-based design per the listed nozzle (K, spacing, minimum pressure)", clause: "Listing-driven" },
      { topic: "High-pressure hydraulics (Darcy-Weisbach, fluid properties)", clause: "§ (engineering analysis)" },
    ],
  },
  en12845: {
    standard: "EN 12845 — Fixed firefighting systems · Automatic sprinkler systems",
    verified: false,
    clauses: [
      { topic: "Hazard classes (LH / OH1–4 / HHP / HHS) & design densities", clause: "§7 (representative — AUDIT)" },
      { topic: "Hazen-Williams C = 100 (all materials)", clause: "§ (representative — AUDIT)" },
      { topic: "Equivalent lengths (Table 23) & four most-unfavourable sprinklers", clause: "Table 23 / §15.2 (representative — AUDIT)" },
    ],
  },
  fmds: {
    standard: "FM Global Property Loss Prevention Data Sheets",
    verified: true,
    clauses: [
      { topic: "Non-storage occupancy hazard categories HC-1/2/3 — design demand", clause: "DS 3-26 Table 2.3.1.10 (verified, ≤30 ft / wet)" },
      { topic: "Minimum pressure 7 psi; hose 250/250/500 gpm; 60-min supply", clause: "DS 3-26 §2.3.1.11–2.3.1.13" },
      { topic: "Storage (ESFR/CMSA) ceiling protection — count-at-pressure", clause: "DS 8-9 Tables 3.3.7.x (representative — AUDIT)" },
      { topic: "Installation & hydraulics", clause: "DS 2-0 / DS 3-0" },
    ],
  },
  as2118: {
    standard: "AS 2118.1 — Automatic fire sprinkler systems (Australia)",
    verified: false,
    clauses: [
      { topic: "Hazard classes (ELH/LH/OH1–3/HH) & design densities over the AMAO", clause: "§ (representative — AUDIT)" },
    ],
  },
};

const JURISDICTION_REFS: Record<string, JurisdictionReference> = {
  bnbc: {
    code: "BNBC 2020",
    title: "Bangladesh National Building Code 2020",
    body: "Bangladesh National Building Code",
    adopts: "NFPA 13",
    clauses: [
      { topic: "Sprinkler protection — Part 4 (Fire Protection)", clause: "Part 4, §4.x" },
      { topic: "Sprinkler coverage area & spacing by hazard", clause: "Table 4.4.7" },
      { topic: "Hydraulic design per NFPA 13 (no pipe schedules)", clause: "adopts NFPA 13" },
    ],
  },
  rsc: {
    code: "RSC",
    title: "RSC Fire Safety Manual for RMG Buildings",
    body: "RMG Sustainability Council (Bangladesh)",
    adopts: "NFPA 13 (Ordinary Hazard Group II)",
    clauses: [
      { topic: "Hydraulically-calculated sprinkler design per NFPA 13 (pipe schedules not permitted)", clause: "Sprinkler Systems ch." },
      { topic: "Occupancy: Ordinary Hazard Group II (garment manufacturing)", clause: "per NFPA 13 (2013) A.5.3.2" },
      { topic: "Identify the hydraulically most-remote / most-demanding area", clause: "DEA submission checklist" },
      { topic: "Standpipe per NFPA 14 (65 psi at the most remote outlet)", clause: "Standpipes ch." },
    ],
  },
  ibc: {
    code: "IBC 2021",
    title: "International Building Code 2021",
    body: "International Building Code",
    adopts: "NFPA 13",
    clauses: [{ topic: "Automatic sprinkler systems", clause: "§903 (references NFPA 13)" }],
  },
};

/** Prepared clause references for a design standard, or undefined if none. */
export function standardReferences(standardId: string | undefined): StandardReference | undefined {
  return standardId ? STANDARD_REFS[standardId] : undefined;
}

/** Prepared references for a governing jurisdiction code (BNBC / RSC / IBC). */
export function jurisdictionReferences(code: string | undefined): JurisdictionReference | undefined {
  return code ? JURISDICTION_REFS[code] : undefined;
}

/** Governing-code ids offered in the UI. */
export const GOVERNING_CODES = ["bnbc", "rsc", "ibc"] as const;
