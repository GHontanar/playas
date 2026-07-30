import * as THREE from "three";

const steps = new Uint8Array([
  92, 92, 92, 255,
  145, 145, 145, 255,
  205, 205, 205, 255,
  255, 255, 255, 255
]);

const gradientMap = new THREE.DataTexture(steps, 4, 1, THREE.RGBAFormat);
gradientMap.minFilter = THREE.NearestFilter;
gradientMap.magFilter = THREE.NearestFilter;
gradientMap.needsUpdate = true;

export function toonMaterial(
  parameters: THREE.MeshToonMaterialParameters
): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({
    gradientMap,
    ...parameters
  });
}
