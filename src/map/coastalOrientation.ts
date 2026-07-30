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
