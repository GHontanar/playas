import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";

type TerrainSpec = BeachConfig["terrain"];
type ProjectedBounds = BeachConfig["projectedBounds"];

export interface TerrainModel {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  heights: Float32Array;
  geometry: THREE.BufferGeometry;
}

export async function loadTerrain(
  config: BeachConfig,
  source: { terrain: TerrainSpec; projectedBounds: ProjectedBounds } = config
): Promise<TerrainModel> {
  const response = await fetch(source.terrain.asset);
  if (!response.ok) throw new Error(`No se pudo cargar el terreno (${response.status})`);
  const heights = new Float32Array(await response.arrayBuffer());
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
  const sand = new THREE.Color("#d8c890");
  const low = new THREE.Color("#918d78");
  const high = new THREE.Color("#666b62");
  const color = new THREE.Color();

  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const sourceRow = height - 1 - row;
      const elevation = Math.max(0, heights[sourceRow * width + col]);
      positions.setY(index, elevation);
      if (elevation <= 10) {
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
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.96,
    metalness: 0,
    wireframe: false
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
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
