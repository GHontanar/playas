import * as THREE from "three";
import type { StageBounds } from "./createStage";

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

/**
 * Lo único que el zócalo necesita saber del bloque que envuelve. Antes pedía un
 * `BeachConfig` entero y usaba seis campos, así que los niveles comarcal y de
 * índice —que no tienen ficha de playa ni la tendrán— fabricaban una falsa y la
 * colaban con un `as unknown as`. Era el único sitio del proyecto donde se
 * desactivaba el tipado, y estaba en un módulo de dibujo.
 */
export interface ChunkBaseOptions {
  /** Rejilla del relieve al que se ciñe el perímetro. */
  width: number;
  height: number;
  /** Extensión proyectada del bloque, en metros. */
  bounds: StageBounds;
  /** Cuánto baja el zócalo por debajo de la cota cero. */
  depthMeters: number;
  verticalExaggeration: number;
  visualStyle: "classic" | "mediterranean-illustrated";
}

export function createChunkBase(heights: Float32Array, options: ChunkBaseOptions): ChunkBase {
  const { width, height, bounds, visualStyle } = options;
  const sizeX = bounds.east - bounds.west;
  const sizeZ = bounds.north - bounds.south;
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;
  const depth = options.depthMeters;
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
  const rimPositions = visualStyle === "mediterranean-illustrated"
    ? new Float32Array(perimeter.length * 3)
    : undefined;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.MeshStandardMaterial({
    color: visualStyle === "mediterranean-illustrated" ? "#685363" : "#8a6477",
    roughness: 1,
    metalness: 0
  });
  // Los estratos se dibujaron para zócalos de 90 m. En un bloque comarcal, un
  // grosor fijo de 17 m produce cincuenta franjas que se leen como rayado, así
  // que a partir de cierta profundidad la banda crece con el bloque. Con los
  // 90 m de todos los chunks actuales el valor sigue siendo exactamente 17.
  const stratumMeters = Math.max(17, depth / 5.3);
  if (visualStyle === "mediterranean-illustrated") {
    material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying float vBaseY;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBaseY = position.y;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vBaseY;")
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float band = mod(floor((vBaseY + ${depth.toFixed(1)}) / ${stratumMeters.toFixed(1)}), 3.0);
          vec3 stratumA = vec3(0.27, 0.20, 0.27);
          vec3 stratumB = vec3(0.39, 0.29, 0.36);
          vec3 stratumC = vec3(0.48, 0.35, 0.39);
          diffuseColor.rgb = band < 1.0 ? stratumA : (band < 2.0 ? stratumB : stratumC);`
        );
    };
  }
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
  let rimGeometry: THREE.BufferGeometry | undefined;
  let rimMaterial: THREE.Material | undefined;
  if (rimPositions) {
    rimGeometry = new THREE.BufferGeometry();
    rimGeometry.setAttribute("position", new THREE.BufferAttribute(rimPositions, 3));
    rimMaterial = new THREE.LineBasicMaterial({
      color: "#d6a274",
      transparent: true,
      opacity: .72
    });
    group.add(new THREE.LineLoop(rimGeometry, rimMaterial));
  }
  let contactShadowGeometry: THREE.BufferGeometry | undefined;
  let contactShadowMaterial: THREE.Material | undefined;
  if (visualStyle === "mediterranean-illustrated") {
    const shadowGeometry = new THREE.PlaneGeometry(sizeX * 1.07, sizeZ * 1.07);
    shadowGeometry.rotateX(-Math.PI / 2);
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: "#2e2637",
      transparent: true,
      opacity: .18,
      depthWrite: false,
      side: THREE.DoubleSide
    });
    const contactShadow = new THREE.Mesh(shadowGeometry, shadowMaterial);
    contactShadow.position.y = -depth - 1.2;
    contactShadow.renderOrder = -1;
    group.add(contactShadow);
    contactShadowGeometry = shadowGeometry;
    contactShadowMaterial = shadowMaterial;
  }

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
      if (rimPositions) {
        rimPositions[index * 3] = a.x;
        rimPositions[index * 3 + 1] = ay + .18;
        rimPositions[index * 3 + 2] = a.z;
      }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.computeVertexNormals();
    if (rimGeometry) {
      rimGeometry.attributes.position.needsUpdate = true;
      rimGeometry.computeBoundingSphere();
    }
  };
  setExaggeration(options.verticalExaggeration);

  return {
    group,
    setExaggeration,
    dispose() {
      geometry.dispose();
      material.dispose();
      bottomGeometry.dispose();
      bottomMaterial.dispose();
      contactShadowGeometry?.dispose();
      contactShadowMaterial?.dispose();
      rimGeometry?.dispose();
      rimMaterial?.dispose();
    }
  };
}
