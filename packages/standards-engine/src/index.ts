import type { StandardId, StandardModule } from "./types";
import { nfpa13 } from "./nfpa13";
import { en12845 } from "./en12845";

export * from "./types";
export { nfpa13, en12845 };

const REGISTRY: Partial<Record<StandardId, StandardModule>> = {
  nfpa13,
  en12845,
  // nfpa13r, nfpa13d, fmds, iso — scaffolded next (plan: all standards from day 1)
};

/** Get an implemented standard module, or throw if not yet available. */
export function getStandard(id: StandardId): StandardModule {
  const mod = REGISTRY[id];
  if (!mod) throw new Error(`Standard '${id}' is not implemented yet.`);
  return mod;
}

/** Standards currently implemented (have data + rules). */
export function availableStandards(): StandardId[] {
  return Object.keys(REGISTRY) as StandardId[];
}
