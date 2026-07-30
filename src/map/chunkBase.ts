import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";

interface EdgePoint {
  x: number;
  z: number;
  elevation: number;
}

export interface ChunkBase {
  group: THREE.Group;
  setExaggeration(value: number): void;
  dispose(): void;
}

export function createChunkBase(heights: Float32Array, config: BeachConfig): ChunkBase {
  const { width, height } = config.terrain;
  const bounds = config.projectedBounds;
  const sizeX = bounds.east - bounds.west;
  const sizeZ = bounds.north - bounds.south;
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;
  const depth = config.chunk.depthMeters;
  const perimeter: EdgePoint[] = [];

  const point = (col: number, row: number): EdgePoint => ({
    x: -halfX + col / (width - 1) * sizeX,
    z: halfZ - row / (height - 1) * sizeZ,
    elevation: Math.max(0.6, heights[row * width + col])
  });

  for (let col = 0; col < width; col++) perimeter.push(point(col, 0));
  for (let row = 1; row < height; row++) perimeter.push(point(width - 1, row));
  for (let col = width - 2; col >= 0; col--) perimeter.push(point(col, height - 1));
  for (let row = height - 2; row > 0; row--) perimeter.push(point(0, row));

  const positions = new Float32Array(perimeter.length * 6 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.MeshStandardMaterial({
    color: "#8a6477",
    roughness: 1,
    metalness: 0
  });
  const sides = new THREE.Mesh(geometry, material);
  sides.castShadow = true;
  // Evita bandas de shadow acne en las paredes coplanares con el borde denso
  // del terreno; la sombra informativa se lee en la superficie superior.
  sides.receiveShadow = false;

  const bottomMaterial = new THREE.MeshStandardMaterial({
    color: "#65536f",
    roughness: 1,
    metalness: 0,
    side: THREE.DoubleSide
  });
  const bottomGeometry = new THREE.PlaneGeometry(sizeX, sizeZ);
  bottomGeometry.rotateX(-Math.PI / 2);
  const bottom = new THREE.Mesh(bottomGeometry, bottomMaterial);
  bottom.position.y = -depth;
  bottom.castShadow = true;
  bottom.receiveShadow = true;

  const group = new THREE.Group();
  group.add(sides, bottom);

  const setExaggeration = (exaggeration: number) => {
    let cursor = 0;
    for (let index = 0; index < perimeter.length; index++) {
      const nextIndex = (index + 1) % perimeter.length;
      const a = perimeter[index];
      const b = perimeter[nextIndex];
      const ay = Math.max(0.6, a.elevation * exaggeration);
      const by = Math.max(0.6, b.elevation * exaggeration);
      const vertices = [
        a.x, ay, a.z, b.x, by, b.z, b.x, -depth, b.z,
        a.x, ay, a.z, b.x, -depth, b.z, a.x, -depth, a.z
      ];
      positions.set(vertices, cursor);
      cursor += vertices.length;
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
  };
  setExaggeration(config.terrain.verticalExaggeration);

  return {
    group,
    setExaggeration,
    dispose() {
      geometry.dispose();
      material.dispose();
      bottomGeometry.dispose();
      bottomMaterial.dispose();
    }
  };
}
