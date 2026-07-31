import * as THREE from "three";
import { beaches } from "../beaches/catalog";
import type { BeachConfig } from "../beaches/types";
import type { ObservedBeachStatus, FlagState } from "../status/types";
import { coastlineEnvelope, coastXAt, seawardNormal, type CoastLine } from "./coastalOrientation";
import { sampleTerrainElevation } from "./terrain";
import { loadJson } from "./assets";

type CoastGeoJSON = {
  features: Array<{ geometry: { type: string; coordinates: number[][] | number[][][] } }>;
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
  dispose(): void;
}

export async function createBeachZones(
  overview: BeachConfig,
  heights: Float32Array
): Promise<BeachZoneLayer> {
  const data = await loadJson<CoastGeoJSON>(overview.coastlineAsset);
  const centerX = (overview.projectedBounds.west + overview.projectedBounds.east) / 2;
  const centerZ = (overview.projectedBounds.south + overview.projectedBounds.north) / 2;
  const lines = data.features.flatMap((feature) => {
    const source = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    return source.map((line) => line.map(([x, z]) => [x - centerX, z - centerZ] as [number, number]));
  });
  const coast = coastlineEnvelope(lines, overview.seaSide, 12);
  const group = new THREE.Group();
  const meshes = beaches.map((beach) => {
    const geometry = zoneGeometry(beach, overview, coast, heights, centerZ);
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
    centerZ
  );
  const separatorMaterial = new THREE.MeshBasicMaterial({
    color: "#274c50",
    transparent: true,
    opacity: .74,
    depthWrite: false,
    side: THREE.DoubleSide
  });
  const separators = new THREE.Mesh(separatorGeometry, separatorMaterial);
  separators.name = "beach-zone-separators";
  separators.renderOrder = 6;
  group.add(separators);
  const labels = beaches.map((beach) => createBeachLabel(beach, overview, coast));
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

function createBeachLabel(beach: BeachConfig, overview: BeachConfig, coast: CoastLine): THREE.Sprite {
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
  const centerZProjected = (beach.shoreline.start.z + beach.shoreline.end.z) / 2;
  const overviewCenterZ = (overview.projectedBounds.south + overview.projectedBounds.north) / 2;
  const z = centerZProjected - overviewCenterZ;
  const previousZ = z - 12;
  const nextZ = z + 12;
  const normal = seawardNormal(
    coastXAt(coast, nextZ) - coastXAt(coast, previousZ),
    nextZ - previousZ,
    overview.seaSide
  );
  const x = coastXAt(coast, z) + normal.x * 120;
  const labelZ = z + normal.z * 120;
  label.position.set(x, overview.seaLevelMeters + 55, labelZ);
  label.scale.set(780, 163, 1);
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
  overviewCenterZ: number
): THREE.BufferGeometry {
  const minZ = Math.min(beach.shoreline.start.z, beach.shoreline.end.z) - overviewCenterZ;
  const maxZ = Math.max(beach.shoreline.start.z, beach.shoreline.end.z) - overviewCenterZ;
  const count = Math.max(8, Math.ceil((maxZ - minZ) / 35));
  const positions = new Float32Array((count + 1) * 3 * 3);
  const indices: number[] = [];
  for (let index = 0; index <= count; index++) {
    const z = THREE.MathUtils.lerp(minZ, maxZ, index / count);
    const previousZ = Math.max(minZ, z - 8);
    const nextZ = Math.min(maxZ, z + 8);
    const x = coastXAt(coast, z);
    const normal = seawardNormal(
      coastXAt(coast, nextZ) - coastXAt(coast, previousZ),
      nextZ - previousZ,
      overview.seaSide
    );
    // Anchura expresiva para que la zona siga siendo legible y táctil en el
    // overview de 8,5 km. Centro y longitud proceden de la costa oficial; esta
    // anchura no pretende delimitar una lámina de agua administrativa.
    const edges = [-80, 0, 180];
    edges.forEach((distance, edge) => {
      const px = x + normal.x * distance;
      const pz = z + normal.z * distance;
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
  overviewCenterZ: number
): THREE.BufferGeometry {
  const boundaries = beaches
    .flatMap((beach) => [beach.shoreline.start.z, beach.shoreline.end.z])
    .sort((a, b) => a - b)
    .filter((value, index, all) => index === 0 || value - all[index - 1] > 35)
    .map((z) => z - overviewCenterZ);
  const positions = new Float32Array(boundaries.length * 4 * 3);
  const indices: number[] = [];
  boundaries.forEach((z, boundaryIndex) => {
    const previousZ = z - 10;
    const nextZ = z + 10;
    const tangentX = coastXAt(coast, nextZ) - coastXAt(coast, previousZ);
    const tangentZ = nextZ - previousZ;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const tx = tangentX / tangentLength;
    const tz = tangentZ / tangentLength;
    const x = coastXAt(coast, z);
    const normal = seawardNormal(tangentX, tangentZ, overview.seaSide);
    const distances = [-95, 235];
    for (let end = 0; end < 2; end++) {
      for (let side = 0; side < 2; side++) {
        const distance = distances[end];
        const sideOffset = side ? 9 : -9;
        const px = x + normal.x * distance + tx * sideOffset;
        const pz = z + normal.z * distance + tz * sideOffset;
        const offset = (boundaryIndex * 4 + end * 2 + side) * 3;
        positions[offset] = px;
        positions[offset + 1] = distance <= 0
          ? sampleTerrainElevation(heights, overview, px, pz) * overview.terrain.verticalExaggeration + 8
          : overview.seaLevelMeters + 8;
        positions[offset + 2] = pz;
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
