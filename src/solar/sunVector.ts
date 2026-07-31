export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export function sunVectorForWorldAxes(
  vector: Vector3Like,
  worldAxes: "north-positive" | "south-positive"
): Vector3Like {
  return worldAxes === "south-positive"
    ? { ...vector, z: -vector.z }
    : vector;
}

/**
 * Convierte los ángulos de SunCalc al sistema local de la escena:
 * x=este, y=arriba, z=norte. SunCalc mide el azimut desde el sur,
 * positivo hacia el oeste.
 */
export function sunCalcAnglesToVector(azimuth: number, altitude: number): Vector3Like {
  const horizontal = Math.cos(altitude);
  return {
    x: -Math.sin(azimuth) * horizontal,
    y: Math.sin(altitude),
    z: -Math.cos(azimuth) * horizontal
  };
}

export function sunCalcAzimuthToBearing(azimuth: number): number {
  return ((azimuth + Math.PI) * 180 / Math.PI + 360) % 360;
}
