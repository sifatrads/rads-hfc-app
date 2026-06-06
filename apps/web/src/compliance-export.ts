/**
 * Compliance summary — a structured, machine-readable hand-off of a finished
 * design for an external review engine (rads-agentic-ai: a RAG compliance
 * auditor). It bundles the design basis, the demand/supply result, the
 * coverage/spacing + design-area checks, validation issues and the standard
 * clauses the design claims compliance with, so the auditor can verify each
 * value against the cited standard. Values are canonical imperial (psi/gpm/ft);
 * `project.units` records the display units.
 */
import type { ProjectModel } from "@rads/model";
import type { ProjectSolution } from "@rads/solve";
import { standardReferences, jurisdictionReferences, type ClauseRef } from "@rads/standards-engine";
import { checkCoverageSpacing } from "./coverage-check";
import { compareDesignAreas } from "./design-areas";
import { checkModel, issueCounts } from "./network-validate";

export interface ComplianceSummary {
  schema: "rads-hfc-compliance/1";
  generatedFor: string;
  project: {
    id: string; name: string; standard?: string; standardId?: string; edition?: string;
    governingCode?: string; occupancyHazard?: string; systemType?: string; fillType?: string;
    units: string; engineer?: string; date?: string;
  };
  designBasis: {
    method: string; hydraulicMethod: "hazen-williams" | "darcy-weisbach";
    densityGpmFt2?: number; designAreaFt2?: number; operatingSprinklers?: number;
    sprinklerKFactor?: number; minSprinklerPressurePsi?: number; hoseAllowanceGpm?: number; durationMin?: number;
  };
  demand: { systemFlowGpm?: number; totalDemandGpm?: number; requiredSourcePressurePsi?: number; mostRemoteHead?: { id: string; pressurePsi?: number; flowGpm?: number } };
  supply: { staticPsi?: number; residualPsi?: number; testFlowGpm?: number; availablePsi?: number; marginPsi?: number; passesSupply: boolean; requiredStoredGal?: number; availableStoredGal?: number; storedWaterAdequate?: boolean; durationMin?: number };
  result: { pass: boolean; meetsMinPressure: boolean; passesSupply: boolean; converged: boolean };
  coverageSpacing: { hazard: string; maxAreaFt2: number; maxSpacingFt: number; headsChecked: number; overCoverage: number; overSpacing: number };
  designAreaProof: { areasChecked: number; governing?: { label: string; requiredSourcePressurePsi: number; marginPsi: number; passes: boolean } } | null;
  validation: { errors: string[]; warnings: string[] };
  references: { standard: string; edition?: string; verified: boolean; clauses: ClauseRef[] } | null;
  jurisdiction: { code: string; title: string; adopts: string; clauses: ClauseRef[] } | null;
  disclaimer: string;
}

const numOf = (o: Record<string, unknown> | undefined, k: string): number | undefined => (typeof o?.[k] === "number" ? (o[k] as number) : undefined);
const r = (v: number | undefined, d = 2): number | undefined => (typeof v === "number" && Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);

export function buildComplianceSummary(model: ProjectModel, solution: ProjectSolution): ComplianceSummary {
  const s = solution.summary;
  const m = model.meta;
  const db = (model.designBasis ?? {}) as Record<string, unknown>;
  const ws = (model.waterSupply ?? {}) as Record<string, unknown>;
  const ft = (ws["flowTest"] ?? {}) as Record<string, unknown>;
  const std = standardReferences(m.standardId);
  const jur = jurisdictionReferences(m.governingCode);
  const cov = checkCoverageSpacing(model);
  const issues = checkModel(model);
  const counts = issueCounts(issues);

  let designAreaProof: ComplianceSummary["designAreaProof"] = null;
  try {
    const areas = compareDesignAreas(model);
    const g = areas[0];
    designAreaProof = { areasChecked: areas.length, ...(g ? { governing: { label: g.label, requiredSourcePressurePsi: r(g.sourcePressurePsi)!, marginPsi: r(g.marginPsi)!, passes: g.passes } } : {}) };
  } catch { /* skip if unsolvable */ }

  const remote = s.mostRemoteSprinkler;
  return {
    schema: "rads-hfc-compliance/1",
    generatedFor: String(m.name ?? m.id ?? "project"),
    project: {
      id: String(m.id ?? "—"), name: String(m.name ?? "—"),
      standard: m.standard as string | undefined, standardId: m.standardId as string | undefined, edition: std?.edition,
      governingCode: m.governingCode as string | undefined, occupancyHazard: m.hazardClass as string | undefined,
      systemType: (m.systemType as string) ?? "sprinkler", fillType: (m.fillType as string) ?? "wet",
      units: String(m.units ?? "imperial"), engineer: m.engineer as string | undefined, date: m.date as string | undefined,
    },
    designBasis: {
      method: String(db["method"] ?? "density/area"),
      hydraulicMethod: db["frictionMethod"] === "darcy-weisbach" || db["frictionMethod"] === "dw" ? "darcy-weisbach" : "hazen-williams",
      densityGpmFt2: numOf(db, "densityGpmFt2"), designAreaFt2: numOf(db, "designAreaFt2"),
      operatingSprinklers: numOf(db, "operatingSprinklers") ?? s.operatingHeads, sprinklerKFactor: numOf(db, "sprinklerKFactor"),
      minSprinklerPressurePsi: r(s.minSprinklerPressurePsi), hoseAllowanceGpm: r(s.hoseAllowanceGpm, 1), durationMin: s.durationMin,
    },
    demand: {
      systemFlowGpm: r(s.systemFlowGpm, 1), totalDemandGpm: r(s.totalDemandGpm, 1), requiredSourcePressurePsi: r(s.sourcePressurePsi),
      ...(remote ? { mostRemoteHead: { id: remote.id, pressurePsi: r(remote.pressurePsi), flowGpm: r(remote.flowGpm, 1) } } : {}),
    },
    supply: {
      staticPsi: numOf(ft, "staticPsi"), residualPsi: numOf(ft, "residualPsi"), testFlowGpm: numOf(ft, "testFlowGpm"),
      availablePsi: r(s.availablePsi), marginPsi: r(s.marginPsi), passesSupply: !!s.passesSupply,
      requiredStoredGal: r(s.requiredStoredGal, 0), availableStoredGal: r(s.availableStoredGal, 0), storedWaterAdequate: s.storedWaterAdequate, durationMin: s.durationMin,
    },
    result: { pass: !!(s.passesSupply && s.meetsMinPressure), meetsMinPressure: !!s.meetsMinPressure, passesSupply: !!s.passesSupply, converged: !!s.converged },
    coverageSpacing: { hazard: cov.hazard, maxAreaFt2: cov.maxAreaFt2, maxSpacingFt: cov.maxSpacingFt, headsChecked: cov.heads.length, overCoverage: cov.overCoverage, overSpacing: cov.overSpacing },
    designAreaProof,
    validation: {
      errors: issues.filter((i) => i.severity === "error").map((i) => i.message),
      warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message),
    },
    references: std ? { standard: std.standard, edition: std.edition, verified: std.verified, clauses: std.clauses } : null,
    jurisdiction: jur ? { code: jur.code, title: jur.title, adopts: jur.adopts, clauses: jur.clauses } : null,
    disclaimer: `Calculation aid output — ${counts.errors} error(s), ${counts.warnings} warning(s) at export. Must be reviewed and stamped by a licensed fire protection engineer and accepted by the AHJ.`,
  };
}
