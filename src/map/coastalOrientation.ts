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

/** Ventanicas está en la costa oriental de Mojácar: el mar tiene X UTM mayor. */
export function isVentanicasSeaPoint(coast: CoastLine, x: number, z: number, gap = 0): boolean {
  return x >= coastXAt(coast, z) + gap;
}

export function ventanicasSeawardNormal(dx: number, dz: number): { x: number; z: number } {
  const length = Math.hypot(dx, dz) || 1;
  let x = -dz / length;
  let z = dx / length;
  if (x < 0) { x *= -1; z *= -1; }
  return { x, z };
}
