/**
 * NFPA 13 coverage & spacing verification — beyond hydraulics, each sprinkler
 * must protect no more than the maximum area for the hazard, and adjacent heads
 * must be no farther apart than the maximum spacing. This checks each head's
 * assigned coverage area against the limit and its branch-line feed length (the
 * along-branch spacing) against the maximum spacing.
 *
 * ⚠ Representative standard-coverage, unobstructed-construction limits — AUDIT
 * against the applicable NFPA 13 spacing tables (limits vary by construction,
 * sprinkler type/listing and obstruction) before production use.
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
  return {
    hazard,
    maxAreaFt2: lim.maxAreaFt2,
    maxSpacingFt: lim.maxSpacingFt,
    heads,
    overCoverage: heads.filter((h) => h.overCoverage).length,
    overSpacing: heads.filter((h) => h.overSpacing).length,
  };
}
