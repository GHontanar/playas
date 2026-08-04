import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import type { ObservedBeachStatus, FlagState } from "../status/types";
import {
  alongOf,
  coastAt,
  coastlineEnvelope,
  recompose,
  seawardNormal,
  type CoastLine
} from "./coastalOrientation";
import { sampleTerrainElevation } from "./terrain";
import { loadJson } from "./assets";

type CoastGeoJSON = {
  features: Array<{ properties?: { id_dera?: number }; geometry: { type: string; coordinates: number[][] | number[][][] } }>;
};

const FLAG_COLOURS: Record<FlagState, string> = {
  green: "#42b995",
  yellow: "#efbf55",
  red: "#db6467",
  unknown: "#8ca5a0"
};

export interface BeachZoneLayer {
  group: THREE.Group;
  meshes: THREE.Mesh[];
  setStatuses(statuses: ObservedBeachStatus[]): void;
  setActive(beachId: string | null): void;
  setSeparatorsVisible(visible: boolean): void;
  dispose(): void;
}

export async function createBeachZones(
  overview: BeachConfig,
  heights: Float32Array,
  beaches: BeachConfig[]
): Promise<BeachZoneLayer> {
  const data = await loadJson<CoastGeoJSON>(overview.coastlineAsset);
  const centerX = (overview.projectedBounds.west + overview.projectedBounds.east) / 2;
  const centerZ = (overview.projectedBounds.south + overview.projectedBounds.north) / 2;
  const structureIds = new Set(overview.coastalStructures.map(({ featureId }) => featureId));
  const lines = data.features.flatMap((feature) => {
    if (feature.properties?.id_dera && structureIds.has(feature.properties.id_dera)) return [];
    const source = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    return source.map((line) => line.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]));
  });
  const coast = coastlineEnvelope(lines, overview.seaSide, 12);
  const side = overview.seaSide;
  const group = new THREE.Group();
  const meshes = beaches.map((beach) => {
    const geometry = zoneGeometry(beach, overview, coast, heights, centerX, centerZ);
    const material = new THREE.MeshBasicMaterial({
      color: FLAG_COLOURS.unknown,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `beach-zone:${beach.id}`;
    mesh.userData.beachId = beach.id;
    mesh.renderOrder = 5;
    group.add(mesh);
    return mesh;
  });
  const separatorGeometry = createSeparatorGeometry(
    overview,
    coast,
    heights,
    centerX,
    centerZ,
    beaches
  );
  const separatorMaterial = new THREE.MeshBasicMaterial({
    color: "#274c50",
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const separators = new THREE.Mesh(separatorGeometry, separatorMaterial);
  separators.name = "beach-zone-separators";
  separators.renderOrder = 6;
  group.add(separators);
  const labels = beaches.map((beach) => createBeachLabel(beach, overview, coast, centerX, centerZ));
  labels.forEach((label) => group.add(label));

  return {
    group,
    meshes,
    setStatuses(statuses) {
      const byId = new Map(statuses.map((status) => [status.beachId, status]));
      for (const mesh of meshes) {
        const status = byId.get(String(mesh.userData.beachId));
        const material = mesh.material as THREE.MeshBasicMaterial;
        material.color.set(FLAG_COLOURS[status?.flag ?? "unknown"]);
        mesh.userData.status = status;
        material.opacity = status?.lifeguardService === "active" && status.flag !== "unknown" ? .46 : 0;
      }
    },
    setActive(beachId) {
      for (const mesh of meshes) {
        const active = mesh.userData.beachId === beachId;
        const material = mesh.material as THREE.MeshBasicMaterial;
        const status = mesh.userData.status as ObservedBeachStatus | undefined;
        const coloured = status?.lifeguardService === "active" && status.flag !== "unknown";
        material.opacity = coloured ? (active ? .82 : .46) : (active ? .14 : 0);
        mesh.position.y = active ? 3 : 0;
      }
    },
    setSeparatorsVisible(visible) {
      separatorMaterial.opacity = visible ? .74 : 0;
    },
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
      separatorGeometry.dispose();
      separatorMaterial.dispose();
      for (const label of labels) {
        const material = label.material as THREE.SpriteMaterial;
        material.map?.dispose();
        material.dispose();
      }
    }
  };
}

function createBeachLabel(
  beach: BeachConfig,
  overview: BeachConfig,
  coast: CoastLine,
  overviewCenterX: number,
  overviewCenterZ: number
): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(23, 53, 58, .88)";
  context.beginPath();
  context.roundRect(8, 8, 752, 144, 36);
  context.fill();
  context.font = "600 54px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff8e9";
  context.fillText(beach.name, 384, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const label = new THREE.Sprite(material);
  const side = overview.seaSide;
  const overviewCenterAlong = alongOf(side, overviewCenterX, overviewCenterZ);
  const coastSpan = Math.hypot(
    overview.projectedBounds.east - overview.projectedBounds.west,
    overview.projectedBounds.north - overview.projectedBounds.south
  );
  const labelWidth = THREE.MathUtils.clamp(coastSpan * .09, 300, 780);
  const beachCenterAlong = alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z)
    + (alongOf(side, beach.shoreline.end.x, beach.shoreline.end.z)
      - alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z)) / 2;
  const along = beachCenterAlong - overviewCenterAlong;
  const previousAlong = along - 12;
  const nextAlong = along + 12;
  const current = recompose(side, along, coastAt(coast, along, side));
  const previous = recompose(side, previousAlong, coastAt(coast, previousAlong, side));
  const next = recompose(side, nextAlong, coastAt(coast, nextAlong, side));
  const normal = seawardNormal(next[0] - previous[0], next[1] - previous[1], side);
  const x = current[0] + normal.x * 120;
  const labelZ = current[1] + normal.z * 120;
  label.position.set(x, overview.seaLevelMeters + 55, labelZ);
  label.scale.set(labelWidth, labelWidth * 163 / 780, 1);
  label.center.set(.5, 0);
  label.renderOrder = 10;
  label.name = `beach-label:${beach.id}`;
  label.userData.beachId = beach.id;
  return label;
}

function zoneGeometry(
  beach: BeachConfig,
  overview: BeachConfig,
  coast: CoastLine,
  heights: Float32Array,
  overviewCenterX: number,
  overviewCenterZ: number
): THREE.BufferGeometry {
  const side = overview.seaSide;
  const overviewCenterAlong = alongOf(side, overviewCenterX, overviewCenterZ);
  const startAlong = alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z);
  const endAlong = alongOf(side, beach.shoreline.end.x, beach.shoreline.end.z);
  const minAlong = Math.min(startAlong, endAlong) - beach.overviewZonePaddingMeters - overviewCenterAlong;
  const maxAlong = Math.max(startAlong, endAlong) + beach.overviewZonePaddingMeters - overviewCenterAlong;
  const count = Math.max(8, Math.ceil((maxAlong - minAlong) / 35));
  const positions = new Float32Array((count + 1) * 3 * 3);
  const indices: number[] = [];
  for (let index = 0; index <= count; index++) {
    const along = THREE.MathUtils.lerp(minAlong, maxAlong, index / count);
    const previousAlong = Math.max(minAlong, along - 8);
    const nextAlong = Math.min(maxAlong, along + 8);
    const current = recompose(side, along, coastAt(coast, along, side));
    const previous = recompose(side, previousAlong, coastAt(coast, previousAlong, side));
    const next = recompose(side, nextAlong, coastAt(coast, nextAlong, side));
    const normal = seawardNormal(
      next[0] - previous[0],
      next[1] - previous[1],
      side
    );
    // Anchura expresiva para que la zona siga siendo legible y táctil en el
    // overview. Centro y longitud proceden de la costa oficial; esta anchura no
    // pretende delimitar una lámina de agua administrativa.
    const edges = [-80, 0, 180];
    edges.forEach((distance, edge) => {
      const px = current[0] + normal.x * distance;
      const pz = current[1] + normal.z * distance;
      const offset = (index * 3 + edge) * 3;
      positions[offset] = px;
      positions[offset + 1] = distance <= 0
        ? sampleTerrainElevation(heights, overview, px, pz) * overview.terrain.verticalExaggeration + 6
        : overview.seaLevelMeters + 6;
      positions[offset + 2] = pz;
    });
    if (index < count) {
      const offset = index * 3;
      for (let band = 0; band < 2; band++) {
        indices.push(offset + band, offset + band + 1, offset + 3 + band);
        indices.push(offset + band + 1, offset + 4 + band, offset + 3 + band);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createSeparatorGeometry(
  overview: BeachConfig,
  coast: CoastLine,
  heights: Float32Array,
  overviewCenterX: number,
  overviewCenterZ: number,
  beaches: BeachConfig[]
): THREE.BufferGeometry {
  const side = overview.seaSide;
  const overviewCenterAlong = alongOf(side, overviewCenterX, overviewCenterZ);
  const alongBoundaries = beaches
    .flatMap((beach) => [
      Math.min(alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z),
        alongOf(side, beach.shoreline.end.x, beach.shoreline.end.z)) - beach.overviewZonePaddingMeters,
      Math.max(alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z),
        alongOf(side, beach.shoreline.end.x, beach.shoreline.end.z)) + beach.overviewZonePaddingMeters
    ])
    .sort((a, b) => a - b)
    .filter((value, index, all) => index === 0 || value - all[index - 1] > 35)
    .map((value) => value - overviewCenterAlong);
  const positions = new Float32Array(alongBoundaries.length * 4 * 3);
  const indices: number[] = [];
  alongBoundaries.forEach((along, boundaryIndex) => {
    const previousAlong = along - 10;
    const nextAlong = along + 10;
    const previous = recompose(side, previousAlong, coastAt(coast, previousAlong, side));
    const next = recompose(side, nextAlong, coastAt(coast, nextAlong, side));
    const tangentX = next[0] - previous[0];
    const tangentZ = next[1] - previous[1];
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const tx = tangentX / tangentLength;
    const tz = tangentZ / tangentLength;
    const current = recompose(side, along, coastAt(coast, along, side));
    const normal = seawardNormal(tangentX, tangentZ, side);
    const distances = [-95, 235];
    for (let end = 0; end < 2; end++) {
      for (let sideOffset = 0; sideOffset < 2; sideOffset++) {
        const distance = distances[end];
        const offset = sideOffset ? 9 : -9;
        const px = current[0] + normal.x * distance + tx * offset;
        const pz = current[1] + normal.z * distance + tz * offset;
        const index = (boundaryIndex * 4 + end * 2 + sideOffset) * 3;
        positions[index] = px;
        positions[index + 1] = distance <= 0
          ? sampleTerrainElevation(heights, overview, px, pz) * overview.terrain.verticalExaggeration + 8
          : overview.seaLevelMeters + 8;
        positions[index + 2] = pz;
      }
    }
    const offset = boundaryIndex * 4;
    indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
