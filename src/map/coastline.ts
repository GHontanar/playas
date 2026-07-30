import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { coastlineEnvelope, type CoastLine } from "./coastalOrientation";

type GeoJSON = {
  features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }>;
};

export async function loadCoastline(config: BeachConfig): Promise<THREE.Group> {
  const response = await fetch(config.coastlineAsset);
  if (!response.ok) throw new Error(`No se pudo cargar la costa (${response.status})`);
  const data = await response.json() as GeoJSON;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#f5df9c" });
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const coastlines: CoastLine[] = [];
  for (const feature of data.features) {
    const lines = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    for (const line of lines) {
      coastlines.push(line.map(([x, y]) => [x - centerX, y - centerZ]));
    }
  }
  const points = coastlineEnvelope(coastlines, config.seaSide)
    .map(([x, z]) => new THREE.Vector3(x, 2, z));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  return group;
}
