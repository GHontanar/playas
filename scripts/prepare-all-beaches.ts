import { readdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { beachConfigSchema, type BeachConfig } from "../src/beaches/types";

const beachIds = [
  "mojacar-coast",
  "marina-de-la-torre",
  "descargador",
  "piedra-villazar",
  "el-cantal",
  "lance-nuevo",
  "ventanicas",
  "venta-del-bancal",
  "carboneras-coast",
  "carboneras-ancon",
  "carboneras-barquicos-cocones",
  "carboneras-marinicas",
  "carboneras-puntica",
  "carboneras-los-muertos",
  "carboneras-algarrobico",
  "carboneras-corral",
  "garrucha-coast",
  "garrucha-playa",
  "garrucha-posito",
  "garrucha-playazo",
  "vera-coast",
  "vera-marinas-bolaga",
  "vera-puerto-rey",
  "vera-playazo",
  "vera-cala-marques",
  "barreiros-coast",
  "barreiros-anguieira",
  "barreiros-altar",
  "barreiros-san-bartolo",
  "barreiros-remior",
  "barreiros-pena-de-salsa",
  "barreiros-benquerencia",
  "barreiros-area-da-balea",
  "barreiros-longara",
  "barreiros-a-pasada",
  "barreiros-arealonga"
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
const municipalityCodes: Record<string, string> = {
  mojacar: "04064", carboneras: "04032", garrucha: "04049", vera: "04100", barreiros: "27005"
};

for (const id of selected) {
  const configPath = `src/beaches/${id}.json`;
  const config = beachConfigSchema.parse(JSON.parse(await readFile(configPath, "utf8")));
  const municipality = config.municipalityId;
  const municipalityCode = municipalityCodes[municipality];
  const epsg = config.projectedBounds.crs === "EPSG:25829" ? 25829 : 25830;
  const demSources = (await readdir(sourceDir))
    .filter((name) => {
      const isCrs = epsg === 25829 ? /HU29/i.test(name) : /HU30/i.test(name);
      return isCrs && /-COB2\.TIF$/i.test(name);
    })
    .map((name) => path.join(sourceDir, name))
    .sort();
  if (!demSources.length) throw new Error(`No hay hojas MDT02 de EPSG:${epsg} en data/source`);
  console.log(`\n== ${config.name} ==`);
  prepareDem(config, false, epsg, demSources);
  prepareDem(config, true, epsg, demSources);
  const ihmCoastline = municipality === "barreiros";
  const coastlineSource = ihmCoastline
    ? `${sourceDir}/ihm-linea-costa/COSTA/COSTA.shp`
    : `${sourceDir}/1_Relieve.gpkg`;
  run([
    python, "scripts/prepare_coastline.py",
    coastlineSource,
    `${assetDir}/${id}-coastline.geojson`,
    "--name", id,
    "--bounds", ...bounds(config.projectedBounds),
    "--epsg", String(epsg),
    ...(ihmCoastline ? ["--ihm"] : [])
  ]);
  run([
    python, "scripts/prepare_urban.py",
    municipality === "mojacar"
      ? `${sourceDir}/A.ES.SDGC.BU.04064.buildingpart.gml`
      : `${sourceDir}/${municipality}-buildings/A.ES.SDGC.BU.${municipalityCode}.buildingpart.gml`,
    `${sourceDir}/${municipality}-osm-roads.json`,
    `${assetDir}/${id}-buildings.geojson`,
    `${assetDir}/${id}-roads.geojson`,
    "--name", id,
    "--bounds", ...bounds(config.projectedBounds),
    "--epsg", String(epsg),
    ...(config.urbanDetail === "overview" ? ["--overview"] : [])
  ]);

  const terrainMetadata = JSON.parse(await readFile(`${metadataDir}/${id}-dem.json`, "utf8"));
  const horizonMetadata = JSON.parse(await readFile(`${metadataDir}/${id}-horizon.json`, "utf8"));
  config.terrain.width = terrainMetadata.width;
  config.terrain.height = terrainMetadata.height;
  config.terrain.minElevation = round(terrainMetadata.minElevation);
  config.terrain.maxElevation = round(terrainMetadata.maxElevation);
  config.shadowTerrain.terrain.width = horizonMetadata.width;
  config.shadowTerrain.terrain.height = horizonMetadata.height;
  config.shadowTerrain.terrain.minElevation = round(horizonMetadata.minElevation);
  config.shadowTerrain.terrain.maxElevation = round(horizonMetadata.maxElevation);
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
}

function prepareDem(config: BeachConfig, horizon: boolean, epsg: number, demSources: string[]) {
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
    "--epsg", String(epsg),
    ...(horizon ? [] : ["--smooth-passes", "1"]),
    "--output", `public${spec.asset}`,
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
