import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { loadTerrain, type TerrainModel } from "./terrain";
import { loadCoastline } from "./coastline";
import { createSunLight } from "./shadows";
import { createChunkBase } from "./chunkBase";
import { createUrbanLayer } from "./urban";
import { createSea, type SeaState } from "./sea";

export interface SceneController {
  terrain: TerrainModel;
  shadowTerrain: TerrainModel;
  light: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  setExaggeration(value: number): void;
  setWireframe(value: boolean): void;
  setSeaState(value: SeaState): void;
  resize(): void;
  dispose(): void;
}

export async function createScene(container: HTMLElement, config: BeachConfig): Promise<SceneController> {
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio <= 1.5, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#eadfd7");
  scene.fog = new THREE.Fog("#eadfd7", 8000, 15000);
  const world = new THREE.Group();
  // Three.js es dextrógiro: con X=este e Y=arriba, Z+ debe ser sur.
  // La opción north-positive solo permite abrir configuraciones antiguas.
  world.scale.z = config.worldAxes === "south-positive" ? -1 : 1;
  scene.add(world);
  const b = config.projectedBounds;
  const sizeX = b.east - b.west;
  const sizeZ = b.north - b.south;
  const sceneSize = Math.max(sizeX, sizeZ);
  const camera = new THREE.OrthographicCamera(-sizeX * 0.56, sizeX * 0.56, sizeZ * 0.56, -sizeZ * 0.56, 1, 20000);
  const bearing = config.camera.bearing * Math.PI / 180;
  const pitch = config.camera.pitch * Math.PI / 180;
  const d = config.camera.distance;
  camera.position.set(Math.sin(bearing) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(bearing) * Math.cos(pitch) * d);
  camera.lookAt(0, 0, 0);
  camera.rotateZ(config.camera.roll * Math.PI / 180);
  camera.updateMatrixWorld();
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let currentExaggeration = config.terrain.verticalExaggeration;

  const terrain = await loadTerrain(config);
  terrain.mesh.scale.y = config.terrain.verticalExaggeration;
  world.add(terrain.mesh);
  const chunkBase = createChunkBase(terrain.heights, config);
  world.add(chunkBase.group);
  const urban = await createUrbanLayer(
    config,
    terrain.heights,
    config.terrain.verticalExaggeration
  );
  world.add(urban.group);
  const shadowTerrain = await loadTerrain(config, config.shadowTerrain);
  const visibleCenterX = (b.west + b.east) / 2;
  const visibleCenterZ = (b.south + b.north) / 2;
  const shadowBounds = config.shadowTerrain.projectedBounds;
  shadowTerrain.mesh.position.set(
    (shadowBounds.west + shadowBounds.east) / 2 - visibleCenterX,
    0,
    (shadowBounds.south + shadowBounds.north) / 2 - visibleCenterZ
  );
  shadowTerrain.mesh.scale.y = config.terrain.verticalExaggeration;
  shadowTerrain.mesh.material.colorWrite = false;
  shadowTerrain.mesh.material.depthWrite = false;
  shadowTerrain.mesh.receiveShadow = false;
  shadowTerrain.mesh.castShadow = true;
  world.add(shadowTerrain.mesh);
  const coastline = await loadCoastline(
    config,
    terrain.heights,
    config.terrain.verticalExaggeration
  );
  world.add(coastline);

  const sea = await createSea(sizeX, sizeZ, config);
  world.add(sea.group);

  scene.add(new THREE.HemisphereLight("#fff1d5", "#62556d", 1.35));
  const shadowWidth = shadowBounds.east - shadowBounds.west;
  const shadowDepth = shadowBounds.north - shadowBounds.south;
  const shadowOffset = Math.hypot(
    (shadowBounds.west + shadowBounds.east) / 2 - visibleCenterX,
    (shadowBounds.south + shadowBounds.north) / 2 - visibleCenterZ
  );
  // Diagonal del caster más su desplazamiento respecto al chunk visible:
  // garantiza que el frustum no recorte los cerros occidentales al rotar la luz.
  const shadowSceneSize = Math.hypot(shadowWidth, shadowDepth) + shadowOffset * 2;
  const light = createSunLight(shadowSceneSize, window.innerWidth <= 650 ? 1024 : 1536);
  scene.add(light, light.target);

  let frame = 0;
  const clock = new THREE.Clock();
  const render = () => {
    frame = requestAnimationFrame(render);
    sea.update(clock.getElapsedTime());
    renderer.render(scene, camera);
  };
  render();

  const resize = () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / Math.max(1, height);
    let projectedHalfWidth = 0;
    let projectedHalfHeight = 0;
    const visibleHeight = config.terrain.maxElevation * currentExaggeration;
    for (const x of [-sizeX / 2, sizeX / 2]) {
      for (const y of [-config.chunk.depthMeters, visibleHeight]) {
        for (const z of [-sizeZ / 2, sizeZ / 2]) {
          const corner = new THREE.Vector3(x, y, z);
          projectedHalfWidth = Math.max(projectedHalfWidth, Math.abs(corner.dot(cameraRight)));
          projectedHalfHeight = Math.max(projectedHalfHeight, Math.abs(corner.dot(cameraUp)));
        }
      }
    }
    // Encaja ambos ejes: en un viewport estrecho, basarse solo en la altura
    // recortaba los laterales del chunk.
    const viewHeight = Math.max(
      projectedHalfHeight * 2,
      projectedHalfWidth * 2 / Math.max(0.1, aspect)
    ) * 1.08;
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  };
  resize();
  return {
    terrain,
    shadowTerrain,
    light,
    renderer,
    setExaggeration(value) {
      currentExaggeration = value;
      terrain.mesh.scale.y = value;
      chunkBase.setExaggeration(value);
      urban.group.scale.y = value / config.terrain.verticalExaggeration;
      coastline.scale.y = value / config.terrain.verticalExaggeration;
      shadowTerrain.mesh.scale.y = value;
      resize();
    },
    setWireframe(value) { terrain.mesh.material.wireframe = value; },
    setSeaState(value) { sea.setState(value); },
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      terrain.geometry.dispose();
      terrain.mesh.material.dispose();
      chunkBase.dispose();
      urban.dispose();
      sea.dispose();
      shadowTerrain.geometry.dispose();
      shadowTerrain.mesh.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
