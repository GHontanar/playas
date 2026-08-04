import * as THREE from "three";

export type CoastPoint = [number, number];
export type CoastLine = CoastPoint[];

export type SeaSide = "east" | "west" | "north" | "south";

// La costa se modela como función `cross(along)`: el eje litoral es Z para las
// costas orientales/occidentales y X para las septentrionales/meridionales; la
// coordenada transversal es la otra. El mar cae hacia cross creciente para
// `east`/`north` y hacia cross decreciente para `west`/`south`.

export function alongOf(side: SeaSide, x: number, z: number): number {
  return side === "east" || side === "west" ? z : x;
}

export function crossOf(side: SeaSide, x: number, z: number): number {
  return side === "east" || side === "west" ? x : z;
}

export function seawardSign(side: SeaSide): 1 | -1 {
  return side === "east" || side === "north" ? 1 : -1;
}

export function recompose(side: SeaSide, along: number, cross: number): [number, number] {
  return side === "east" || side === "west" ? [cross, along] : [along, cross];
}

export function coastAt(coast: CoastLine, along: number, side: SeaSide): number {
  if (coast.length < 2) throw new Error("La costa necesita al menos dos puntos.");
  const first = alongOf(side, coast[0][0], coast[0][1]);
  const last = alongOf(side, coast.at(-1)![0], coast.at(-1)![1]);
  if (along <= first) return crossOf(side, coast[0][0], coast[0][1]);
  if (along >= last) return crossOf(side, coast.at(-1)![0], coast.at(-1)![1]);
  for (let index = 1; index < coast.length; index++) {
    const a = coast[index - 1];
    const b = coast[index];
    const alongB = alongOf(side, b[0], b[1]);
    if (along <= alongB) {
      const alongA = alongOf(side, a[0], a[1]);
      const t = (along - alongA) / Math.max(.001, alongB - alongA);
      return THREE.MathUtils.lerp(
        crossOf(side, a[0], a[1]),
        crossOf(side, b[0], b[1]),
        t
      );
    }
  }
  return last;
}

export function coastlineEnvelope(
  coastlines: CoastLine[],
  side: SeaSide,
  bucketMeters = 4
): CoastLine {
  const sign = seawardSign(side);
  const buckets = new Map<number, CoastPoint>();
  const consider = (along: number, cross: number) => {
    const bucket = Math.round(along / bucketMeters);
    const current = buckets.get(bucket);
    if (current) {
      const currentCross = crossOf(side, current[0], current[1]);
      if (sign === 1 ? cross <= currentCross : cross >= currentCross) return;
    }
    buckets.set(bucket, recompose(side, along, cross));
  };
  for (const line of coastlines) {
    for (let index = 0; index < line.length; index++) {
      const alongPoint = alongOf(side, line[index][0], line[index][1]);
      const crossPoint = crossOf(side, line[index][0], line[index][1]);
      consider(alongPoint, crossPoint);
      if (!index) continue;
      // Un tramo largo atraviesa cubos sin dejar vértice en ellos. Si sólo se
      // miran los vértices, en la ría de Foz esos cubos se quedan con la orilla
      // interior del estuario y la envolvente salta de una orilla a otra.
      const previous = line[index - 1];
      const alongPrevious = alongOf(side, previous[0], previous[1]);
      const crossPrevious = crossOf(side, previous[0], previous[1]);
      const first = Math.round(alongPrevious / bucketMeters);
      const last = Math.round(alongPoint / bucketMeters);
      const step = Math.sign(last - first);
      for (let bucket = first + step; step && bucket !== last; bucket += step) {
        const along = bucket * bucketMeters;
        const progress = (along - alongPrevious) / (alongPoint - alongPrevious);
        consider(along, THREE.MathUtils.lerp(crossPrevious, crossPoint, progress));
      }
    }
  }
  const envelope = closeNarrowInlets([...buckets.values()].sort((a, b) => {
    const alongA = alongOf(side, a[0], a[1]);
    const alongB = alongOf(side, b[0], b[1]);
    return alongA - alongB;
  }), side);
  if (envelope.length < 5) return envelope;
  return envelope.map((point, index) => {
    const crosses = envelope
      .slice(Math.max(0, index - 4), index + 5)
      .map((sample) => crossOf(side, sample[0], sample[1]))
      .sort((a, b) => a - b);
    return recompose(side, alongOf(side, point[0], point[1]), crosses[Math.floor(crosses.length / 2)]);
  });
}

/**
 * Una bocana —la de la ría de Foz, la de un puerto— es un hueco en la línea de
 * costa: en esos cubos no hay orilla mar adentro, así que la envolvente se
 * descuelga hasta la orilla interior del estuario y vuelve, y esa ida y vuelta
 * cruza el agua como dos rectas. Cada entrante se cierra con la recta entre sus
 * dos hombros cuando es más profunda que ancha; una ensenada de verdad es mucho
 * más ancha que profunda y se conserva tal cual.
 */
function closeNarrowInlets(envelope: CoastLine, side: SeaSide): CoastLine {
  const sign = seawardSign(side);
  const alongs = envelope.map((point) => alongOf(side, point[0], point[1]));
  // Signadas hacia el mar: la mayor es siempre la más marina.
  const crosses = envelope.map((point) => crossOf(side, point[0], point[1]) * sign);
  const inlets: Array<[number, number]> = [];
  const shoulders: number[] = [];
  for (let index = 0; index < envelope.length; index++) {
    while (shoulders.length && crosses[index] > crosses[shoulders[shoulders.length - 1]]) {
      const bottom = shoulders.pop()!;
      const left = shoulders[shoulders.length - 1];
      if (left === undefined) break;
      const depth = Math.min(crosses[left], crosses[index]) - crosses[bottom];
      if (depth > alongs[index] - alongs[left]) inlets.push([left, index]);
    }
    shoulders.push(index);
  }
  if (!inlets.length) return envelope;
  // Las entrantes salen de dentro afuera, así que una boca mayor sobrescribe
  // las que encierra.
  const closed = crosses.slice();
  for (const [left, right] of inlets) {
    for (let index = left + 1; index < right; index++) {
      const progress = (alongs[index] - alongs[left]) / (alongs[right] - alongs[left]);
      closed[index] = THREE.MathUtils.lerp(crosses[left], crosses[right], progress);
    }
  }
  return envelope.map((_, index) => recompose(side, alongs[index], closed[index] * sign));
}

export function landPolygonFromCoastlines(
  coastlines: CoastLine[],
  side: SeaSide,
  halfWidth: number,
  halfDepth: number
): CoastLine {
  // Las capas de costa no garantizan que las entidades ni sus vértices lleguen
  // en orden litoral. Concatenarlas produce polígonos auto-intersecados alrededor
  // de puertos y clasifica arena como mar. La envolvente ordenada conserva el
  // límite tierra-mar y deja las estructuras como geometría independiente.
  const joined = coastlineEnvelope(coastlines, side);
  const landCross = side === "east" || side === "north" ? -1 : 1;
  if (side === "east" || side === "west") {
    const landX = landCross * halfWidth;
    return [...joined, [landX, halfDepth], [landX, -halfDepth]];
  }
  const landZ = landCross * halfDepth;
  return [...joined, [halfWidth, landZ], [-halfWidth, landZ]];
}

export function isPointInPolygon(point: CoastPoint, polygon: CoastLine): boolean {
  let inside = false;
  for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
    const [xi, zi] = polygon[current];
    const [xj, zj] = polygon[previous];
    const intersects = zi > point[1] !== zj > point[1]
      && point[0] < (xj - xi) * (point[1] - zi) / (zj - zi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export interface EnclosedWater {
  /** Alturas del MDT en el orden del asset: la fila 0 es la del norte. */
  heightsNorthToSouth: Float32Array;
  maximumElevation?: number;
}

export function coastalFloodMask(
  coastlines: CoastLine[],
  side: SeaSide,
  width: number,
  height: number,
  halfWidth: number,
  halfDepth: number,
  enclosedWater?: EnclosedWater
): number[] {
  const barrier = new Uint8Array(width * height);
  const cellX = halfWidth * 2 / Math.max(1, width - 1);
  const cellZ = halfDepth * 2 / Math.max(1, height - 1);
  const spacing = Math.max(.5, Math.min(cellX, cellZ) / 3);
  const mark = (x: number, z: number) => {
    const col = Math.round((x + halfWidth) / (halfWidth * 2) * (width - 1));
    const row = Math.round((z + halfDepth) / (halfDepth * 2) * (height - 1));
    if (col >= 0 && col < width && row >= 0 && row < height) barrier[row * width + col] = 1;
  };
  for (const line of coastlines) {
    for (let index = 1; index < line.length; index++) {
      const a = line[index - 1];
      const b = line[index];
      const count = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
      for (let step = 0; step <= count; step++) {
        const t = step / count;
        mark(THREE.MathUtils.lerp(a[0], b[0], t), THREE.MathUtils.lerp(a[1], b[1], t));
      }
    }
  }

  const water = new Uint8Array(width * height);
  const queue: number[] = [];
  const heights = enclosedWater?.heightsNorthToSouth;
  const maximumElevation = enclosedWater?.maximumElevation ?? 2.5;
  // La costa llega fragmentada en tramos (IHM); un relleno incondicionado se
  // cuela por los huecos e inunda la tierra. El agua no remonta cotas altas.
  const canFlood = (index: number) => {
    if (!heights) return true;
    const row = Math.floor(index / width);
    return heights[(height - 1 - row) * width + index % width] <= maximumElevation;
  };
  const seed = (index: number) => {
    if (!barrier[index] && canFlood(index)) { water[index] = 1; queue.push(index); }
  };
  if (side === "east") {
    for (let row = 0; row < height; row++) seed(row * width + width - 1);
  } else if (side === "west") {
    for (let row = 0; row < height; row++) seed(row * width);
  } else if (side === "north") {
    for (let col = 0; col < width; col++) seed((height - 1) * width + col);
  } else {
    for (let col = 0; col < width; col++) seed(col);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [nextCol, nextRow] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= height) continue;
      const next = nextRow * width + nextCol;
      if (barrier[next] || water[next]) continue;
      if (!canFlood(next)) continue;
      water[next] = 1;
      queue.push(next);
    }
  }
  if (enclosedWater) floodEnclosedWater(water, barrier, width, height, enclosedWater);
  return Array.from(water);
}

/**
 * Un recorte que empieza dentro de un puerto no contiene la bocana: la dársena
 * queda encerrada entre los muelles y no se alcanza desde el borde de mar. Cada
 * componente que la costa deja sin resolver se decide por separado y es agua si
 * toca el borde del recorte —entra desde fuera— y su cota mediana está al nivel
 * del mar. La mediana es lo que separa la dársena del continente: sembrar por
 * cotas bajas de borde inundaba la playa y el casco urbano de Playazo Garrucha,
 * que son llanos pero cuelgan del componente terrestre.
 */
function floodEnclosedWater(
  water: Uint8Array,
  barrier: Uint8Array,
  width: number,
  height: number,
  { heightsNorthToSouth, maximumElevation = 2.5 }: EnclosedWater
): void {
  const visited = new Uint8Array(water);
  for (let start = 0; start < water.length; start++) {
    if (barrier[start] || visited[start]) continue;
    visited[start] = 1;
    const component = [start];
    let touchesBoundary = false;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const index = component[cursor];
      const row = Math.floor(index / width);
      const col = index % width;
      if (!row || !col || row === height - 1 || col === width - 1) touchesBoundary = true;
      for (const [nextCol, nextRow] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
        if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= height) continue;
        const next = nextRow * width + nextCol;
        if (barrier[next] || visited[next]) continue;
        visited[next] = 1;
        component.push(next);
      }
    }
    if (!touchesBoundary) continue;
    // La máscara va de sur a norte y el MDT al revés.
    const elevations = component
      .map((index) => heightsNorthToSouth[(height - 1 - Math.floor(index / width)) * width + index % width])
      .sort((a, b) => a - b);
    if (elevations[elevations.length >> 1] > maximumElevation) continue;
    for (const index of component) water[index] = 1;
  }
}

export function isSeaPoint(
  coast: CoastLine,
  x: number,
  z: number,
  side: SeaSide,
  gap = 0
): boolean {
  const along = alongOf(side, x, z);
  const cross = crossOf(side, x, z);
  const coastCross = coastAt(coast, along, side);
  return seawardSign(side) === 1 ? cross >= coastCross + gap : cross <= coastCross - gap;
}

export function seawardNormal(dx: number, dz: number, side: SeaSide): { x: number; z: number } {
  const length = Math.hypot(dx, dz) || 1;
  let x = -dz / length;
  let z = dx / length;
  const seaX = side === "east" ? 1 : side === "west" ? -1 : 0;
  const seaZ = side === "north" ? 1 : side === "south" ? -1 : 0;
  if (x * seaX + z * seaZ < 0) {
    x *= -1;
    z *= -1;
  }
  return { x, z };
}
