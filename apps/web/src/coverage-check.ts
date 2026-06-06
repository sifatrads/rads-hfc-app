/**
 * NFPA 13 coverage & spacing verification — beyond hydraulics, each sprinkler
 * must protect no more than the maximum area for the hazard, and adjacent heads
 * must be no farther apart than the maximum spacing. This checks each head's
 * assigned coverage area against the limit and its branch-line feed length (the
 * along-branch spacing) against the maximum spacing.
 *
 * Standard-coverage limits below match NFPA 13 (LH 225 / OH 130 / EH 100 ft²;
 * 15 / 15 / 12 ft spacing) and BNBC 2020 Table 4.4.7 — the basis the RSC Fire
 * Safety Manual mandates for Bangladesh RMG buildings (NFPA 13, OH2). Limits
 * still vary with construction type, sprinkler listing and obstructions, so
 * confirm the exact cell for the project before issuing.
 */
import type { ProjectModel } from "@rads/model";

export interface HeadCoverage {
  id: string;
  coverageFt2: number;
  spacingFt: number;
  overCoverage: boolean;
  overSpacing: boolean;
}
export interface CoverageReport {
  hazard: string;
  maxAreaFt2: number;
  maxSpacingFt: number;
  heads: HeadCoverage[];
  overCoverage: number;
  overSpacing: number;
  /** Sum of the installed heads' protection areas (ft²). */
  totalCoverageFt2: number;
  /** Building / floor footprint to protect (ft²), when given, + adequacy. */
  protectedAreaFt2?: number;
  buildingCoverageOk?: boolean;
}

/** Standard-coverage, unobstructed limits {maxArea ft², maxSpacing ft} by hazard. */
function limitsFor(hazard: string): { maxAreaFt2: number; maxSpacingFt: number } {
  const h = hazard.toLowerCase();
  if (h.startsWith("lh") || h === "light" || h === "elh") return { maxAreaFt2: 225, maxSpacingFt: 15 };
  if (h.startsWith("eh") || h.startsWith("hh") || h === "hc-3") return { maxAreaFt2: 100, maxSpacingFt: 12 };
  return { maxAreaFt2: 130, maxSpacingFt: 15 }; // ordinary hazard (default)
}

export function checkCoverageSpacing(model: ProjectModel): CoverageReport {
  const hazard = String(model.meta.hazardClass ?? "oh2");
  const lim = limitsFor(hazard);
  // along-branch spacing ≈ the longest pipe feeding each head from upstream.
  const feedLen = new Map<string, number>();
  for (const p of model.network.pipes) {
    const len = Math.max(0, (p.lengthFt ?? 0) + (p.additionalLengthFt ?? 0));
    feedLen.set(p.to, Math.max(feedLen.get(p.to) ?? 0, len));
  }
  const heads: HeadCoverage[] = model.network.nodes
    .filter((n) => n.type === "sprinkler" && (n.kFactor ?? 0) > 0)
    .map((n) => {
      const coverageFt2 = n.coverageAreaFt2 ?? 0;
      const spacingFt = feedLen.get(n.id) ?? 0;
      return { id: n.id, coverageFt2, spacingFt, overCoverage: coverageFt2 > lim.maxAreaFt2, overSpacing: spacingFt > lim.maxSpacingFt };
    });
  const totalCoverageFt2 = Math.round(heads.reduce((sum, h) => sum + h.coverageFt2, 0));
  const protRaw = (model.meta as Record<string, unknown>)["protectedAreaFt2"];
  const protectedAreaFt2 = typeof protRaw === "number" && protRaw > 0 ? protRaw : undefined;
  return {
    hazard,
    maxAreaFt2: lim.maxAreaFt2,
    maxSpacingFt: lim.maxSpacingFt,
    heads,
    overCoverage: heads.filter((h) => h.overCoverage).length,
    overSpacing: heads.filter((h) => h.overSpacing).length,
    totalCoverageFt2,
    ...(protectedAreaFt2 !== undefined ? { protectedAreaFt2, buildingCoverageOk: totalCoverageFt2 >= protectedAreaFt2 - 1e-6 } : {}),
  };
}
