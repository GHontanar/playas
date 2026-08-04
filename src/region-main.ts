// Nivel comarcal: el bloque de 50 m con toda la costa que el catálogo cubre por
// municipios. Vive en `/region/?region=<id>` y era, hasta aquí, dos spikes
// gemelos —Levante y Mariña— con las mismas 780 líneas. Lo que cambia de una
// comarca a otra está en `src/regions/catalog.ts`; esto es el recorrido.
import * as THREE from "three";
import "./styles/region.css";
import { loadTexture } from "./map/assets";
import { createChunkBase } from "./map/chunkBase";
import { createStage } from "./map/createStage";
import {
  buildRegionSea,
  buildRegionTerrain,
  loadRegionGrid,
  REGION_CHUNK_DEPTH,
  SEA_LEVEL
} from "./map/regionChunk";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { refreshStatusAfterHourChange } from "./status/loadStatus";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { loadingMessage } from "./loading/loadingMessage";
import { breadcrumbHtml, municipalityChipsHtml, regionCrumbs } from "./nav/breadcrumb";
import { getRegion, regionAssets } from "./regions/catalog";
import { inkOn } from "./styles/ink";

const params = new URLSearchParams(window.location.search);
const region = getRegion(params.get("region"));
const number = (key: string, fallback: number) => Number(params.get(key) ?? fallback);

const BOUNDS = region.bounds;
const SIZE_X = BOUNDS.east - BOUNDS.west;
const SIZE_Z = BOUNDS.north - BOUNDS.south;
const SEAWARD = new THREE.Vector3(region.seaward.x, 0, region.seaward.z).normalize();
const STOPS = region.sectors.length + 1;

// Mismo rumbo y elevación que los overviews municipales, para que los tres
// niveles se lean como la misma maqueta vista desde el mismo sitio.
const BEARING = number("bearing", 45);
const PITCH = number("pitch", 32);
// El overview municipal da a sus rótulos un tamaño de mundo fijo, en torno al
// 8 % del largo del chunk, a altura constante sobre el mar y corridos hacia el
// agua para que no trepen por el relieve. Aquí se conserva el mismo criterio a
// la escala de este bloque: así se achican solos en la vista general y se leen
// al entrar en un tramo, sin depender del zoom. Se fija la altura y no el
// ancho, que lo marca la longitud del nombre: fijar el ancho dejaba «Vera» con
// el doble de letra que «Villaricos».
const LABEL_HEIGHT = number("labelHeight", 700);
const LABEL_ALTITUDE = 400;
const LABEL_SEAWARD = 1200;

document.title = `${region.name} · ${region.subtitle}`;
const app = document.querySelector<HTMLElement>("#app")!;
// Mismo recurso que el recorrido municipal: un escenario alto con la escena
// pegajosa dentro, para que el scroll de la página mueva la cámara.
app.innerHTML = `
  <main class="region-story">
    <section id="stage" class="region-stage" style="height:${STOPS * 100}vh"
      aria-label="Recorrido topográfico por la costa de ${region.name}">
      <div id="scene" class="region-scene">
        <div class="scene-heading">
          ${breadcrumbHtml(regionCrumbs(region))}
          <h1 class="scene-title">${region.name}<small>${region.subtitle}</small></h1>
        </div>
        <div id="loading" class="region-loading">${loadingMessage()}</div>
        <div id="region-error" class="region-error" hidden></div>
      </div>
      ${Array.from({ length: STOPS }, (_, index) =>
        `<i class="story-stop" style="top:${index * 100}vh" aria-hidden="true"></i>`).join("")}
    </section>
    <div class="region-footer">
      <div class="region-skip-links">${municipalityChipsHtml(region)}</div>
      <details class="region-controls">
        <summary>Sol y ajustes<span id="viewpoint"></span></summary>
        <div class="region-controls-panel">
          <label>Fecha <input id="date" type="date"></label>
          <label>Hora <output id="clock"></output>
            <input id="time" type="range" min="0" max="1425" step="15"></label>
          <button id="now" type="button">Ahora</button>
          <span id="sun"></span>
          <label>Exageración <output id="exag-out"></output>
            <input id="exag" type="range" min="1" max="5" step="0.1"></label>
          <label><input id="wire" type="checkbox"> Malla</label>
          <span id="stats"></span>
        </div>
      </details>
    </div>
  </main>`;

const container = document.querySelector<HTMLElement>("#scene")!;
const errorElement = document.querySelector<HTMLElement>("#region-error")!;

if (!window.WebGLRenderingContext) {
  showError("Este dispositivo no ofrece WebGL, necesario para mostrar la maqueta.");
} else {
  initialise().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : "No se pudo preparar la maqueta comarcal.");
  });
}

function showError(message: string) {
  document.querySelector("#loading")?.remove();
  errorElement.hidden = false;
  errorElement.textContent = message;
}

async function initialise() {
  const grid = await loadRegionGrid(regionAssets(region));
  const waveNormals = await loadTexture("/terrain/textures/mediterranean-waves-normal.webp");
  waveNormals.wrapS = THREE.RepeatWrapping;
  waveNormals.wrapT = THREE.RepeatWrapping;
  // A escala comarcal el relieve del oleaje no es medible: repite muy corto para
  // que solo aporte grano al agua, igual que la textura de los chunks.
  waveNormals.repeat.set(region.waveRepeat.x, region.waveRepeat.y);

  const { mesh, maxElevation } = buildRegionTerrain(BOUNDS, grid);
  let exaggeration = number("exag", 2.5);

  // El escenario —renderizador, cámara, luces, niebla, encuadre y la gradación de
  // cielo por altura solar— es el mismo de las otras dos vistas. Aquí solo cambian
  // cuatro cosas: sin aire alrededor del bloque, mapa de sombras mayor, el Sol más
  // lejos y un plano lejano que admita una cámara a 150 km.
  const distance = 150000;
  const stage = createStage(container, {
    bounds: BOUNDS,
    camera: { bearing: BEARING, pitch: PITCH, roll: 0, distance },
    worldAxes: "south-positive",
    visualStyle: "mediterranean-illustrated",
    vertical: { maxElevation, depthMeters: REGION_CHUNK_DEPTH, exaggeration },
    shadowSceneSize: Math.hypot(SIZE_X, SIZE_Z),
    margin: 1,
    shadowMapSize: 2048,
    sunLightRadius: SUN_LIGHT_RADIUS * 14,
    cameraFar: 600000
  });
  const { renderer, camera, world, light: sun } = stage;
  // Nada se anima por sí solo en esta escena, así que el escenario no arranca su
  // bucle: se dibuja cuando algo cambia. Además de ahorrar batería, es lo que
  // permite capturar la página con el navegador headless.
  const draw = stage.draw;
  const sunRadius = SUN_LIGHT_RADIUS * 14;
  const bearing = BEARING * Math.PI / 180;
  const pitch = PITCH * Math.PI / 180;
  // La orientación es constante: la cámara siempre se coloca a este vector del
  // objetivo, así que mover el objetivo desplaza el encuadre sin girar la maqueta.
  const cameraOffset = new THREE.Vector3(
    Math.sin(bearing) * Math.cos(pitch) * distance,
    Math.sin(pitch) * distance,
    Math.cos(bearing) * Math.cos(pitch) * distance
  );
  // La vista general se encuadra sobre el centro del bloque, no sobre el del
  // litoral: la maqueta se extiende tierra adentro, así que centrarla en la
  // costa la desplazaba hacia un lado.
  const focus = new THREE.Vector3();

  mesh.scale.y = exaggeration;
  world.add(mesh);

  // El zócalo es lo que convierte el recorte en maqueta: paredes estratificadas,
  // fondo y sombra de contacto sobre el fondo del lienzo.
  const base = createChunkBase(grid.heights, {
    width: grid.width,
    height: grid.height,
    bounds: BOUNDS,
    depthMeters: REGION_CHUNK_DEPTH,
    verticalExaggeration: exaggeration,
    visualStyle: "mediterranean-illustrated"
  });
  if (params.get("base") !== "0") world.add(base.group);

  if (params.get("sea") !== "0") world.add(buildRegionSea(BOUNDS, grid, waveNormals));

  const labels = region.anchors.map((anchor) => anchorLabel(anchor.name, anchor.x, anchor.y, anchor.municipalityId));
  for (const label of labels) world.add(label);

  // Los municipios con vista de costa se abren desde su rótulo. Los demás se
  // rotulan pero no llevan a ninguna parte: el nivel comarcal debe enseñar la
  // cobertura que hay, no insinuar la que falta. Con teclado se llega por las
  // fichas del pie, que enlazan las mismas costas.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const linked = labels.filter((label) => label.userData.municipality);
  function pickMunicipality(event: MouseEvent): string | undefined {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      (event.clientX - rect.left) / rect.width * 2 - 1,
      -(event.clientY - rect.top) / rect.height * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    const visible = linked.filter((label) => label.visible);
    return raycaster.intersectObjects(visible, false)[0]?.object.userData.municipality as string | undefined;
  }
  renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    renderer.domElement.style.cursor = pickMunicipality(event) ? "pointer" : "";
  });
  let pointerDown: { x: number; y: number } | null = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("click", (event) => {
    // Un arrastre para desplazar la página no debe abrir un municipio.
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) return;
    const municipality = pickMunicipality(event);
    if (municipality) window.location.assign(`/coast/?municipality=${encodeURIComponent(municipality)}`);
  });

  // Los rótulos son sprites en unidades de mundo: sin corregir, al acercarse a un
  // sector taparían media comarca. Se redimensionan con el zoom para ocupar
  // siempre lo mismo en pantalla.
  const projected = new THREE.Vector3();
  function placeLabels() {
    const worldWidth = (camera.right - camera.left) / camera.zoom;
    const worldHeight = (camera.top - camera.bottom) / camera.zoom;
    const ndcHeight = 2 * LABEL_HEIGHT / worldHeight;
    world.updateMatrixWorld();
    // Los pueblos están a dos y tres kilómetros y al alejarse las cajas se
    // pisan. Se descartan por solape real, y gana el primero de la lista.
    const shown: Array<[number, number, number]> = [];
    for (const label of labels) {
      projected.copy(label.position).applyMatrix4(world.matrixWorld).project(camera);
      const ndcWidth = 2 * LABEL_HEIGHT * (label.userData.aspect as number) / worldWidth;
      const clash = shown.some(([x, y, width]) =>
        Math.abs(x - projected.x) < (width + ndcWidth) / 2 &&
        Math.abs(y - projected.y) < ndcHeight);
      label.visible = !clash && Math.abs(projected.x) < 1.1 && Math.abs(projected.y) < 1.1;
      if (label.visible) shown.push([projected.x, projected.y, ndcWidth]);
    }
  }

  const viewpoints = [
    // El interior solo cuenta aquí, pero encajar el bloque entero dejaba la
    // maqueta pequeña y rodeada de fondo. Se acerca hasta un tercio del zoom de
    // los tramos, aceptando que las esquinas del recorte se corten.
    { name: "Vista general", target: focus.clone(), zoom: number("zoom", 1.5) },
    ...region.sectors.map((sector) => ({
      name: sector.name,
      // Los sectores de los extremos caen sobre las esquinas del recorte, así que
      // se sesgan un poco hacia el centro; y todos se corren hacia el mar, que es
      // lo que cambia sierra por costa sin tener que girar la cámara.
      target: sectorTarget(sector.anchors).lerp(focus, .08)
        .addScaledVector(SEAWARD, number("seaward", 1500)),
      zoom: number("sectorZoom", 4.6)
    }))
  ];

  const scroller = document.querySelector<HTMLElement>("#stage")!;
  const viewpointLabel = document.querySelector<HTMLElement>("#viewpoint")!;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function setCamera(target: THREE.Vector3, zoom: number) {
    camera.position.copy(cameraOffset).add(target);
    camera.lookAt(target);
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    placeLabels();
    draw();
  }

  function applyProgress(progress: number) {
    const position = progress * (viewpoints.length - 1);
    const from = Math.min(viewpoints.length - 1, Math.floor(position));
    const to = Math.min(viewpoints.length - 1, from + 1);
    const t = easeInOut(position - from);
    setCamera(
      viewpoints[from].target.clone().lerp(viewpoints[to].target, t),
      THREE.MathUtils.lerp(viewpoints[from].zoom, viewpoints[to].zoom, t)
    );
    viewpointLabel.textContent = viewpoints[t < .5 ? from : to].name;
  }

  // El scroll elige un keyframe; no rasca valores intermedios arbitrarios.
  const scrollProgress = () => {
    const travel = Math.max(1, scroller.offsetHeight - window.innerHeight);
    return THREE.MathUtils.clamp((window.scrollY - scroller.offsetTop) / travel, 0, 1);
  };
  const keyedProgress = () => Math.round(scrollProgress() * (viewpoints.length - 1)) / (viewpoints.length - 1);
  // `?progress=0..1` fija un keyframe sin scroll, para inspeccionarlos uno a uno.
  const forcedProgress = params.has("progress")
    ? THREE.MathUtils.clamp(number("progress", 0), 0, 1)
    : null;
  let currentProgress = forcedProgress ?? keyedProgress();
  let targetProgress = currentProgress;
  let storyFrame = 0;
  const animateStory = () => {
    const difference = targetProgress - currentProgress;
    currentProgress = Math.abs(difference) < .0001
      ? targetProgress
      : currentProgress + difference * .16;
    applyProgress(currentProgress);
    if (currentProgress !== targetProgress) storyFrame = requestAnimationFrame(animateStory);
  };
  const requestStoryUpdate = () => {
    if (forcedProgress !== null) return;
    targetProgress = keyedProgress();
    cancelAnimationFrame(storyFrame);
    if (reducedMotion) {
      currentProgress = targetProgress;
      applyProgress(currentProgress);
    } else {
      storyFrame = requestAnimationFrame(animateStory);
    }
  };
  window.addEventListener("scroll", requestStoryUpdate, { passive: true });
  applyProgress(currentProgress);

  document.querySelector<HTMLElement>("#stats")!.textContent =
    `${grid.width}×${grid.height} = ${(grid.width * grid.height / 1000).toFixed(0)}k vértices · ${(grid.demBytes / 1e6).toFixed(2)} MB · cota máx ${maxElevation.toFixed(0)} m · ${grid.resolution} m/celda · rumbo ${BEARING}°`;

  const exagInput = document.querySelector<HTMLInputElement>("#exag")!;
  exagInput.value = String(exaggeration);
  const showExaggeration = () => {
    document.querySelector<HTMLElement>("#exag-out")!.textContent = `${exaggeration.toFixed(1)}×`;
  };
  showExaggeration();
  exagInput.addEventListener("input", () => {
    exaggeration = Number(exagInput.value);
    mesh.scale.y = exaggeration;
    base.setExaggeration(exaggeration);
    stage.setExaggeration(exaggeration);
    showExaggeration();
    resize();
  });
  document.querySelector<HTMLInputElement>("#wire")!.addEventListener("change", (event) => {
    (mesh.material as THREE.MeshToonMaterial).wireframe = (event.target as HTMLInputElement).checked;
    draw();
  });

  // La gradación de cielo y luz por hora la pone el escenario, la misma que las
  // otras dos vistas. Aquí quedan solo los añadidos de este nivel: mover el Sol,
  // propagar el color del cielo al fondo de la página y elegir la tinta del
  // rótulo, que si no se vuelve ilegible de noche.
  function applySolarAppearance(dateISO: string, minutes: number) {
    const solar = getSolarPosition(dateISO, minutes, region.centre.lat, region.centre.lon);
    updateSunLight(sun, sunVectorForWorldAxes(solar.vector, "south-positive"), solar.aboveHorizon, true, sunRadius);
    stage.setSolarAppearance(solar.altitudeDegrees, solar.aboveHorizon);
    const skyColour = container.style.backgroundColor;
    document.documentElement.style.setProperty("--coast-sky", skyColour);
    document.documentElement.style.setProperty("--scene-ink", inkOn(new THREE.Color(skyColour)));
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", skyColour);
    document.querySelector<HTMLElement>("#sun")!.textContent = solar.aboveHorizon
      ? `Sol a ${solar.altitudeDegrees.toFixed(0)}°`
      : "Sol bajo el horizonte";
  }

  const initial = nowInMojacar();
  const dateInput = document.querySelector<HTMLInputElement>("#date")!;
  const timeInput = document.querySelector<HTMLInputElement>("#time")!;
  const clock = document.querySelector<HTMLElement>("#clock")!;
  dateInput.value = initial.dateISO;
  timeInput.value = String(number("minutes", initial.minutes));
  let followingClock = !params.has("minutes");

  function updateSun() {
    const minutes = Number(timeInput.value);
    clock.textContent = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    applySolarAppearance(dateInput.value, minutes);
    draw();
  }
  for (const input of [dateInput, timeInput]) {
    input.addEventListener("input", () => {
      followingClock = false;
      followClock();
      updateSun();
    });
  }
  document.querySelector<HTMLButtonElement>("#now")!.addEventListener("click", () => {
    const now = nowInMojacar();
    dateInput.value = now.dateISO;
    timeInput.value = String(now.minutes);
    followingClock = true;
    followClock();
    updateSun();
  });
  // Mientras nadie toque los controles, la escena sigue al reloj real como hacen
  // las otras dos vistas, que revalidan en cada cambio de hora. Con una hora
  // fijada por URL no se programa: el temporizador se reencadena solo y bajo
  // tiempo virtual —el de las capturas automáticas— no deja avanzar la página.
  let stopClock: (() => void) | undefined;
  function followClock() {
    stopClock?.();
    stopClock = followingClock
      ? refreshStatusAfterHourChange(() => {
        const now = nowInMojacar();
        dateInput.value = now.dateISO;
        timeInput.value = String(now.minutes);
        updateSun();
      })
      : undefined;
  }
  updateSun();
  followClock();

  function resize() {
    stage.resize();
    // El descarte de rótulos depende del frustum, que aquí acaba de cambiar.
    placeLabels();
    stage.draw();
  }

  window.addEventListener("resize", () => {
    resize();
    requestStoryUpdate();
  });
  resize();
  draw();
  document.querySelector("#loading")?.remove();

  function sectorTarget(names: string[]): THREE.Vector3 {
    const centreX = (BOUNDS.west + BOUNDS.east) / 2;
    const centreY = (BOUNDS.south + BOUNDS.north) / 2;
    const target = new THREE.Vector3();
    for (const name of names) {
      const anchor = region.anchors.find((candidate) => candidate.name === name);
      if (!anchor) throw new Error(`Sector sin ancla: ${name}`);
      // El mundo invierte Z, así que el objetivo va en coordenadas de escena.
      target.add(new THREE.Vector3(anchor.x - centreX, 0, centreY - anchor.y));
    }
    return target.multiplyScalar(1 / names.length);
  }
}

function easeInOut(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function anchorLabel(name: string, utmX: number, utmY: number, municipality?: string): THREE.Sprite {
  // El lienzo se ajusta al texto en vez de ser fijo: con un tamaño fijo el
  // rótulo era casi todo relleno y la letra se quedaba en unos pocos píxeles.
  const font = "600 96px system-ui, sans-serif";
  // El chevron distingue de un vistazo los municipios que llevan a su vista de
  // costa de los que solo están rotulados, sin necesidad de leyenda.
  const caption = municipality ? `${name} ›` : name;
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(measure.measureText(caption).width) + 96;
  canvas.height = 176;
  const context = canvas.getContext("2d")!;
  context.fillStyle = municipality ? "rgba(20, 63, 62, .92)" : "rgba(23, 53, 58, .78)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 40);
  context.fill();
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff8e9";
  context.fillText(caption, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  const aspect = canvas.width / canvas.height;
  sprite.userData.aspect = aspect;
  sprite.position.set(
    utmX - (BOUNDS.west + BOUNDS.east) / 2 + SEAWARD.x * LABEL_SEAWARD,
    SEA_LEVEL + LABEL_ALTITUDE,
    utmY - (BOUNDS.south + BOUNDS.north) / 2 - SEAWARD.z * LABEL_SEAWARD
  );
  sprite.scale.set(LABEL_HEIGHT * aspect, LABEL_HEIGHT, 1);
  sprite.center.set(.5, 0);
  sprite.renderOrder = 10;
  sprite.userData.municipality = municipality;
  return sprite;
}
