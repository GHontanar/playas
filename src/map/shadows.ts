import * as THREE from "three";
import type { Vector3Like } from "../solar/sunVector";

export const SUN_LIGHT_RADIUS = 8000;

export function shadowCameraFar(sceneSize: number, lightRadius = SUN_LIGHT_RADIUS): number {
  return lightRadius + sceneSize * 1.5;
}

export function createSunLight(
  sceneSize: number,
  shadowMapSize = 1536,
  lightRadius = SUN_LIGHT_RADIUS
): THREE.DirectionalLight {
  const light = new THREE.DirectionalLight("#fff4d1", 3.2);
  light.castShadow = true;
  light.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const half = sceneSize * 0.56;
  light.shadow.camera.left = -half;
  light.shadow.camera.right = half;
  light.shadow.camera.top = half;
  light.shadow.camera.bottom = -half;
  light.shadow.camera.near = 10;
  // La cámara parte desde la posición de la luz. Su plano lejano debe superar
  // la distancia luz-terreno, no depender solo del tamaño del chunk.
  light.shadow.camera.far = shadowCameraFar(sceneSize, lightRadius);
  light.shadow.bias = -0.00015;
  light.shadow.normalBias = 0.7;
  light.target.position.set(0, 0, 0);
  return light;
}

export function updateSunLight(
  light: THREE.DirectionalLight,
  vector: Vector3Like,
  aboveHorizon: boolean,
  enabled: boolean,
  radius: number
): void {
  light.visible = aboveHorizon;
  light.castShadow = enabled;
  light.position.set(vector.x * radius, Math.max(0.05, vector.y) * radius, vector.z * radius);
  light.target.position.set(0, 0, 0);
}
