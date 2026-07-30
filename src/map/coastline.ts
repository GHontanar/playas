import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";

type GeoJSON = {
  features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }>;
};

export async function loadCoastline(config: BeachConfig): Promise<THREE.Group> {
  const response = await fetch(config.coastlineAsset);
  if (!response.ok) throw new Error(`No se pudo cargar la costa (${response.status})`);
  const data = await response.json() as GeoJSON;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#d8cfb4" });
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  for (const feature of data.features) {
    const lines = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    for (const line of lines) {
      const points = line.map(([x, y]) => new THREE.Vector3(x - centerX, 2, y - centerZ));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
    }
  }
  return group;
}
