import { readFile, stat } from "node:fs/promises";
import { beachConfigSchema } from "../src/beaches/types";

const config = beachConfigSchema.parse(JSON.parse(await readFile("src/beaches/ventanicas.json", "utf8")));
const metadata = JSON.parse(await readFile("public/metadata/ventanicas-dem.json", "utf8"));
const terrainPath = `public${config.terrain.asset}`;
const terrainStat = await stat(terrainPath);
const expectedBytes = config.terrain.width * config.terrain.height * Float32Array.BYTES_PER_ELEMENT;

const failures: string[] = [];
if (metadata.sourceCRS !== "EPSG:25830") failures.push("CRS != EPSG:25830");
if (metadata.sourceResolutionMeters !== 2) failures.push("resolución fuente != 2 m");
if (metadata.nodataCells !== 0) failures.push("el DEM contiene nodata");
if (metadata.width !== config.terrain.width || metadata.height !== config.terrain.height) {
  failures.push("dimensiones de metadatos/config no coinciden");
}
if (terrainStat.size !== expectedBytes) failures.push(`asset DEM ${terrainStat.size} B != ${expectedBytes} B`);
if (metadata.minElevation < -0.01 || metadata.maxElevation <= metadata.minElevation) {
  failures.push("rango de elevación inválido");
}
await stat(`public${config.coastlineAsset}`);
const buildings = JSON.parse(await readFile(`public${config.buildingsAsset}`, "utf8"));
const roads = JSON.parse(await readFile(`public${config.roadsAsset}`, "utf8"));
if (buildings.features.length < 1) failures.push("no hay edificios en el chunk");
if (roads.features.length < 1) failures.push("no hay calles en el chunk");
const shadowTerrainStat = await stat(`public${config.shadowTerrain.terrain.asset}`);
const expectedShadowBytes = config.shadowTerrain.terrain.width *
  config.shadowTerrain.terrain.height * Float32Array.BYTES_PER_ELEMENT;
if (shadowTerrainStat.size !== expectedShadowBytes) {
  failures.push(`asset de horizonte ${shadowTerrainStat.size} B != ${expectedShadowBytes} B`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Assets válidos: ${config.terrain.width}×${config.terrain.height}, ${terrainStat.size} B, ${metadata.minElevation.toFixed(1)}–${metadata.maxElevation.toFixed(1)} m.`);
