/**
 * Supply robustness / contingency analysis — re-solves the SAME design against
 * degraded water-supply scenarios (fire pump off, a weakened city supply) so the
 * designer can see how much margin survives a single failure. Relevant for RMG
 * factories, where the RSC requires duty + standby pumps: "does the system still
 * deliver if the pump is out?".
 */
import type { ProjectModel } from "@rads/model";
import { solveProject } from "@rads/solve";

export interface SupplyScenario {
  label: string;
  note?: string;
  availablePsi: number;
  requiredPsi: number;
  marginPsi: number;
  passes: boolean;
}

export function compareSupplyScenarios(model: ProjectModel): SupplyScenario[] {
  const ws = (model.waterSupply ?? {}) as Record<string, unknown>;
  const ft = (ws["flowTest"] ?? {}) as Record<string, unknown>;
  const fixed = ws["supplyType"] === "fixed-pressure";
  const deg = 0.85; // 15% degraded

  const variants: { label: string; note?: string; ws: Record<string, unknown> }[] = [{ label: "As designed", ws }];
  if (ws["firePump"]) variants.push({ label: "Fire pump off", note: "single-failure contingency", ws: { ...ws, firePump: undefined } });
  if (fixed && typeof ws["fixedPressurePsi"] === "number") {
    variants.push({ label: "Supply −15%", note: "degraded tank head", ws: { ...ws, fixedPressurePsi: (ws["fixedPressurePsi"] as number) * deg } });
  } else if (typeof ft["residualPsi"] === "number") {
    variants.push({ label: "Supply −15%", note: "static & residual −15%", ws: { ...ws, flowTest: { ...ft, ...(typeof ft["staticPsi"] === "number" ? { staticPsi: (ft["staticPsi"] as number) * deg } : {}), residualPsi: (ft["residualPsi"] as number) * deg } } });
  }

  return variants.map((v) => {
    try {
      const s = solveProject({ ...model, waterSupply: v.ws } as ProjectModel).summary;
      return { label: v.label, ...(v.note ? { note: v.note } : {}), availablePsi: s.availablePsi, requiredPsi: s.sourcePressurePsi, marginPsi: s.marginPsi, passes: !!(s.passesSupply && s.meetsMinPressure) };
    } catch {
      return { label: v.label, note: "did not solve", availablePsi: 0, requiredPsi: 0, marginPsi: 0, passes: false };
    }
  });
}
