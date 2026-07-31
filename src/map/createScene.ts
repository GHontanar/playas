import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { loadShadowTerrain, loadTerrain, type TerrainModel } from "./terrain";
import { loadCoastline } from "./coastline";
import { createSunLight } from "./shadows";
import { createChunkBase } from "./chunkBase";
import { createUrbanLayer } from "./urban";
import { createSea, type SeaConditions, type SeaController, type WaterMode } from "./sea";
import type { Vector3Like } from "../solar/sunVector";
import { loadFloat32, prefetchJson, prefetchTexture } from "./assets";

export type SceneLoadOptions = {
  onFirstFrame?: () => void;
};

export interface SceneController {
  terrain: TerrainModel;
  shadowTerrain: TerrainModel;
  light: THREE.DirectionalLight;
  renderer: THREE.WebGLRenderer;
  camera: THREE.OrthographicCamera;
  world: THREE.Group;
  setExaggeration(value: number): void;
  setWireframe(value: boolean): void;
  setSeaConditions(value: SeaConditions): void;
  setWaterMode(value: WaterMode): void;
  setSeaSun(vector: Vector3Like, visible: boolean): void;
  setSolarAppearance(altitudeDegrees: number, aboveHorizon: boolean): void;
  resize(): void;
  dispose(): void;
}

export async function createScene(
  container: HTMLElement,
  config: BeachConfig,
  options: SceneLoadOptions = {}
): Promise<SceneController> {
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio <= 1.5, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (config.visualStyle === "mediterranean-illustrated") {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
  }
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
  if (d > 8000) {
    // En el overview municipal la cámara está mucho más lejos que en los
    // chunks de playa; el fog fijo borraría el extremo norte de la costa.
    scene.fog = new THREE.Fog("#eadfd7", d * .86, d + sceneSize * 1.35);
  }
  camera.position.set(Math.sin(bearing) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(bearing) * Math.cos(pitch) * d);
  camera.lookAt(0, 0, 0);
  camera.rotateZ(config.camera.roll * Math.PI / 180);
  camera.updateMatrixWorld();
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let currentExaggeration = config.terrain.verticalExaggeration;

  const visibleCenterX = (b.west + b.east) / 2;
  const visibleCenterZ = (b.south + b.north) / 2;
  const shadowBounds = config.shadowTerrain.projectedBounds;
  const hemisphere = new THREE.HemisphereLight("#fff1d5", "#62556d", 1.35);
  const ambient = new THREE.AmbientLight("#637987", 0);
  const fill = new THREE.DirectionalLight("#8ba6b8", 0);
  fill.position.set(2600, 4200, 2600);
  scene.add(hemisphere, ambient, fill);
  const shadowWidth = shadowBounds.east - shadowBounds.west;
  const shadowDepth = shadowBounds.north - shadowBounds.south;
  const shadowOffset = Math.hypot(
    (shadowBounds.west + shadowBounds.east) / 2 - visibleCenterX,
    (shadowBounds.south + shadowBounds.north) / 2 - visibleCenterZ
  );
  const shadowSceneSize = Math.hypot(shadowWidth, shadowDepth) + shadowOffset * 2;
  const light = createSunLight(shadowSceneSize, window.innerWidth <= 650 ? 1024 : 1536);
  scene.add(light, light.target);

  // Empieza todas las transferencias en paralelo. La construcción CPU del
  // caster y de la ciudad se retrasa hasta después de la primera maqueta.
  const terrainPromise = loadTerrain(config);
  void loadFloat32(config.shadowTerrain.terrain.asset).catch(() => undefined);
  prefetchJson(config.buildingsAsset);
  prefetchJson(config.roadsAsset);
  prefetchJson(config.coastlineAsset);
  prefetchTexture("/terrain/textures/mediterranean-waves-normal.webp");

  let sea: SeaController | undefined;
  let frame = 0;
  const clock = new THREE.Clock();
  const render = () => {
    frame = requestAnimationFrame(render);
    sea?.update(clock.getElapsedTime());
    renderer.render(scene, camera);
  };
  render();

  const terrain = await terrainPromise;
  terrain.mesh.scale.y = config.terrain.verticalExaggeration;
  world.add(terrain.mesh);
  const chunkBase = createChunkBase(terrain.heights, config);
  world.add(chunkBase.group);
  resize();

  const [coastline, loadedSea] = await Promise.all([
    loadCoastline(config, terrain.heights, config.terrain.verticalExaggeration),
    createSea(sizeX, sizeZ, config)
  ]);
  world.add(coastline);
  sea = loadedSea;
  world.add(sea.group);
  renderer.render(scene, camera);
  if (options.onFirstFrame) {
    await nextFrame();
    options.onFirstFrame();
    // Permite que el navegador pinte la maqueta básica antes de triangular la
    // ciudad y preparar el mapa de sombras.
    await nextFrame();
  }

  const [urban, shadowTerrain] = await Promise.all([
    createUrbanLayer(config, terrain.heights, config.terrain.verticalExaggeration),
    loadShadowTerrain(config)
  ]);
  world.add(urban.group);
  shadowTerrain.mesh.position.set(
    (shadowBounds.west + shadowBounds.east) / 2 - visibleCenterX,
    0,
    (shadowBounds.south + shadowBounds.north) / 2 - visibleCenterZ
  );
  shadowTerrain.mesh.scale.y = config.terrain.verticalExaggeration;
  world.add(shadowTerrain.mesh);

  function resize() {
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
  }
  resize();
  return {
    terrain,
    shadowTerrain,
    light,
    renderer,
    camera,
    world,
    setExaggeration(value) {
      currentExaggeration = value;
      terrain.mesh.scale.y = value;
      chunkBase.setExaggeration(value);
      urban.group.scale.y = value / config.terrain.verticalExaggeration;
      coastline.scale.y = value / config.terrain.verticalExaggeration;
      shadowTerrain.mesh.scale.y = value;
      resize();
    },
    setWireframe(value) { (terrain.mesh.material as THREE.MeshToonMaterial).wireframe = value; },
    setSeaConditions(value) { sea!.setConditions(value); },
    setWaterMode(value) { sea!.setMode(value); },
    setSeaSun(vector, visible) { sea!.setSun(vector, visible); },
    setSolarAppearance(altitudeDegrees, aboveHorizon) {
      if (config.visualStyle !== "mediterranean-illustrated") return;
      const daylight = aboveHorizon
        ? THREE.MathUtils.smoothstep(altitudeDegrees, -2, 28)
        : 0;
      const horizonWarmth = aboveHorizon
        ? 1 - THREE.MathUtils.smoothstep(altitudeDegrees, 4, 24)
        : 0;
      const background = new THREE.Color("#183440")
        .lerp(new THREE.Color("#d69578"), Math.max(horizonWarmth, daylight * .35))
        .lerp(new THREE.Color("#f1e5db"), daylight);
      scene.background = background;
      container.style.backgroundColor = background.getStyle();
      if (scene.fog) scene.fog.color.copy(background);
      hemisphere.color.copy(new THREE.Color("#6f91a0").lerp(new THREE.Color("#fff2d8"), daylight));
      hemisphere.groundColor.copy(new THREE.Color("#302b42").lerp(new THREE.Color("#6b5a68"), daylight));
      hemisphere.intensity = .58 + daylight * .55;
      ambient.color.copy(new THREE.Color("#526b7b").lerp(new THREE.Color("#ffe3c0"), daylight));
      ambient.intensity = .32 + horizonWarmth * .42 + daylight * .12;
      fill.color.copy(new THREE.Color("#66859b").lerp(new THREE.Color("#ffe0bc"), daylight));
      fill.intensity = .55 + horizonWarmth * 1.25 + daylight * .1;
      light.color.copy(new THREE.Color("#ff9b67").lerp(new THREE.Color("#fff5d8"), 1 - horizonWarmth));
      light.intensity = aboveHorizon ? 2.25 + daylight * .6 : 0;
      renderer.toneMappingExposure = .82 + daylight * .18;
      urban.setDaylight(daylight);
    },
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      terrain.geometry.dispose();
      terrain.mesh.material.dispose();
      chunkBase.dispose();
      urban.dispose();
      sea?.dispose();
      shadowTerrain.geometry.dispose();
      shadowTerrain.mesh.material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
