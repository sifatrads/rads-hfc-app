/**
 * Versioned migrations for the project model. Each entry upgrades a raw object
 * from version N to N+1, in place-safe fashion (returns a new top-level object).
 * Run via `migrate()` before zod parsing.
 */

export const CURRENT_SCHEMA_VERSION = 2;

type Raw = Record<string, unknown>;

const asObj = (v: unknown): Raw => (typeof v === "object" && v !== null ? (v as Raw) : {});

/** Best-effort display-string → engine standard id. */
function deriveStandardId(standard: unknown): string {
  const s = String(standard ?? "").toLowerCase();
  if (s.includes("en 12845") || s.includes("en12845")) return "en12845";
  if (s.includes("nfpa 13d") || s.includes("13d")) return "nfpa13d";
  if (s.includes("nfpa 13r") || s.includes("13r")) return "nfpa13r";
  if (s.includes("nfpa 14") || s.includes("standpipe")) return "nfpa13"; // standpipe still uses NFPA hydraulics
  return "nfpa13";
}

/**
 * v1 → v2: introduce the typed engineering shape.
 * - guarantee `network.{nodes,pipes,valves}` arrays
 * - backfill `meta.standardId` from `meta.standard` when missing
 */
function v1ToV2(raw: Raw): Raw {
  const meta = asObj(raw["meta"]);
  const network = asObj(raw["network"]);
  return {
    ...raw,
    schemaVersion: 2,
    meta: {
      ...meta,
      standardId: meta["standardId"] ?? deriveStandardId(meta["standard"]),
    },
    network: {
      ...network,
      nodes: Array.isArray(network["nodes"]) ? network["nodes"] : [],
      pipes: Array.isArray(network["pipes"]) ? network["pipes"] : [],
      valves: Array.isArray(network["valves"]) ? network["valves"] : [],
    },
  };
}

const MIGRATIONS: Record<number, (raw: Raw) => Raw> = {
  1: v1ToV2,
};

/**
 * Upgrade a raw project object to {@link CURRENT_SCHEMA_VERSION}. Objects with
 * no `schemaVersion` are treated as v1. Unknown future versions pass through.
 */
export function migrate(value: unknown): Raw {
  let raw = asObj(value);
  let version = typeof raw["schemaVersion"] === "number" ? (raw["schemaVersion"] as number) : 1;
  while (version < CURRENT_SCHEMA_VERSION && MIGRATIONS[version]) {
    raw = MIGRATIONS[version]!(raw);
    version = typeof raw["schemaVersion"] === "number" ? (raw["schemaVersion"] as number) : version + 1;
  }
  return raw;
}
