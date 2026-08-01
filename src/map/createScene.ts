import * as THREE from "three";
import type { BeachConfig } from "../beaches/types";
import { loadShadowTerrain, loadTerrain, type TerrainModel } from "./terrain";
import { loadCoastline } from "./coastline";
import { createStage } from "./createStage";
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
  addFrameListener(listener: (elapsedSeconds: number) => void): () => void;
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
  const b = config.projectedBounds;
  const sizeX = b.east - b.west;
  const sizeZ = b.north - b.south;
  const visibleCenterX = (b.west + b.east) / 2;
  const visibleCenterZ = (b.south + b.north) / 2;
  const shadowBounds = config.shadowTerrain.projectedBounds;
  const shadowOffset = Math.hypot(
    (shadowBounds.west + shadowBounds.east) / 2 - visibleCenterX,
    (shadowBounds.south + shadowBounds.north) / 2 - visibleCenterZ
  );
  // El caster puede estar descentrado respecto al chunk visible, así que el
  // mapa de sombras tiene que abarcar su diagonal más ese desplazamiento.
  const shadowSceneSize = Math.hypot(
    shadowBounds.east - shadowBounds.west,
    shadowBounds.north - shadowBounds.south
  ) + shadowOffset * 2;

  const stage = createStage(container, {
    bounds: b,
    camera: config.camera,
    worldAxes: config.worldAxes,
    visualStyle: config.visualStyle,
    vertical: {
      maxElevation: config.terrain.maxElevation,
      depthMeters: config.chunk.depthMeters,
      exaggeration: config.terrain.verticalExaggeration
    },
    shadowSceneSize
  });
  const { renderer, camera, world, light } = stage;
  // Pinta el fondo mientras se transfiere el relieve.
  stage.draw();

  // Empieza todas las transferencias en paralelo. La construcción CPU del
  // caster y de la ciudad se retrasa hasta después de la primera maqueta.
  const terrainPromise = loadTerrain(config);
  void loadFloat32(config.shadowTerrain.terrain.asset).catch(() => undefined);
  prefetchJson(config.buildingsAsset);
  prefetchJson(config.roadsAsset);
  prefetchJson(config.coastlineAsset);
  prefetchTexture("/terrain/textures/mediterranean-waves-normal.webp");

  let sea: SeaController | undefined;

  const terrain = await terrainPromise;
  terrain.mesh.scale.y = config.terrain.verticalExaggeration;
  world.add(terrain.mesh);
  const chunkBase = createChunkBase(terrain.heights, config);
  world.add(chunkBase.group);
  stage.resize();

  const [coastline, loadedSea] = await Promise.all([
    loadCoastline(config, terrain.heights, config.terrain.verticalExaggeration),
    createSea(sizeX, sizeZ, config, terrain.heights)
  ]);
  world.add(coastline);
  sea = loadedSea;
  world.add(sea.group);
  // El agua se anima sola: es ella la que mantiene el bucle vivo.
  stage.addFrameListener((elapsed) => sea?.update(elapsed));
  stage.draw();
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

  stage.resize();
  return {
    terrain,
    shadowTerrain,
    light,
    renderer,
    camera,
    world,
    addFrameListener: stage.addFrameListener,
    setExaggeration(value) {
      terrain.mesh.scale.y = value;
      chunkBase.setExaggeration(value);
      urban.group.scale.y = value / config.terrain.verticalExaggeration;
      coastline.scale.y = value / config.terrain.verticalExaggeration;
      shadowTerrain.mesh.scale.y = value;
      stage.setExaggeration(value);
    },
    setWireframe(value) { (terrain.mesh.material as THREE.MeshToonMaterial).wireframe = value; },
    setSeaConditions(value) { sea!.setConditions(value); },
    setWaterMode(value) { sea!.setMode(value); },
    setSeaSun(vector, visible) { sea!.setSun(vector, visible); },
    setSolarAppearance(altitudeDegrees, aboveHorizon) {
      const daylight = stage.setSolarAppearance(altitudeDegrees, aboveHorizon);
      if (daylight !== undefined) urban.setDaylight(daylight);
    },
    resize: stage.resize,
    dispose() {
      terrain.geometry.dispose();
      terrain.mesh.material.dispose();
      chunkBase.dispose();
      urban.dispose();
      sea?.dispose();
      shadowTerrain.geometry.dispose();
      shadowTerrain.mesh.material.dispose();
      stage.dispose();
    }
  };
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
