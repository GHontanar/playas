import * as THREE from "three";
import { createSunLight } from "./shadows";

/**
 * El escenario común de las maquetas: renderizador, cámara ortográfica, luces,
 * niebla, encuadre y la gradación de cielo y luz por altura solar. No sabe nada
 * de playas ni de comarcas; las capas las añade quien lo usa a `world`.
 *
 * Existe porque los tres niveles —playa, costa y comarca— comparten esta parte
 * entera y solo se diferencian en lo que cuelgan del mundo.
 */

export interface StageBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface StageOptions {
  /** Extensión visible, en coordenadas proyectadas. */
  bounds: StageBounds;
  camera: { bearing: number; pitch: number; roll: number; distance: number };
  worldAxes: "north-positive" | "south-positive";
  visualStyle: "classic" | "mediterranean-illustrated";
  /** Altura y profundidad que debe caber en el encuadre. */
  vertical: { maxElevation: number; depthMeters: number; exaggeration: number };
  /** Tamaño que debe abarcar el mapa de sombras. */
  shadowSceneSize: number;
  /** Aire alrededor del bloque al encajarlo. La maqueta comarcal no lo quiere. */
  margin?: number;
  shadowMapSize?: number;
  /** Distancia a la que se coloca el Sol; el bloque comarcal necesita más. */
  sunLightRadius?: number;
  /** Plano lejano. La cámara comarcal está a 150 km y no cabe en el de serie. */
  cameraFar?: number;
}

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  world: THREE.Group;
  light: THREE.DirectionalLight;
  /** Dibuja un fotograma. Necesario cuando no hay nada animándose. */
  draw(): void;
  addFrameListener(listener: (elapsedSeconds: number) => void): () => void;
  setExaggeration(value: number): void;
  /** Devuelve el factor de luz diurna, o `undefined` si el estilo no lo usa. */
  setSolarAppearance(altitudeDegrees: number, aboveHorizon: boolean): number | undefined;
  resize(): void;
  dispose(): void;
}

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const { bounds, visualStyle } = options;
  const renderer = new THREE.WebGLRenderer({ antialias: window.devicePixelRatio <= 1.5, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (visualStyle === "mediterranean-illustrated") {
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
  world.scale.z = options.worldAxes === "south-positive" ? -1 : 1;
  scene.add(world);

  const sizeX = bounds.east - bounds.west;
  const sizeZ = bounds.north - bounds.south;
  const sceneSize = Math.max(sizeX, sizeZ);
  const camera = new THREE.OrthographicCamera(-sizeX * 0.56, sizeX * 0.56, sizeZ * 0.56, -sizeZ * 0.56, 1, options.cameraFar ?? 20000);
  const bearing = options.camera.bearing * Math.PI / 180;
  const pitch = options.camera.pitch * Math.PI / 180;
  const d = options.camera.distance;
  if (d > 8000) {
    // En el overview municipal la cámara está mucho más lejos que en los
    // chunks de playa; el fog fijo borraría el extremo norte de la costa.
    scene.fog = new THREE.Fog("#eadfd7", d * .86, d + sceneSize * 1.35);
  }
  camera.position.set(Math.sin(bearing) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(bearing) * Math.cos(pitch) * d);
  camera.lookAt(0, 0, 0);
  camera.rotateZ(options.camera.roll * Math.PI / 180);
  camera.updateMatrixWorld();
  const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  let currentExaggeration = options.vertical.exaggeration;

  const hemisphere = new THREE.HemisphereLight("#fff1d5", "#62556d", 1.35);
  const ambient = new THREE.AmbientLight("#637987", 0);
  const fill = new THREE.DirectionalLight("#8ba6b8", 0);
  fill.position.set(2600, 4200, 2600);
  scene.add(hemisphere, ambient, fill);
  const light = createSunLight(
    options.shadowSceneSize,
    options.shadowMapSize ?? (window.innerWidth <= 650 ? 1024 : 1536),
    options.sunLightRadius
  );
  scene.add(light, light.target);

  // El bucle solo corre mientras haya algo animándose: el agua de los chunks de
  // playa y de costa lo pide, la maqueta comarcal no y se dibuja bajo demanda.
  const frameListeners = new Set<(elapsedSeconds: number) => void>();
  const clock = new THREE.Clock();
  let frame = 0;
  const draw = () => renderer.render(scene, camera);
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const elapsed = clock.getElapsedTime();
    frameListeners.forEach((listener) => listener(elapsed));
    draw();
  };

  function resize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    const aspect = width / Math.max(1, height);
    let projectedHalfWidth = 0;
    let projectedHalfHeight = 0;
    const visibleHeight = options.vertical.maxElevation * currentExaggeration;
    for (const x of [-sizeX / 2, sizeX / 2]) {
      for (const y of [-options.vertical.depthMeters, visibleHeight]) {
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
    ) * (options.margin ?? 1.08);
    camera.left = -viewHeight * aspect / 2;
    camera.right = viewHeight * aspect / 2;
    camera.top = viewHeight / 2;
    camera.bottom = -viewHeight / 2;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  return {
    renderer,
    scene,
    camera,
    world,
    light,
    draw,
    addFrameListener(listener) {
      frameListeners.add(listener);
      if (!frame) loop();
      return () => {
        frameListeners.delete(listener);
        if (!frameListeners.size) {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      };
    },
    setExaggeration(value) {
      currentExaggeration = value;
      resize();
    },
    setSolarAppearance(altitudeDegrees, aboveHorizon) {
      if (visualStyle !== "mediterranean-illustrated") return undefined;
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
      return daylight;
    },
    resize,
    dispose() {
      cancelAnimationFrame(frame);
      frame = 0;
      frameListeners.clear();
      renderer.dispose();
      renderer.domElement.remove();
    }
  };
}
