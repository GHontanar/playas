import * as THREE from "three";

export type CoastPoint = [number, number];
export type CoastLine = CoastPoint[];

export function coastXAt(coast: CoastLine, z: number): number {
  if (coast.length < 2) throw new Error("La costa necesita al menos dos puntos.");
  if (z <= coast[0][1]) return coast[0][0];
  if (z >= coast[coast.length - 1][1]) return coast[coast.length - 1][0];
  for (let index = 1; index < coast.length; index++) {
    const a = coast[index - 1];
    const b = coast[index];
    if (z <= b[1]) {
      const t = (z - a[1]) / Math.max(.001, b[1] - a[1]);
      return THREE.MathUtils.lerp(a[0], b[0], t);
    }
  }
  return coast[coast.length - 1][0];
}

export type SeaSide = "east" | "west";

export function coastlineEnvelope(
  coastlines: CoastLine[],
  side: SeaSide,
  bucketMeters = 4
): CoastLine {
  const buckets = new Map<number, CoastPoint>();
  for (const point of coastlines.flat()) {
    const bucket = Math.round(point[1] / bucketMeters);
    const current = buckets.get(bucket);
    if (!current || (side === "east" ? point[0] > current[0] : point[0] < current[0])) {
      buckets.set(bucket, point);
    }
  }
  const envelope = [...buckets.values()].sort((a, b) => a[1] - b[1]);
  if (envelope.length < 5) return envelope;
  return envelope.map((point, index) => {
    const xs = envelope
      .slice(Math.max(0, index - 4), index + 5)
      .map((sample) => sample[0])
      .sort((a, b) => a - b);
    return [xs[Math.floor(xs.length / 2)], point[1]];
  });
}

export function landPolygonFromCoastlines(
  coastlines: CoastLine[],
  side: SeaSide,
  halfWidth: number,
  halfDepth: number
): CoastLine {
  // Las capas DERA no garantizan que las entidades ni sus vértices lleguen en
  // orden litoral. Concatenarlas produce polígonos auto-intersecados alrededor
  // de puertos (especialmente Garrucha) y clasifica arena como mar. La
  // envolvente ordenada conserva el límite tierra-mar y deja las estructuras
  // como geometría independiente.
  const joined = coastlineEnvelope(coastlines, side);
  const landX = side === "east" ? -halfWidth : halfWidth;
  return [...joined, [landX, halfDepth], [landX, -halfDepth]];
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

export function coastalFloodMask(
  coastlines: CoastLine[],
  side: SeaSide,
  width: number,
  height: number,
  halfWidth: number,
  halfDepth: number,
  extraSeeds: number[] = []
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
  const seedColumn = side === "east" ? width - 1 : 0;
  for (let row = 0; row < height; row++) {
    const index = row * width + seedColumn;
    if (!barrier[index]) { water[index] = 1; queue.push(index); }
  }
  for (const index of extraSeeds) {
    if (index >= 0 && index < water.length && !barrier[index] && !water[index]) {
      water[index] = 1;
      queue.push(index);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / width);
    const col = index % width;
    for (const [nextCol, nextRow] of [[col - 1, row], [col + 1, row], [col, row - 1], [col, row + 1]]) {
      if (nextCol < 0 || nextCol >= width || nextRow < 0 || nextRow >= height) continue;
      const next = nextRow * width + nextCol;
      if (barrier[next] || water[next]) continue;
      water[next] = 1;
      queue.push(next);
    }
  }
  return Array.from(water);
}

export function lowElevationBoundarySeeds(
  heightsNorthToSouth: Float32Array,
  width: number,
  height: number,
  maximumElevation = 2.5
): number[] {
  const seeds: number[] = [];
  const add = (col: number, maskRow: number, sourceRow: number) => {
    if (heightsNorthToSouth[sourceRow * width + col] <= maximumElevation) {
      seeds.push(maskRow * width + col);
    }
  };
  for (let col = 0; col < width; col++) {
    add(col, 0, height - 1);
    add(col, height - 1, 0);
  }
  for (let maskRow = 1; maskRow < height - 1; maskRow++) {
    const sourceRow = height - 1 - maskRow;
    add(0, maskRow, sourceRow);
    add(width - 1, maskRow, sourceRow);
  }
  return seeds;
}

export function isSeaPoint(
  coast: CoastLine,
  x: number,
  z: number,
  side: SeaSide,
  gap = 0
): boolean {
  const coastX = coastXAt(coast, z);
  return side === "east" ? x >= coastX + gap : x <= coastX - gap;
}

export function seawardNormal(dx: number, dz: number, side: SeaSide): { x: number; z: number } {
  const length = Math.hypot(dx, dz) || 1;
  let x = -dz / length;
  let z = dx / length;
  if ((side === "east" && x < 0) || (side === "west" && x > 0)) {
    x *= -1;
    z *= -1;
  }
  return { x, z };
}
