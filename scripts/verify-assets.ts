import { readFile, stat } from "node:fs/promises";
import { beaches, municipalities } from "../src/beaches/catalog";
import { regionAssets, regions } from "../src/regions/catalog";
import { coastlineEnvelope, isSeaPoint, type CoastLine } from "../src/map/coastalOrientation";
const failures: string[] = [];
let totalBytes = 0;

const scenes = [...municipalities.map((municipality) => municipality.overview), ...beaches];
for (const config of scenes) {
  const id = config.id;
  const metadata = await json(`public/metadata/${id}-dem.json`);
  const horizonMetadata = await json(`public/metadata/${id}-horizon.json`);
  const terrainStat = await stat(`public${config.terrain.asset}`);
  const expectedBytes = config.terrain.width * config.terrain.height * Float32Array.BYTES_PER_ELEMENT;
  totalBytes += terrainStat.size;

  check(metadata.sourceCRS === config.projectedBounds.crs, id, `CRS visible != ${config.projectedBounds.crs}`);
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
  );
  // El renderer clasifica el mar contra la envolvente marina (el borde exterior
  // del lado del mar), no contra cada ramal: la prueba debe usar esa envolvente.
  const envelope = coastlineEnvelope([localCoast], config.seaSide);
  const middle = envelope[Math.floor(envelope.length / 2)];
  const testX = middle[0] + (config.seaSide === "east" ? 10 : config.seaSide === "west" ? -10 : 0);
  const testZ = middle[1] + (config.seaSide === "north" ? 10 : config.seaSide === "south" ? -10 : 0);
  check(isSeaPoint(envelope, testX, testZ, config.seaSide), id, "orientación tierra-mar invertida");

  const buildings = await json(`public${config.buildingsAsset}`);
  const roads = await json(`public${config.roadsAsset}`);
  const naturallyUnbuilt = ["carboneras-los-muertos", "carboneras-corral"].includes(id);
  check(buildings.features.length > 0 || naturallyUnbuilt, id, "no hay edificios");
  check(roads.features.length > 0, id, "no hay calles");

  const shadowStat = await stat(`public${config.shadowTerrain.terrain.asset}`);
  const expectedShadowBytes = config.shadowTerrain.terrain.width *
    config.shadowTerrain.terrain.height * Float32Array.BYTES_PER_ELEMENT;
  totalBytes += shadowStat.size;
  check(shadowStat.size === expectedShadowBytes, id, "bytes del caster incorrectos");
  check(horizonMetadata.sourceCRS === config.shadowTerrain.projectedBounds.crs, id, "CRS del caster incorrecto");
  check(horizonMetadata.nodataCells === 0, id, "caster con nodata");
  check(horizonMetadata.width === config.shadowTerrain.terrain.width &&
    horizonMetadata.height === config.shadowTerrain.terrain.height, id, "dimensiones del caster incorrectas");
  check(close(horizonMetadata.maxElevation, config.shadowTerrain.terrain.maxElevation), id, "máxima del caster no coincide");
  check(sameBounds(horizonMetadata.bounds, config.shadowTerrain.projectedBounds), id, "bounds del caster no coinciden");
}

// Nivel comarcal: el bloque de 50 m y la rejilla diezmada de su miniatura. Las
// dos tienen que cubrir los mismos bounds y venir alineadas con sus coberturas,
// que es lo que el cliente da por hecho al indexar las tres por la misma celda.
for (const region of regions) {
  for (const variant of ["full", "thumbnail"] as const) {
    const paths = regionAssets(region, variant);
    const id = variant === "full" ? region.id : `${region.id} · miniatura`;
    const metadata = await json(`public${paths.demMetadata}`);
    const demStat = await stat(`public${paths.dem}`);
    const seaStat = await stat(`public${paths.sea}`);
    const landStat = await stat(`public${paths.land}`);
    const cells = metadata.width * metadata.height;
    totalBytes += demStat.size;

    check(sameBounds(metadata.bounds, region.bounds), id, "bounds no coinciden con el catálogo");
    check(demStat.size === cells * Float32Array.BYTES_PER_ELEMENT, id, `DEM ${demStat.size} B != ${cells * 4} B`);
    check(seaStat.size === cells, id, "batimetría desalineada con el DEM");
    check(landStat.size === cells, id, "usos del suelo desalineados con el DEM");
    check(metadata.maxElevation > 0, id, "cota máxima no válida");
  }
  const full = await json(`public${regionAssets(region).demMetadata}`);
  const thumb = await json(`public${regionAssets(region, "thumbnail").demMetadata}`);
  check(thumb.decimation > 1, region.id, "la miniatura no está diezmada");
  check(thumb.webResolutionMeters === full.webResolutionMeters * thumb.decimation,
    region.id, "resolución de la miniatura incoherente con su diezmado");
  check(thumb.width === Math.ceil(full.width / thumb.decimation) &&
    thumb.height === Math.ceil(full.height / thumb.decimation),
    region.id, "la miniatura no cubre el bloque entero");
  // La portada pide las dos miniaturas de una vez: el presupuesto es lo que
  // impide que se conviertan en otro par de derivados de varios megabytes.
  const thumbBytes = thumb.width * thumb.height * 6;
  check(thumbBytes <= 400_000, region.id, `miniatura de ${(thumbBytes / 1024).toFixed(0)} KB, por encima del presupuesto`);
}

const waterTexture = await stat("public/terrain/textures/mediterranean-waves-normal.webp");
check(waterTexture.size >= 10_000 && waterTexture.size <= 100_000, "común", "textura de agua fuera del presupuesto");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Assets válidos: ${regions.length} comarcas con miniatura, ${municipalities.length} costas y ${beaches.length} playas, ${(totalBytes / 1_000_000).toFixed(2)} MB de terreno sin comprimir.`);

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
