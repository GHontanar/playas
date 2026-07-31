import { z } from "zod";

const boundsSchema = z.object({
  west: z.number(),
  south: z.number(),
  east: z.number(),
  north: z.number()
}).refine((b) => b.west < b.east && b.south < b.north, "Bounds no válidos");

const projectedBoundsSchema = z.object({
  west: z.number(), south: z.number(), east: z.number(), north: z.number(),
  crs: z.literal("EPSG:25830")
});

const terrainSchema = z.object({
  verticalExaggeration: z.number().min(0.5).max(3),
  sourceResolutionMeters: z.number().positive(),
  webResolutionMeters: z.number().positive(),
  width: z.number().int().min(2),
  height: z.number().int().min(2),
  minElevation: z.number(),
  maxElevation: z.number(),
  asset: z.string()
});

export const beachConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  municipalityId: z.enum(["mojacar", "carboneras", "garrucha", "vera"]).default("mojacar"),
  timezone: z.literal("Europe/Madrid"),
  center: z.object({ lat: z.number(), lon: z.number() }),
  bounds: boundsSchema,
  projectedBounds: projectedBoundsSchema,
  camera: z.object({
    bearing: z.number(),
    pitch: z.number().min(0).max(90),
    roll: z.number().min(-180).max(180).default(0),
    distance: z.number().positive()
  }),
  terrain: terrainSchema,
  chunk: z.object({
    depthMeters: z.number().min(10).max(300)
  }),
  seaSide: z.enum(["east", "west"]),
  worldAxes: z.enum(["north-positive", "south-positive"]).default("north-positive"),
  visualStyle: z.enum(["classic", "mediterranean-illustrated"]).default("classic"),
  urbanDetail: z.enum(["detailed", "overview"]).default("detailed"),
  seaLevelMeters: z.number().min(0).max(3).default(1.5),
  coastalStructures: z.array(z.object({
    featureId: z.number(),
    kind: z.literal("breakwater")
  })).default([]),
  overviewZonePaddingMeters: z.number().min(0).max(500).default(0),
  coastalWaterEdgeSeeding: z.boolean().default(false),
  shoreline: z.object({
    start: z.object({ x: z.number(), z: z.number() }),
    end: z.object({ x: z.number(), z: z.number() })
  }),
  shadowTerrain: z.object({
    bounds: boundsSchema,
    projectedBounds: projectedBoundsSchema,
    terrain: terrainSchema
  }),
  coastlineAsset: z.string(),
  buildingsAsset: z.string(),
  roadsAsset: z.string(),
  attribution: z.array(z.string()).min(1)
});

export type BeachConfig = z.infer<typeof beachConfigSchema>;

export function parseBeachConfig(value: unknown): BeachConfig {
  return beachConfigSchema.parse(value);
}

export function clampExaggeration(value: number): number {
  return Math.min(3, Math.max(0.5, value));
}
