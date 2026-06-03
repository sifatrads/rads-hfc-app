/**
 * Pipe material database — internal diameters (in) by nominal size + default
 * Hazen-Williams C-factor, for the common fire-protection materials. The pipe's
 * `material` id selects both the material and its wall schedule/type (e.g.
 * "steel-sch40", "copper-l", "cpvc"). Diameters drive friction loss + velocity;
 * the C-factor defaults from the material unless the pipe overrides it.
 *
 * Sources: NFPA 13 Ch.27 (steel Sch 10/40), ASTM B88 (copper K/L/M drawn),
 * listed CPVC (SDR 13.5, CTS), AWWA C151/C104 (cement-lined ductile iron — ⚠
 * approximate, class-dependent; AUDIT before production use).
 */
import { SCH40_ID_IN } from "./tables-nfpa13";

export type MaterialFamily = "steel" | "copper" | "cpvc" | "pvc" | "ductile-iron" | "stainless";

export interface PipeMaterial {
  id: string;
  label: string;
  family: MaterialFamily;
  /** Default Hazen-Williams C (NFPA 13 Table 27.2.4.8.1). */
  defaultCFactor: number;
  /** nominal size → internal diameter (in). */
  idIn: Record<string, number>;
}

/** Steel Schedule 10 internal diameters, in. */
const STEEL_SCH10: Record<string, number> = {
  "1/2": 0.674, "3/4": 0.884, "1": 1.097, "1-1/4": 1.442, "1-1/2": 1.682, "2": 2.157,
  "2-1/2": 2.635, "3": 3.26, "3-1/2": 3.76, "4": 4.26, "5": 5.295, "6": 6.357, "8": 8.249, "10": 10.37, "12": 12.39,
};
/** Copper drawn tube — Type K (heavy wall), ASTM B88, in. */
const COPPER_K: Record<string, number> = {
  "1/2": 0.527, "3/4": 0.745, "1": 0.995, "1-1/4": 1.245, "1-1/2": 1.481, "2": 1.959,
  "2-1/2": 2.435, "3": 2.907, "3-1/2": 3.385, "4": 3.857, "5": 4.805, "6": 5.741, "8": 7.583,
};
/** Copper drawn tube — Type L (standard for fire), ASTM B88, in. */
const COPPER_L: Record<string, number> = {
  "1/2": 0.545, "3/4": 0.785, "1": 1.025, "1-1/4": 1.265, "1-1/2": 1.505, "2": 1.985,
  "2-1/2": 2.465, "3": 2.945, "3-1/2": 3.425, "4": 3.905, "5": 4.875, "6": 5.845, "8": 7.725,
};
/** Copper drawn tube — Type M (thin wall), ASTM B88, in. */
const COPPER_M: Record<string, number> = {
  "1/2": 0.569, "3/4": 0.811, "1": 1.055, "1-1/4": 1.291, "1-1/2": 1.527, "2": 2.009,
  "2-1/2": 2.495, "3": 2.981, "3-1/2": 3.459, "4": 3.935, "5": 4.907, "6": 5.881, "8": 7.785,
};
/** Listed CPVC sprinkler pipe (SDR 13.5, CTS), in. */
const CPVC: Record<string, number> = {
  "3/4": 0.874, "1": 1.101, "1-1/4": 1.394, "1-1/2": 1.598, "2": 2.003, "2-1/2": 2.423, "3": 2.95,
};
/** Cement-lined ductile iron (approx, class-dependent — AUDIT), in. */
const DUCTILE_IRON: Record<string, number> = {
  "3": 3.3, "4": 4.1, "6": 6.14, "8": 8.13, "10": 10.1, "12": 12.12,
};

export const PIPE_MATERIALS: PipeMaterial[] = [
  { id: "steel-sch40", label: "Steel — Schedule 40", family: "steel", defaultCFactor: 120, idIn: SCH40_ID_IN },
  { id: "steel-sch10", label: "Steel — Schedule 10", family: "steel", defaultCFactor: 120, idIn: STEEL_SCH10 },
  { id: "copper-l", label: "Copper — Type L", family: "copper", defaultCFactor: 150, idIn: COPPER_L },
  { id: "copper-k", label: "Copper — Type K", family: "copper", defaultCFactor: 150, idIn: COPPER_K },
  { id: "copper-m", label: "Copper — Type M", family: "copper", defaultCFactor: 150, idIn: COPPER_M },
  { id: "cpvc", label: "CPVC (listed)", family: "cpvc", defaultCFactor: 150, idIn: CPVC },
  { id: "pvc-sch40", label: "PVC — Schedule 40", family: "pvc", defaultCFactor: 150, idIn: SCH40_ID_IN },
  { id: "ductile-iron", label: "Ductile Iron (cement-lined)", family: "ductile-iron", defaultCFactor: 140, idIn: DUCTILE_IRON },
  { id: "stainless-sch10", label: "Stainless — Sch 10S", family: "stainless", defaultCFactor: 150, idIn: STEEL_SCH10 },
];

export const DEFAULT_MATERIAL_ID = "steel-sch40";
const BY_ID = new Map(PIPE_MATERIALS.map((m) => [m.id, m]));

/** Resolve a raw material string (incl. legacy "copper"/"steel") to a known id. */
export function resolveMaterialId(raw?: string): string {
  if (!raw) return DEFAULT_MATERIAL_ID;
  if (BY_ID.has(raw)) return raw;
  const r = raw.toLowerCase();
  if (r.includes("copper")) return "copper-l";
  if (r.includes("cpvc")) return "cpvc";
  if (r.includes("pvc")) return "pvc-sch40";
  if (r.includes("ductile") || r.includes("iron")) return "ductile-iron";
  if (r.includes("stainless") || r === "ss") return "stainless-sch10";
  if (r.includes("sch10") || r.includes("schedule 10") || r.includes("sch 10")) return "steel-sch10";
  return DEFAULT_MATERIAL_ID;
}

export function pipeMaterial(id?: string): PipeMaterial {
  return BY_ID.get(resolveMaterialId(id))!;
}

/** Internal diameter (in) for a material + nominal size; Sch-40 fallback for unlisted sizes. */
export function internalDiameterForMaterial(materialId: string | undefined, nominalSize: string): number {
  return pipeMaterial(materialId).idIn[nominalSize] ?? SCH40_ID_IN[nominalSize] ?? 1.049;
}

/** Default Hazen-Williams C-factor for a material. */
export function defaultCFactorForMaterial(materialId: string | undefined): number {
  return pipeMaterial(materialId).defaultCFactor;
}
