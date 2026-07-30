import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { BeachConfig } from "../beaches/types";
import { sampleTerrainElevation } from "./terrain";
import { toonMaterial } from "../styles/toonMaterial";

type Ring = number[][];
type PolygonCoordinates = Ring[];
type Geometry = {
  type: "Polygon" | "MultiPolygon";
  coordinates: PolygonCoordinates | PolygonCoordinates[];
};
type Feature = {
  properties: Record<string, unknown>;
  geometry: Geometry;
};
type FeatureCollection = { features: Feature[] };

export interface UrbanLayer {
  group: THREE.Group;
  dispose(): void;
}

function polygons(geometry: Geometry): PolygonCoordinates[] {
  return geometry.type === "MultiPolygon"
    ? geometry.coordinates as PolygonCoordinates[]
    : [geometry.coordinates as PolygonCoordinates];
}

function shapeFromPolygon(
  polygon: PolygonCoordinates,
  centerX: number,
  centerZ: number
): THREE.Shape {
  const points = polygon[0].map(([x, z]) => new THREE.Vector2(x - centerX, -(z - centerZ)));
  const result = new THREE.Shape(points);
  for (const ring of polygon.slice(1)) {
    result.holes.push(new THREE.Path(
      ring.map(([x, z]) => new THREE.Vector2(x - centerX, -(z - centerZ)))
    ));
  }
  return result;
}

async function fetchGeoJSON(url: string): Promise<FeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar la capa urbana (${response.status})`);
  return response.json() as Promise<FeatureCollection>;
}

export async function createUrbanLayer(
  config: BeachConfig,
  heights: Float32Array,
  exaggeration: number
): Promise<UrbanLayer> {
  const [buildingData, roadData] = await Promise.all([
    fetchGeoJSON(config.buildingsAsset),
    fetchGeoJSON(config.roadsAsset)
  ]);
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const group = new THREE.Group();
  const disposableGeometries: THREE.BufferGeometry[] = [];
  const disposableMaterials: THREE.Material[] = [];

  const roadGeometries: THREE.BufferGeometry[] = [];
  for (const feature of roadData.features) {
    for (const polygon of polygons(feature.geometry)) {
      const geometry = new THREE.ShapeGeometry(shapeFromPolygon(polygon, centerX, centerZ));
      geometry.rotateX(-Math.PI / 2);
      const position = geometry.attributes.position;
      for (let index = 0; index < position.count; index++) {
        const x = position.getX(index);
        const z = position.getZ(index);
        position.setY(index, sampleTerrainElevation(heights, config, x, z) * exaggeration + 1.15);
      }
      geometry.computeVertexNormals();
      roadGeometries.push(geometry);
    }
  }
  if (roadGeometries.length) {
    const geometry = mergeGeometries(roadGeometries, false);
    const material = new THREE.MeshBasicMaterial({
      color: "#dd7f83",
      polygonOffset: true,
      polygonOffsetFactor: -1
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    group.add(mesh);
    disposableGeometries.push(geometry, ...roadGeometries);
    disposableMaterials.push(material);
  }

  const buildingColours = ["#fff0c9", "#f5b69d", "#e8898e", "#c8b2d6", "#a9c9b8"];
  const buildingBuckets: THREE.BufferGeometry[][] = buildingColours.map(() => []);
  const paletteIndex = (id: string) => {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) | 0;
    return Math.abs(hash) % buildingColours.length;
  };
  for (const feature of buildingData.features) {
    const buildingHeight = Number(feature.properties.height ?? 3.1);
    for (const polygon of polygons(feature.geometry)) {
      const outer = polygon[0];
      const centroidX = outer.reduce((sum, point) => sum + point[0], 0) / outer.length - centerX;
      const centroidZ = outer.reduce((sum, point) => sum + point[1], 0) / outer.length - centerZ;
      const base = sampleTerrainElevation(heights, config, centroidX, centroidZ) * exaggeration + 0.8;
      const geometry = new THREE.ExtrudeGeometry(shapeFromPolygon(polygon, centerX, centerZ), {
        depth: buildingHeight,
        bevelEnabled: true,
        bevelSegments: 1,
        bevelSize: 0.22,
        bevelThickness: 0.22,
        curveSegments: 1
      });
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, base, 0);
      geometry.clearGroups();
      buildingBuckets[paletteIndex(String(feature.properties.id ?? ""))].push(geometry);
    }
  }
  buildingBuckets.forEach((bucket, bucketIndex) => {
    if (!bucket.length) return;
    const geometry = mergeGeometries(bucket, false);
    const material = toonMaterial({
      color: buildingColours[bucketIndex]
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposableGeometries.push(geometry, ...bucket);
    disposableMaterials.push(material);
  });

  return {
    group,
    dispose() {
      disposableGeometries.forEach((geometry) => geometry.dispose());
      disposableMaterials.forEach((material) => material.dispose());
    }
  };
}
