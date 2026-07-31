export type WaveVector = { x: number; z: number };

/**
 * Open-Meteo expresa el rumbo desde el que llega el oleaje, con 0° norte y
 * giro horario. La malla necesita el vector horizontal hacia el que avanza.
 */
export function waveTravelVector(fromDegrees: number): WaveVector {
  const travelBearing = (fromDegrees + 180) * Math.PI / 180;
  return {
    x: Math.sin(travelBearing),
    z: Math.cos(travelBearing)
  };
}
