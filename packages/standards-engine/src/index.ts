import type { StandardId, StandardModule } from "./types";
import { nfpa13 } from "./nfpa13";
import { nfpa13d } from "./nfpa13d";
import { nfpa13r } from "./nfpa13r";
import { nfpa14 } from "./nfpa14";
import { en12845 } from "./en12845";

export * from "./types";
export * from "./tables-nfpa13";
export * from "./materials";
export { nfpa13, nfpa13d, nfpa13r, nfpa14, en12845 };

const REGISTRY: Partial<Record<StandardId, StandardModule>> = {
  nfpa13,
  nfpa13d,
  nfpa13r,
  nfpa14,
  en12845,
  // fmds, iso — scaffolded next
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
