import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { toonMaterial } from "../styles/toonMaterial";
import { loadFloat32 } from "./assets";
import { loadJson } from "./assets";
import { coastalFloodMask, coastlineEnvelope, isSeaPoint, type CoastLine } from "./coastalOrientation";

type TerrainSpec = BeachConfig["terrain"];
type ProjectedBounds = BeachConfig["projectedBounds"];

export interface TerrainModel {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  heights: Float32Array;
  geometry: THREE.BufferGeometry;
}

export async function loadTerrain(
  config: BeachConfig,
  source: { terrain: TerrainSpec; projectedBounds: ProjectedBounds } = config
): Promise<TerrainModel> {
  const visibleTerrain = source === config;
  const [heights, coast] = await Promise.all([
    loadFloat32(source.terrain.asset),
    visibleTerrain ? loadTerrainCoastline(config) : Promise.resolve(undefined)
  ]);
  const { width, height } = source.terrain;
  if (heights.length !== width * height) {
    throw new Error(`DEM inválido: ${heights.length} muestras; esperadas ${width * height}`);
  }

  const b = source.projectedBounds;
  const sizeX = b.east - b.west;
  const sizeZ = b.north - b.south;
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, width - 1, height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color("#f1cc68");
  const low = new THREE.Color("#aeb57f");
  const high = new THREE.Color("#797f75");
  const illustratedSand = new THREE.Color("#e7ad55");
  const illustratedSandLight = new THREE.Color("#f4cf72");
  const illustratedEarth = new THREE.Color("#a69661");
  const illustratedRock = new THREE.Color("#666b70");
  const color = new THREE.Color();
  const illustrated = config.visualStyle === "mediterranean-illustrated" && source === config;
  const floodedSea = coast && (config.coastalStructures.length || config.useFloodMask)
    ? coastalFloodMask(
      coast.lines,
      config.seaSide,
      width,
      height,
      sizeX / 2,
      sizeZ / 2,
      { heightsNorthToSouth: heights }
    )
    : undefined;

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const sourceRow = height - 1 - row;
      const demElevation = Math.max(0, heights[sourceRow * width + col]);
      // MDT02 interpola la lámina de agua y en algunos sectores (Cala Marqués)
      // llega a devolver varios metros positivos mar adentro. El MDT original
      // se conserva en `heights` para trazabilidad y horizonte; solo se abate la
      // malla visible donde la costa oficial clasifica el vértice como mar.
      const offshore = floodedSea
        ? floodedSea[index] === 1
        : coast
        ? isSeaPoint(coast.envelope, positions.getX(index), positions.getZ(index), config.seaSide, 1)
        : false;
      const elevation = offshore ? config.seaLevelMeters - 3 : demElevation;
      positions.setY(index, elevation);
      if (illustrated) {
        const left = heights[sourceRow * width + Math.max(0, col - 1)];
        const right = heights[sourceRow * width + Math.min(width - 1, col + 1)];
        const north = heights[Math.max(0, sourceRow - 1) * width + col];
        const south = heights[Math.min(height - 1, sourceRow + 1) * width + col];
        const slope = Math.hypot(right - left, south - north) /
          Math.max(1, source.terrain.webResolutionMeters * 2);
        const mineralNoise = (
          Math.sin(col * .29 + row * .17)
          + Math.sin(col * .071 - row * .113) * .7
        ) * .5 + .5;
        if (elevation <= 7) {
          color.copy(illustratedSand).lerp(illustratedSandLight, .38 + mineralNoise * .34);
        } else {
          const heightMix = Math.min(1, (elevation - 7) / Math.max(1, source.terrain.maxElevation - 7));
          const rockMix = Math.min(1, slope * 1.7 + heightMix * .52);
          color.copy(illustratedEarth).lerp(illustratedRock, rockMix);
          color.offsetHSL(0, 0, (mineralNoise - .5) * .055);
        }
      } else if (elevation <= 10) {
        color.copy(sand);
      } else {
        const t = Math.min(1, (elevation - 10) / Math.max(1, source.terrain.maxElevation - 10));
        color.copy(low).lerp(high, Math.pow(t, 0.7));
      }
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = toonMaterial({
    vertexColors: true,
    wireframe: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, heights, geometry };
}

type CoastGeoJSON = {
  features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }>;
};

async function loadTerrainCoastline(config: BeachConfig): Promise<{ envelope: CoastLine; lines: CoastLine[] }> {
  const data = await loadJson<CoastGeoJSON>(config.coastlineAsset);
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const lines = data.features.flatMap((feature) => {
    const source = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    return source.map((line) => line.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]));
  });
  return { envelope: coastlineEnvelope(lines, config.seaSide), lines };
}

export async function loadShadowTerrain(config: BeachConfig): Promise<TerrainModel> {
  const source = config.shadowTerrain;
  const heights = await loadFloat32(source.terrain.asset);
  const { width, height } = source.terrain;
  if (heights.length !== width * height) {
    throw new Error(`Caster inválido: ${heights.length} muestras; esperadas ${width * height}`);
  }
  const bounds = source.projectedBounds;
  const geometry = new THREE.PlaneGeometry(
    bounds.east - bounds.west,
    bounds.north - bounds.south,
    width - 1,
    height - 1
  );
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      positions.setY(row * width + col, Math.max(0, heights[(height - 1 - row) * width + col]));
    }
  }
  geometry.deleteAttribute("normal");
  geometry.deleteAttribute("uv");
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return { mesh, heights, geometry };
}

export function estimateTerrainHorizon(
  heights: Float32Array,
  config: Pick<BeachConfig, "center"> & {
    bounds: BeachConfig["bounds"];
    terrain: BeachConfig["terrain"];
  },
  bearingDegrees: number
): number {
  const { width, height, webResolutionMeters } = config.terrain;
  const originCol = Math.round((config.center.lon - config.bounds.west) /
    (config.bounds.east - config.bounds.west) * (width - 1));
  const originRow = Math.round((config.bounds.north - config.center.lat) /
    (config.bounds.north - config.bounds.south) * (height - 1));
  const originIndex = Math.max(0, Math.min(height - 1, originRow)) * width +
    Math.max(0, Math.min(width - 1, originCol));
  const originElevation = Math.max(1.5, heights[originIndex] + 1.5);
  const bearing = bearingDegrees * Math.PI / 180;
  let maxAngle = 0;
  for (let distance = webResolutionMeters; distance < 6000; distance += webResolutionMeters) {
    const col = Math.round(originCol + Math.sin(bearing) * distance / webResolutionMeters);
    const row = Math.round(originRow - Math.cos(bearing) * distance / webResolutionMeters);
    if (col < 0 || row < 0 || col >= width || row >= height) break;
    const elevation = heights[row * width + col];
    maxAngle = Math.max(maxAngle, Math.atan2(elevation - originElevation, distance) * 180 / Math.PI);
  }
  return maxAngle;
}

export function sampleTerrainElevation(
  heights: Float32Array,
  config: Pick<BeachConfig, "terrain" | "projectedBounds">,
  localX: number,
  localZ: number
): number {
  const { width, height } = config.terrain;
  const bounds = config.projectedBounds;
  const sizeX = bounds.east - bounds.west;
  const sizeZ = bounds.north - bounds.south;
  const column = Math.min(width - 1, Math.max(0, (localX / sizeX + 0.5) * (width - 1)));
  const row = Math.min(height - 1, Math.max(0, (0.5 - localZ / sizeZ) * (height - 1)));
  const x0 = Math.floor(column);
  const y0 = Math.floor(row);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const tx = column - x0;
  const ty = row - y0;
  const top = heights[y0 * width + x0] * (1 - tx) + heights[y0 * width + x1] * tx;
  const bottom = heights[y1 * width + x0] * (1 - tx) + heights[y1 * width + x1] * tx;
  return top * (1 - ty) + bottom * ty;
}
