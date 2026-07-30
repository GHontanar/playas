import { readFile, stat } from "node:fs/promises";
import { beachConfigSchema } from "../src/beaches/types";
import { isVentanicasSeaPoint } from "../src/map/coastalOrientation";

const config = beachConfigSchema.parse(JSON.parse(await readFile("src/beaches/ventanicas.json", "utf8")));
const metadata = JSON.parse(await readFile("public/metadata/ventanicas-dem.json", "utf8"));
const horizonMetadata = JSON.parse(await readFile("public/metadata/ventanicas-horizon.json", "utf8"));
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
const coastline = JSON.parse(await readFile(`public${config.coastlineAsset}`, "utf8"));
const coastLines = coastline.features.flatMap((feature: {
  geometry: { type: string; coordinates: number[][] | number[][][] };
}) => feature.geometry.type === "MultiLineString"
  ? feature.geometry.coordinates as number[][][]
  : [feature.geometry.coordinates as number[][]]);
const coastPoints = coastLines.flat();
if (coastPoints.length < 20) failures.push("la costa tiene muy pocos puntos");
if (coastPoints.some(([x, y]: number[]) =>
  x < config.projectedBounds.west || x > config.projectedBounds.east ||
  y < config.projectedBounds.south || y > config.projectedBounds.north
)) failures.push("la costa sale del chunk visible");
const localCoast: Array<[number, number]> = coastPoints.map(([x, y]: number[]) => [
  x - (config.projectedBounds.west + config.projectedBounds.east) / 2,
  y - (config.projectedBounds.south + config.projectedBounds.north) / 2
] as [number, number]).sort((a: [number, number], b: [number, number]) => a[1] - b[1]);
const middle = localCoast[Math.floor(localCoast.length / 2)];
if (!isVentanicasSeaPoint(localCoast, middle[0] + 10, middle[1])) {
  failures.push("orientación tierra-mar invertida: el este debe ser mar");
}
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
if (horizonMetadata.sourceCRS !== "EPSG:25830" ||
    horizonMetadata.nodataCells !== 0 ||
    horizonMetadata.width !== config.shadowTerrain.terrain.width ||
    horizonMetadata.height !== config.shadowTerrain.terrain.height ||
    horizonMetadata.maxElevation < 300) {
  failures.push("metadatos del caster de horizonte inválidos");
}
const waterTexture = await stat("public/terrain/textures/mediterranean-waves-normal.webp");
if (waterTexture.size < 10_000 || waterTexture.size > 100_000) {
  failures.push(`textura de agua fuera del presupuesto: ${waterTexture.size} B`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Assets válidos: ${config.terrain.width}×${config.terrain.height}, ${terrainStat.size} B, ${metadata.minElevation.toFixed(1)}–${metadata.maxElevation.toFixed(1)} m.`);
