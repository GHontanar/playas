import * as THREE from "three";
import { loadFloat32, loadJson, loadUint8 } from "./assets";
import { toonMaterial } from "../styles/toonMaterial";
import { regionAssets, type RegionCatalog } from "../regions/catalog";

/**
 * El relieve, el mar y la clasificación tierra-agua del bloque comarcal. Es la
 * parte que las dos comarcas comparten entera, y la que permite que el índice
 * dibuje la misma maqueta en miniatura en vez de una captura aparte: la única
 * diferencia entre la miniatura y la vista completa es qué rejilla se carga.
 *
 * No hay `seaSide` aquí: a esta escala la costa gira en un cabo y el mar puede
 * rodear la maqueta por dos lados, así que el agua se deduce por inundación
 * desde el borde del recorte.
 */

export const SEA_LEVEL = .15;
export const REGION_CHUNK_DEPTH = 600;
/**
 * Cuánto se hunden los vértices de tierra que aún sostienen un cuadro de orilla.
 * Basta con que la lámina se meta por debajo del relieve costero; bajarla hasta
 * el suelo del zócalo la ponía a 15 cm de él y las dos caras se peleaban.
 */
const SEA_SKIRT_METERS = 60;

const FLORA_COLOURS: Record<number, string> = {
  1: "#0f5c46",  // Posidonia oceánica
  2: "#2f8f66",  // Cymodocea nodosa
  3: "#166b51",  // mixta
  4: "#5f7048"   // Rissoella verruculosa, alga de fondo rocoso
};

// Ocho familias de CORINE nivel 3. La paleta se queda dentro de la del overview
// municipal —ocres, olivas y el salmón urbano— para que el nivel comarcal no
// estrene un vocabulario cromático propio.
const LAND_COLOURS: Record<number, string> = {
  1: "#e0bb80",  // suelo desnudo y roquedo
  2: "#8f9459",  // matorral y pastizal
  3: "#c9ab61",  // mosaico agrícola y secano
  4: "#47603f",  // bosque
  5: "#5f9448",  // regadío permanente
  6: "#d3c3c4",  // humedal y salinas
  7: "#3f8f96",  // agua continental
  8: "#d98c74",  // urbano e industrial
  9: "#e8d8a6"   // cauce y rambla, lecho seco de arena
};

// Escalones sobre profundidad logarítmica: los primeros cien metros son los que
// se ven desde la orilla y merecen casi la mitad del recorrido de color.
const DEPTH_STOPS: Array<[number, string]> = [
  [0, "#a9e0d4"],
  [10, "#6cc6bd"],
  [30, "#279b9c"],
  [100, "#1b7d87"],
  [300, "#125f70"],
  [1000, "#0c3f52"],
  [1800, "#092e40"]
];
const depthStopColours = DEPTH_STOPS.map(([, hex]) => new THREE.Color(hex));

export interface RegionGrid {
  width: number;
  height: number;
  /** Metros por celda de la rejilla cargada. */
  resolution: number;
  heights: Float32Array;
  /** Cinco bits de banda batimétrica y tres de clase de fondo vegetado. */
  seaCover: Uint8Array;
  landCover: Uint8Array;
  /** Profundidad media de cada banda, indexada por el valor de la banda. */
  bandDepths: number[];
  /** 1 en las celdas de mar abierto conectadas con el borde del recorte. */
  sea: Uint8Array;
  /** Celdas de agua hasta la tierra más cercana; 0 en tierra. */
  shoreDistance: Uint16Array;
  /** Bytes descargados para el relieve, que es lo que domina la espera. */
  demBytes: number;
}

export async function loadRegionGrid(
  region: RegionCatalog,
  variant: "full" | "thumbnail" = "full"
): Promise<RegionGrid> {
  const paths = regionAssets(region, variant);
  // La rejilla la manda el asset, no una constante escrita a mano: así cambiar
  // la resolución del MDT no obliga a tocar el cliente.
  const [demMetadata, seaMetadata] = await Promise.all([
    loadJson<{ width: number; height: number; webResolutionMeters: number }>(paths.demMetadata),
    loadJson<{ depthBands: Record<string, string> }>(paths.seaMetadata)
  ]);
  const { width, height } = demMetadata;
  const [heights, seaCover, landCover] = await Promise.all([
    loadFloat32(paths.dem),
    loadUint8(paths.sea),
    loadUint8(paths.land)
  ]);
  if (heights.length !== width * height) throw new Error(`DEM ${heights.length} != ${width * height}`);

  const sea = seaMask(heights, width, height);
  return {
    width,
    height,
    resolution: demMetadata.webResolutionMeters,
    heights,
    seaCover,
    landCover,
    bandDepths: bandMidpoints(seaMetadata.depthBands),
    sea,
    shoreDistance: distanceToLand(sea, width, height),
    demBytes: heights.byteLength
  };
}

export function buildRegionTerrain(region: RegionCatalog, grid: RegionGrid) {
  const { width, height, heights, landCover, sea } = grid;
  const sizeX = region.bounds.east - region.bounds.west;
  const sizeZ = region.bounds.north - region.bounds.south;
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, width - 1, height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color("#e7ad55");
  const sandLight = new THREE.Color("#f4cf72");
  const earth = new THREE.Color("#a69661");
  const rock = new THREE.Color("#666b70");
  const colour = new THREE.Color();
  const landColour = new THREE.Color();
  let maxElevation = 0;
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const sourceRow = height - 1 - row;
      const source = sourceRow * width + col;
      const offshore = sea[source] === 1;
      // Sin `coastMask` en el agua, cualquier celda de tierra que el MDT deja a
      // cota cero —ramblas, salinas, llanos litorales— queda bajo la lámina y se
      // lee como mar. El suelo mínimo la mantiene por encima, igual que el rim
      // del zócalo.
      const elevation = offshore ? -6 : Math.max(SEA_LEVEL + .35, heights[source]);
      maxElevation = Math.max(maxElevation, elevation);
      positions.setY(index, elevation);
      const left = heights[sourceRow * width + Math.max(0, col - 1)];
      const right = heights[sourceRow * width + Math.min(width - 1, col + 1)];
      const north = heights[Math.max(0, sourceRow - 1) * width + col];
      const south = heights[Math.min(height - 1, sourceRow + 1) * width + col];
      // La pendiente se normaliza por el tamaño de celda para que la miniatura
      // diezmada no salga con el doble de contraste que la maqueta completa.
      const slope = Math.hypot(right - left, south - north) / (grid.resolution * 4);
      // El grano mineral de las playas está calibrado en índices de celda: a 4 m
      // es textura, a 100 m son franjas de 2 km cruzando la comarca. Aquí va a
      // frecuencia alta y amplitud corta, solo para romper el plano.
      const noise = (Math.sin(col * 1.9 + row * 1.1) + Math.sin(col * .53 - row * .81) * .7) * .5 + .5;
      // Rampa hipsométrica: la fórmula por playa normaliza con `maxElevation` y
      // con 1.573 m dejaría toda la comarca en arena. Los tramos son llanura
      // litoral, secano y sierra, para que el gris de roca aparezca donde el
      // overview municipal lo pone.
      if (elevation <= 20) {
        colour.copy(sand).lerp(sandLight, .45 + noise * .16);
      } else if (elevation <= 140) {
        colour.copy(sand).lerp(earth, (elevation - 20) / 120);
      } else {
        const heightMix = Math.min(1, (elevation - 140) / 700);
        colour.copy(earth).lerp(rock, Math.min(1, slope * 1.4 + heightMix * .92));
      }
      // El uso del suelo pone el tono y la hipsometría sigue poniendo la luz:
      // mezclada, no sustituida, la ladera y la cumbre se siguen leyendo.
      const cover = landCover[source];
      if (cover) {
        landColour.set(LAND_COLOURS[cover] ?? "#8f9459");
        // Por encima de la media montaña manda la hipsometría: CORINE clasifica
        // como matorral hasta las cumbres y a esa altura el gris de roca es lo
        // que sostiene la lectura del relieve. El cauce se salva de esa regla:
        // es una forma del terreno, no una cobertura, y en la sierra es justo
        // donde el drenaje explica el relieve.
        const coverMix = cover === 9
          ? .8
          : .72 * (1 - THREE.MathUtils.smoothstep(elevation, 700, 1300));
        colour.lerp(landColour, coverMix);
      }
      // El overview municipal gana su contraste oscureciendo las laderas; a
      // 50 m la pendiente ya viene suavizada por el remuestreo, así que se
      // refuerza aquí en vez de dejar la comarca en un ocre plano.
      colour.offsetHSL(0, .03, (noise - .5) * .03 - Math.min(.08, slope * .3));
      colors[index * 3] = colour.r;
      colors[index * 3 + 1] = colour.g;
      colors[index * 3 + 2] = colour.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, toonMaterial({ vertexColors: true }));
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, maxElevation };
}

export function buildRegionSea(
  region: RegionCatalog,
  grid: RegionGrid,
  waveNormals?: THREE.Texture
): THREE.Mesh {
  const { width, height, sea, seaCover, shoreDistance, bandDepths } = grid;
  const sizeX = region.bounds.east - region.bounds.west;
  const sizeZ = region.bounds.north - region.bounds.south;
  // Recortada exactamente al bloque, como en los overviews: el agua es parte de
  // la maqueta, no un plano infinito bajo ella.
  const geometry = new THREE.PlaneGeometry(sizeX, sizeZ, width - 1, height - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const onLand = new Uint8Array(positions.count);
  const foam = new THREE.Color("#e4f3ec");
  const colour = new THREE.Color();
  const flora = new THREE.Color();
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const index = row * width + col;
      const source = (height - 1 - row) * width + col;
      // Recortada a la máscara: una lámina plana que cubre todo el pie del
      // bloque asoma por debajo del relieve en los bordes cercanos, tanto más
      // cuanto más levanta la sierra. Los chunks de playa lo evitan con el
      // `coastMask` del sombreador; aquí se hunde el vértice de tierra lo justo
      // para que la orilla lo tape.
      if (sea[source] !== 1) {
        onLand[index] = 1;
        positions.setY(index, -SEA_SKIRT_METERS);
      }
      // El color del agua lo pone la batimetría oficial, no la distancia a la
      // orilla: es lo que separa la plataforma ancha del Levante del desplome
      // de Cabo de Gata, donde la isóbata de 1.000 m se pega a la costa.
      const packed = seaCover[source];
      depthColour(bandDepths[packed & 31] ?? 0, colour);
      const floraClass = packed >> 5;
      if (floraClass) {
        // Praderas de fanerógamas y alga roja de fondo rocoso: hábitats
        // cartografiados, no una lectura del estado del agua.
        flora.set(FLORA_COLOURS[floraClass] ?? "#1c7a5e");
        // Las praderas caen en los tres primeros tramos batimétricos, donde el
        // agua ya es turquesa clara: con una mezcla suave se perdían.
        colour.lerp(flora, .85);
      }
      // La rompiente sigue siendo la orilla, no la profundidad.
      if (shoreDistance[source] <= 1) colour.copy(foam);
      colors[index * 3] = colour.r;
      colors[index * 3 + 1] = colour.g;
      colors[index * 3 + 2] = colour.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(seaSurfaceIndex(onLand, width, height));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    normalMap: waveNormals ?? null,
    normalScale: new THREE.Vector2(.35, .35),
    roughness: .68,
    metalness: 0,
    clearcoat: .08,
    clearcoatRoughness: .72
  }));
  mesh.position.y = SEA_LEVEL;
  mesh.receiveShadow = true;
  return mesh;
}

/**
 * Solo se teselan los cuadros que tocan agua.
 *
 * Antes se dibujaba la lámina entera y las celdas de tierra se hundían al fondo
 * del bloque, donde quedaban a 15 cm del suelo del zócalo: con el plano lejano a
 * 600 km el buffer de profundidad no separa esa distancia y las dos superficies
 * se peleaban. En el Levante no se notaba porque las dos caras que mira la
 * cámara son mar abierto y la lámina hundida quedaba tapada por el bloque; en la
 * Mariña la tierra llega al borde sur, que es una de esas dos caras, y el moteado
 * se comía el zócalo entero justo donde tenía que leerse como tierra.
 *
 * Quitar los cuadros de tierra elimina la superficie en conflicto en vez de
 * separarla, y de paso ahorra dibujar un tercio largo de la malla que nunca se
 * veía. Los cuadros de la orilla conservan sus vértices de tierra hundidos, para
 * que la lámina siga metiéndose por debajo del relieve costero.
 */
function seaSurfaceIndex(onLand: Uint8Array, width: number, height: number): number[] {
  const indices: number[] = [];
  for (let row = 0; row < height - 1; row++) {
    for (let col = 0; col < width - 1; col++) {
      const a = row * width + col;
      const b = (row + 1) * width + col;
      const c = (row + 1) * width + col + 1;
      const d = row * width + col + 1;
      if (onLand[a] && onLand[b] && onLand[c] && onLand[d]) continue;
      // Mismo orden que el índice original de `PlaneGeometry`, para no invertir
      // la cara y perder la iluminación del agua.
      indices.push(a, b, d, b, c, d);
    }
  }
  return indices;
}

export function depthColour(metres: number, target: THREE.Color): THREE.Color {
  if (metres <= DEPTH_STOPS[0][0]) return target.copy(depthStopColours[0]);
  for (let index = 1; index < DEPTH_STOPS.length; index++) {
    const [depth] = DEPTH_STOPS[index];
    if (metres > depth) continue;
    const [previous] = DEPTH_STOPS[index - 1];
    const from = Math.log10(Math.max(1, previous));
    const to = Math.log10(depth);
    const t = to === from ? 1 : (Math.log10(Math.max(1, metres)) - from) / (to - from);
    return target.copy(depthStopColours[index - 1]).lerp(depthStopColours[index], t);
  }
  return target.copy(depthStopColours[depthStopColours.length - 1]);
}

export function bandMidpoints(bands: Record<string, string>): number[] {
  const midpoints: number[] = [];
  for (const [band, interval] of Object.entries(bands)) {
    const [from, to] = interval.split("-").map(Number);
    midpoints[Number(band)] = (from + to) / 2;
  }
  return midpoints;
}

/** El mar es la cota cero conectada con el borde del recorte. */
export function seaMask(source: Float32Array, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(source.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (!mask[index] && source[index] <= .05) {
      mask[index] = 1;
      queue.push(index);
    }
  };
  for (let col = 0; col < width; col++) {
    push(col);
    push((height - 1) * width + col);
  }
  for (let row = 0; row < height; row++) {
    push(row * width);
    push(row * width + width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / width);
    const col = index % width;
    if (col > 0) push(index - 1);
    if (col < width - 1) push(index + 1);
    if (row > 0) push(index - width);
    if (row < height - 1) push(index + width);
  }
  return mask;
}

export function distanceToLand(mask: Uint8Array, width: number, height: number): Uint16Array {
  const distances = new Uint16Array(mask.length).fill(0xffff);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) {
      distances[index] = 0;
      queue.push(index);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / width);
    const col = index % width;
    const next = distances[index] + 1;
    const visit = (neighbour: number) => {
      if (distances[neighbour] > next) {
        distances[neighbour] = next;
        queue.push(neighbour);
      }
    };
    if (col > 0) visit(index - 1);
    if (col < width - 1) visit(index + 1);
    if (row > 0) visit(index - width);
    if (row < height - 1) visit(index + width);
  }
  return distances;
}
