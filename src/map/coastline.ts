import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import {
  coastlineEnvelope,
  seawardNormal,
  type CoastLine
} from "./coastalOrientation";
import { sampleTerrainElevation } from "./terrain";
import { toonMaterial } from "../styles/toonMaterial";
import { loadJson } from "./assets";

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
  const data = await loadJson<GeoJSON>(config.coastlineAsset);
  const group = new THREE.Group();
  const material = new THREE.LineBasicMaterial({ color: "#f5df9c" });
  const structureIds = new Set(config.coastalStructures.map(({ featureId }) => featureId));
  const centerX = (config.projectedBounds.west + config.projectedBounds.east) / 2;
  const centerZ = (config.projectedBounds.south + config.projectedBounds.north) / 2;
  const coastlines: CoastLine[] = [];
  const wetSandLines: CoastLine[] = [];
  for (const feature of data.features) {
    const lines = feature.geometry.type === "MultiLineString"
      ? feature.geometry.coordinates as number[][][]
      : [feature.geometry.coordinates as number[][]];
    for (const line of lines) {
      const localLine = line.map(([x, y]) => [x - centerX, y - centerZ] as [number, number]);
      coastlines.push(localLine);
      const isStructure = Boolean(
        feature.properties?.id_dera && structureIds.has(feature.properties.id_dera)
      );
      if (config.visualStyle === "mediterranean-illustrated" && !isStructure) {
        wetSandLines.push(localLine);
      }
      if (!isStructure) continue;
      const closes = Math.hypot(
        localLine[0][0] - localLine.at(-1)![0],
        localLine[0][1] - localLine.at(-1)![1]
      ) <= 20;
      // Algunos espigones de DERA son polígonos cerrados; el puerto de
      // Garrucha, en cambio, llega como varios contornos abiertos. Cerrar esos
      // contornos implícitamente con ShapeGeometry creaba grandes triángulos
      // sobre arena y mar.
      const geometry = closes
        ? createClosedStructure(localLine)
        : createOpenStructureRibbon(localLine, 10);
      const position = geometry.attributes.position;
      const stoneColours = new Float32Array(position.count * 3);
      const stoneDark = new THREE.Color("#514c58");
      const stoneLight = new THREE.Color("#9d8e83");
      const stone = new THREE.Color();
      for (let index = 0; index < position.count; index++) {
        const x = position.getX(index);
        const z = position.getZ(index);
        const terrainY = sampleTerrainElevation(heights, config, x, z) * exaggeration;
        position.setY(index, Math.max(terrainY + 0.35, config.seaLevelMeters + 0.18));
        const variation = .5 + .5 * Math.sin(x * .23 + z * .31 + index * 1.7);
        stone.copy(stoneDark).lerp(stoneLight, variation);
        stone.toArray(stoneColours, index * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(stoneColours, 3));
      geometry.computeVertexNormals();
      const structure = new THREE.Mesh(geometry, toonMaterial({ vertexColors: true }));
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
  const points = coastlineEnvelope(wetSandLines.length ? wetSandLines : coastlines, config.seaSide)
    .map(([x, z]) => new THREE.Vector3(x, 2, z));
  group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), material));
  if (wetSandLines.length) {
    const wetSandMaterial = toonMaterial({
      color: "#bd8250",
      transparent: true,
      opacity: .56,
      side: THREE.DoubleSide
    });
    for (const line of wetSandLines) {
      const geometry = createLandwardRibbon(line, 13, config, heights, exaggeration);
      const ribbon = new THREE.Mesh(geometry, wetSandMaterial);
      ribbon.renderOrder = 2;
      ribbon.receiveShadow = true;
      group.add(ribbon);
    }
  }
  return group;
}

function createClosedStructure(line: CoastLine): THREE.BufferGeometry {
  const shape = new THREE.Shape(line.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function createOpenStructureRibbon(line: CoastLine, width: number): THREE.BufferGeometry {
  const positions = new Float32Array(line.length * 2 * 3);
  const indices: number[] = [];
  line.forEach(([x, z], index) => {
    const previous = line[Math.max(0, index - 1)];
    const next = line[Math.min(line.length - 1, index + 1)];
    const dx = next[0] - previous[0];
    const dz = next[1] - previous[1];
    const length = Math.hypot(dx, dz) || 1;
    const nx = -dz / length;
    const nz = dx / length;
    for (let side = 0; side < 2; side++) {
      const distance = (side - .5) * width;
      const offset = (index * 2 + side) * 3;
      positions[offset] = x + nx * distance;
      positions[offset + 1] = 0;
      positions[offset + 2] = z + nz * distance;
    }
    if (index < line.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function createLandwardRibbon(
  line: CoastLine,
  width: number,
  config: BeachConfig,
  heights: Float32Array,
  exaggeration: number
): THREE.BufferGeometry {
  const positions = new Float32Array(line.length * 2 * 3);
  const indices: number[] = [];
  line.forEach(([x, z], index) => {
    const previous = line[Math.max(0, index - 1)];
    const next = line[Math.min(line.length - 1, index + 1)];
    const normal = seawardNormal(next[0] - previous[0], next[1] - previous[1], config.seaSide);
    for (let edge = 0; edge < 2; edge++) {
      const irregularWidth = width * (
        .82 + .16 * Math.sin(index * .91) + .08 * Math.sin(index * .23 + 1.4)
      );
      const localX = x - normal.x * irregularWidth * edge;
      const localZ = z - normal.z * irregularWidth * edge;
      const offset = (index * 2 + edge) * 3;
      positions[offset] = localX;
      positions[offset + 1] = sampleTerrainElevation(heights, config, localX, localZ) * exaggeration + .5;
      positions[offset + 2] = localZ;
    }
    if (index < line.length - 1) {
      const offset = index * 2;
      indices.push(offset, offset + 1, offset + 2, offset + 1, offset + 3, offset + 2);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
