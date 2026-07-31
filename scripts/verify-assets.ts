import { readFile, stat } from "node:fs/promises";
import { beaches, coastOverview } from "../src/beaches/catalog";
import { isSeaPoint, type CoastLine } from "../src/map/coastalOrientation";

const failures: string[] = [];
let totalBytes = 0;

const scenes = [coastOverview, ...beaches];
for (const config of scenes) {
  const id = config.id;
  const metadata = await json(`public/metadata/${id}-dem.json`);
  const horizonMetadata = await json(`public/metadata/${id}-horizon.json`);
  const terrainStat = await stat(`public${config.terrain.asset}`);
  const expectedBytes = config.terrain.width * config.terrain.height * Float32Array.BYTES_PER_ELEMENT;
  totalBytes += terrainStat.size;

  check(metadata.sourceCRS === "EPSG:25830", id, "CRS visible != EPSG:25830");
  check(metadata.sourceResolutionMeters === 2, id, "resolución fuente != 2 m");
  check(metadata.webResolutionMeters === config.terrain.webResolutionMeters, id, "resolución web no coincide");
  check(metadata.nodataCells === 0, id, "el DEM contiene nodata");
  check(metadata.width === config.terrain.width && metadata.height === config.terrain.height, id, "dimensiones DEM/config no coinciden");
  check(terrainStat.size === expectedBytes, id, `DEM ${terrainStat.size} B != ${expectedBytes} B`);
  check(metadata.minElevation >= -0.01 && metadata.maxElevation > metadata.minElevation, id, "rango visible inválido");
  check(close(metadata.maxElevation, config.terrain.maxElevation), id, "máxima visible no coincide con config");
  check(sameBounds(metadata.bounds, config.projectedBounds), id, "bounds visibles no coinciden");

  const coastline = await json(`public${config.coastlineAsset}`);
  const coastLines = coastline.features.flatMap((feature: GeoFeature) =>
    feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]]
  );
  const coastPoints = coastLines.flat();
  check(coastPoints.length >= 3, id, "la costa tiene muy pocos puntos");
  check(!coastPoints.some(([x, y]: number[]) =>
    x < config.projectedBounds.west || x > config.projectedBounds.east ||
    y < config.projectedBounds.south || y > config.projectedBounds.north
  ), id, "la costa sale del chunk");
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const localCoast: CoastLine = coastPoints.map(([x, y]: number[]) =>
    [x - centerX, y - centerZ] as [number, number]
  ).sort((a: [number, number], b: [number, number]) => a[1] - b[1]);
  const middle = localCoast[Math.floor(localCoast.length / 2)];
  const testX = middle[0] + (config.seaSide === "east" ? 10 : -10);
  check(isSeaPoint(localCoast, testX, middle[1], config.seaSide), id, "orientación tierra-mar invertida");

  const buildings = await json(`public${config.buildingsAsset}`);
  const roads = await json(`public${config.roadsAsset}`);
  check(buildings.features.length > 0, id, "no hay edificios");
  check(roads.features.length > 0, id, "no hay calles");

  const shadowStat = await stat(`public${config.shadowTerrain.terrain.asset}`);
  const expectedShadowBytes = config.shadowTerrain.terrain.width *
    config.shadowTerrain.terrain.height * Float32Array.BYTES_PER_ELEMENT;
  totalBytes += shadowStat.size;
  check(shadowStat.size === expectedShadowBytes, id, "bytes del caster incorrectos");
  check(horizonMetadata.sourceCRS === "EPSG:25830", id, "CRS del caster incorrecto");
  check(horizonMetadata.nodataCells === 0, id, "caster con nodata");
  check(horizonMetadata.width === config.shadowTerrain.terrain.width &&
    horizonMetadata.height === config.shadowTerrain.terrain.height, id, "dimensiones del caster incorrectas");
  check(close(horizonMetadata.maxElevation, config.shadowTerrain.terrain.maxElevation), id, "máxima del caster no coincide");
  check(sameBounds(horizonMetadata.bounds, config.shadowTerrain.projectedBounds), id, "bounds del caster no coinciden");
}

const waterTexture = await stat("public/terrain/textures/mediterranean-waves-normal.webp");
check(waterTexture.size >= 10_000 && waterTexture.size <= 100_000, "común", "textura de agua fuera del presupuesto");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Assets válidos: overview + ${beaches.length} playas, ${(totalBytes / 1_000_000).toFixed(2)} MB de terreno sin comprimir.`);

type GeoFeature = { geometry: { type: string; coordinates: number[][] | number[][][] } };

async function json(file: string): Promise<any> {
  return JSON.parse(await readFile(file, "utf8"));
}

function check(condition: boolean, id: string, message: string) {
  if (!condition) failures.push(`${id}: ${message}`);
}

function close(a: number, b: number): boolean {
  return Math.abs(a - b) <= .011;
}

function sameBounds(bounds: number[], projected: { west: number; south: number; east: number; north: number }) {
  return bounds.length === 4 &&
    close(bounds[0], projected.west) && close(bounds[1], projected.south) &&
    close(bounds[2], projected.east) && close(bounds[3], projected.north);
}
