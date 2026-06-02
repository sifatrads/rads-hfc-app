/**
 * RADS-HFC-APP project model — zod schema (schemaVersion 2).
 *
 * The decoded contents of a `.rhfc` file. On disk this is always wrapped in the
 * encrypted single-file container (`@rads/container`); it is never written as
 * plain JSON.
 *
 * Every object uses `.passthrough()` so unknown/future fields survive a
 * parse→serialize round-trip (a project model must never silently drop data).
 * Types are inferred from the schema (single source of truth).
 */
import { z } from "zod";

export const UnitsSchema = z.enum(["imperial", "metric"]);

/** Cardinal routing code (Canute-compatible): horizontal N/S/E/W, vertical U/D. */
export const DirectionSchema = z.enum(["N", "S", "E", "W", "U", "D"]);

/** Explicit 3D position in model units (geometry source of truth when present). */
export const Vec3Schema = z.object({ x: z.number(), y: z.number(), z: z.number() }).passthrough();

export const FittingSchema = z
  .object({
    type: z.string(),
    qty: z.number().default(1),
    equivalentLengthFt: z.number().default(0),
  })
  .passthrough();

export const NodeSchema = z
  .object({
    id: z.string(),
    type: z.string(), // "sprinkler" | "junction" | "hose-station" | ...
    elevationFt: z.number().default(0),
    kFactor: z.number().optional(),
    coverageAreaFt2: z.number().optional(),
    sprinkler: z.string().optional(), // "pendent" | "upright" | "sidewall" | ...
    standpipe: z.number().optional(),
    floor: z.number().optional(),
    hoseValveSizeIn: z.number().optional(),
    hoseValve: z.boolean().optional(),
    flowGpm: z.number().optional(),
    /** Explicit geometry; when absent, @rads/geometry auto-layout fills it. */
    geometry: Vec3Schema.optional(),
    note: z.string().optional(),
  })
  .passthrough();

export const PipeSchema = z
  .object({
    id: z.string(),
    from: z.string(),
    to: z.string(),
    role: z.string().optional(), // "branch-line" | "cross-main" | "feed-main" | "riser" | "supply-main" | "standpipe-riser"
    material: z.string().optional(),
    cFactor: z.number().optional(),
    nominalSize: z.string().optional(),
    internalDiameterIn: z.number().optional(),
    lengthFt: z.number().default(0),
    elevationChangeFt: z.number().optional(),
    /** Canute-compatible routing direction; alternate geometry input. */
    direction: DirectionSchema.optional(),
    fittings: z.array(FittingSchema).default([]),
    standpipe: z.number().optional(),
  })
  .passthrough();

export const ValveSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    onPipe: z.string().optional(),
    sizeIn: z.union([z.string(), z.number()]).optional(),
    equivalentLengthFt: z.number().optional(),
    supervised: z.boolean().optional(),
    subtype: z.string().optional(),
    setPressurePsi: z.number().optional(),
    appliesTo: z.string().optional(),
  })
  .passthrough();

/** Water storage: ground/elevated tank or reservoir, with physical dimensions. */
export const ReservoirSchema = z
  .object({
    id: z.string().optional(),
    kind: z.string().optional(), // "ground-tank" | "elevated-tank" | "reservoir" | ...
    heightFt: z.number().optional(),
    lengthFt: z.number().optional(),
    widthFt: z.number().optional(),
    diameterFt: z.number().optional(),
    capacityGal: z.number().optional(),
    levelFt: z.number().optional(),
    baseElevationFt: z.number().optional(),
    connectedNode: z.string().optional(),
  })
  .passthrough();

/** Pump suction line (source → pump). Feeds calc-engine `pumpOnSuction`. */
export const SuctionSchema = z
  .object({
    fromSource: z.string().optional(),
    toPumpNode: z.string().optional(),
    sizeIn: z.number().optional(),
    lengthFt: z.number().optional(),
    material: z.string().optional(),
    cFactor: z.number().optional(),
    liftFt: z.number().optional(), // negative = flooded suction
    fittings: z.array(FittingSchema).default([]),
  })
  .passthrough();

export const PumpCurvePointSchema = z
  .object({ flowGpm: z.number(), psi: z.number(), rpm: z.number().optional() })
  .passthrough();

export const PumpDatasheetSchema = z
  .object({
    make: z.string().optional(),
    model: z.string().optional(),
    type: z.string().optional(), // "horizontal-split-case" | "vertical-turbine" | "end-suction" | ...
    listed: z.string().optional(),
    ratedFlowGpm: z.number().optional(),
    ratedPsi: z.number().optional(),
    churnPsi: z.number().optional(),
    overloadFlowGpm: z.number().optional(),
    overloadPsi: z.number().optional(),
    rpm: z.number().optional(),
    impellerIn: z.number().optional(),
    motorHp: z.number().optional(),
    driver: z.string().optional(), // "electric" | "diesel"
  })
  .passthrough();

/** Pump in three forms: nameplate datasheet, hydraulic-calc points, shop-test curve. */
export const PumpSchema = z
  .object({
    datasheet: PumpDatasheetSchema.optional(),
    /** Manufacturer/datasheet performance curve (churn → rated → 150%). */
    ratedCurve: z.array(PumpCurvePointSchema).optional(),
    /** Field/factory acceptance ("shop") test points. */
    shopTest: z.array(PumpCurvePointSchema).optional(),
    atNode: z.string().optional(),
  })
  .passthrough();

export const NetworkSchema = z
  .object({
    nodes: z.array(NodeSchema).default([]),
    pipes: z.array(PipeSchema).default([]),
    valves: z.array(ValveSchema).default([]),
    sources: z.array(z.unknown()).optional(),
    designAreas: z.array(z.unknown()).optional(),
    params: z.record(z.unknown()).optional(),
    reservoir: ReservoirSchema.optional(),
    suction: SuctionSchema.optional(),
    pump: PumpSchema.optional(),
  })
  .passthrough();

export const BuildingSchema = z
  .object({
    floors: z.number().optional(),
    floorHeightFt: z.number().optional(),
    designFloor: z.number().optional(),
    designAreaElevationFt: z.number().optional(),
    roofElevationFt: z.number().optional(),
  })
  .passthrough();

export const ProjectMetaSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    systemType: z.string().optional(), // "sprinkler" | "standpipe"
    standard: z.string().optional(), // display, e.g. "NFPA 13 (2019)"
    standardId: z.string().optional(), // engine id, e.g. "nfpa13"
    hazardClass: z.string().optional(),
    standpipeClass: z.string().optional(),
    units: UnitsSchema.default("imperial"),
    engineer: z.string().optional(),
    date: z.string().optional(),
    rev: z.number().optional(),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
    appVersion: z.string().optional(),
    building: BuildingSchema.optional(),
  })
  .passthrough();

/** Density/area or standpipe design basis — fields vary by system type. */
export const DesignBasisSchema = z.record(z.unknown());

/** City flow test + optional fire pump / hydrant / FDC. */
export const WaterSupplySchema = z.record(z.unknown());

export const ProjectModelSchema = z
  .object({
    schemaVersion: z.number(),
    meta: ProjectMetaSchema,
    designBasis: DesignBasisSchema.optional(),
    waterSupply: WaterSupplySchema.optional(),
    network: NetworkSchema.default({ nodes: [], pipes: [], valves: [] }),
    estimatedDemand: z.record(z.unknown()).optional(),
    drawing: z.record(z.unknown()).optional(),
    results: z.record(z.unknown()).optional(),
  })
  .passthrough();

export type Units = z.infer<typeof UnitsSchema>;
export type Direction = z.infer<typeof DirectionSchema>;
export type Vec3 = z.infer<typeof Vec3Schema>;
export type Fitting = z.infer<typeof FittingSchema>;
export type NetworkNode = z.infer<typeof NodeSchema>;
export type Pipe = z.infer<typeof PipeSchema>;
export type Valve = z.infer<typeof ValveSchema>;
export type Reservoir = z.infer<typeof ReservoirSchema>;
export type Suction = z.infer<typeof SuctionSchema>;
export type PumpCurvePoint = z.infer<typeof PumpCurvePointSchema>;
export type PumpDatasheet = z.infer<typeof PumpDatasheetSchema>;
export type Pump = z.infer<typeof PumpSchema>;
export type Network = z.infer<typeof NetworkSchema>;
export type Building = z.infer<typeof BuildingSchema>;
export type ProjectMeta = z.infer<typeof ProjectMetaSchema>;
export type ProjectModel = z.infer<typeof ProjectModelSchema>;
