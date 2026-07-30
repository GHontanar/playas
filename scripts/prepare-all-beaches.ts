import { readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beachConfigSchema, type BeachConfig } from "../src/beaches/types";

const beachIds = [
  "marina-de-la-torre",
  "descargador",
  "piedra-villazar",
  "el-cantal",
  "lance-nuevo",
  "ventanicas",
  "venta-del-bancal"
];
const requested = process.argv[2];
const selected = requested && requested !== "all" ? [requested] : beachIds;
for (const id of selected) {
  if (!beachIds.includes(id)) throw new Error(`Playa desconocida: ${id}`);
}

const python = process.env.PYTHON_BIN || ".venv/bin/python";
const sourceDir = "data/source";
const assetDir = "public/terrain/assets";
const metadataDir = "public/metadata";
const demSources = (await readdir(sourceDir))
  .filter((name) => /^MDT02-ETRS89-HU30-.*-COB2\.TIF$/i.test(name))
  .map((name) => path.join(sourceDir, name))
  .sort();
if (!demSources.length) throw new Error("No hay hojas MDT02 en data/source");

for (const id of selected) {
  const configPath = `src/beaches/${id}.json`;
  const config = beachConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  console.log(`\n== ${config.name} ==`);
  prepareDem(config, false);
  prepareDem(config, true);
  run([
    python, "scripts/prepare_coastline.py",
    `${sourceDir}/1_Relieve.gpkg`,
    `${assetDir}/${id}-coastline.geojson`,
    "--name", id,
    "--bounds", ...bounds(config.projectedBounds)
  ]);
  run([
    python, "scripts/prepare_urban.py",
    `${sourceDir}/A.ES.SDGC.BU.04064.buildingpart.gml`,
    `${sourceDir}/mojacar-osm-roads.json`,
    `${assetDir}/${id}-buildings.geojson`,
    `${assetDir}/${id}-roads.geojson`,
    "--name", id,
    "--bounds", ...bounds(config.projectedBounds)
  ]);

  const terrainMetadata = JSON.parse(await readFile(`${metadataDir}/${id}-dem.json`, "utf8"));
  const horizonMetadata = JSON.parse(await readFile(`${metadataDir}/${id}-horizon.json`, "utf8"));
  config.terrain.minElevation = round(terrainMetadata.minElevation);
  config.terrain.maxElevation = round(terrainMetadata.maxElevation);
  config.shadowTerrain.terrain.minElevation = round(horizonMetadata.minElevation);
  config.shadowTerrain.terrain.maxElevation = round(horizonMetadata.maxElevation);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function prepareDem(config: BeachConfig, horizon: boolean) {
  const id = config.id;
  const spec = horizon ? config.shadowTerrain.terrain : config.terrain;
  const projected = horizon ? config.shadowTerrain.projectedBounds : config.projectedBounds;
  const suffix = horizon ? "horizon" : "dem";
  run([
    python, "scripts/prepare_dem.py",
    "--west", String(projected.west),
    "--south", String(projected.south),
    "--east", String(projected.east),
    "--north", String(projected.north),
    "--resolution", String(spec.webResolutionMeters),
    ...(horizon ? [] : ["--smooth-passes", "1"]),
    "--output", `${assetDir}/${id}-${suffix}.f32`,
    "--metadata", `${metadataDir}/${id}-${suffix}.json`,
    "--preview", `${assetDir}/${id}-${suffix}-preview.pgm`,
    ...demSources
  ]);
}

function bounds(value: BeachConfig["projectedBounds"]): string[] {
  return [value.west, value.south, value.east, value.north].map(String);
}

function run(args: string[]) {
  const result = spawnSync(args[0], args.slice(1), { stdio: "inherit" });
  if (result.status !== 0) throw new Error(`Falló: ${args.join(" ")}`);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
