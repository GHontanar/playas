import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { coastlineEnvelope, type CoastLine } from "./coastalOrientation";
import { sampleTerrainElevation } from "./terrain";
import { toonMaterial } from "../styles/toonMaterial";

type GeoJSON = {
  features: Array<{
    properties?: { id_dera?: number };
    geometry: { type: string; coordinates: number[][] | number[][][] };
  }>;
};

export async function loadCoastline(
  config: BeachConfig,
  heights: Float32Array,
  exaggeration: number
): Promise<THREE.Group> {
  const response = await fetch(config.coastlineAsset);
  if (!response.ok) throw new Error(`No se pudo cargar la costa (${response.status})`);
  const data = await response.json() as GeoJSON;
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#f5df9c" });
  const structureIds = new Set(config.coastalStructures.map(({ featureId }) => featureId));
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const coastlines: CoastLine[] = [];
  for (const feature of data.features) {
    const lines = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    for (const line of lines) {
      const localLine = line.map(([x, y]) => [x - centerX, y - centerZ] as [number, number]);
      coastlines.push(localLine);
      if (!feature.properties?.id_dera || !structureIds.has(feature.properties.id_dera)) continue;
      const shape = new THREE.Shape(localLine.map(([x, z]) => new THREE.Vector2(x, -z)));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index++) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const terrainY = sampleTerrainElevation(heights, config, x, z) * exaggeration;
        position.setY(index, Math.max(terrainY + 0.35, config.seaLevelMeters + 0.18));
      }
      geometry.computeVertexNormals();
      const structure = new THREE.Mesh(geometry, toonMaterial({ color: "#645b63" }));
      structure.castShadow = true;
      structure.receiveShadow = true;
      group.add(structure);
      const outline = localLine.map(([x, z]) => new THREE.Vector3(
        x,
        Math.max(
          sampleTerrainElevation(heights, config, x, z) * exaggeration + 0.42,
          config.seaLevelMeters + 0.25
        ),
        z
      ));
      group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), material));
    }
  }
  const points = coastlineEnvelope(coastlines, config.seaSide)
    .map(([x, z]) => new THREE.Vector3(x, 2, z));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  return group;
}
