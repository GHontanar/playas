// Spike P0 del nivel regional. Página desechable: no entra en el build ni en el
// catálogo. Responde si el relieve del Levante y Cabo de Gata lee como maqueta a
// 100 m, sin la maquinaria costera dependiente de `seaSide`.
import * as THREE from "three";
import type { BeachConfig } from "./beaches/types";
import { loadFloat32, loadJson, loadTexture } from "./map/assets";
import { createChunkBase } from "./map/chunkBase";
import { SUN_LIGHT_RADIUS, createSunLight, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { refreshStatusAfterHourChange } from "./status/loadStatus";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { toonMaterial } from "./styles/toonMaterial";

const BOUNDS = { west: 557600, south: 4060000, east: 612000, north: 4125000 };
const SEA_LEVEL = .15;
const CHUNK_DEPTH = 600;
// Centro del recorte, para el Sol.
const CENTRE = { lat: 36.936, lon: -2.055 };
const FLORA_COLOURS: Record<number, string> = {
  1: "#0f5c46",  // Posidonia oceánica
  2: "#2f8f66",  // Cymodocea nodosa
  3: "#166b51",  // mixta
  4: "#5f7048"   // Rissoella verruculosa, alga de fondo rocoso
};

// Ocho familias de CORINE nivel 3. La paleta se queda dentro de la del overview
// municipal —ocres, olivas y el salmón urbano— para que el nivel comarcal no
// estrene un vocabulario cromático propio.
const LAND_COLOURS: Record<number, string> = {
  1: "#e0bb80",  // suelo desnudo y roquedo
  2: "#8f9459",  // matorral y pastizal
  3: "#c9ab61",  // mosaico agrícola y secano
  4: "#47603f",  // bosque
  5: "#5f9448",  // regadío permanente
  6: "#d3c3c4",  // humedal y salinas
  7: "#3f8f96",  // agua continental
  8: "#d98c74",  // urbano e industrial
  9: "#e8d8a6"   // cauce y rambla, lecho seco de arena
};

// Escalones sobre profundidad logarítmica: los primeros cien metros son los que
// se ven desde la orilla y merecen casi la mitad del recorrido de color.
const DEPTH_STOPS: Array<[number, string]> = [
  [0, "#a9e0d4"],
  [10, "#6cc6bd"],
  [30, "#279b9c"],
  [100, "#1b7d87"],
  [300, "#125f70"],
  [1000, "#0c3f52"],
  [1800, "#092e40"]
];
const depthStopColours = DEPTH_STOPS.map(([, hex]) => new THREE.Color(hex));

// Lugares rotulados. Vera sale del punto medio del litoral de su overview
// municipal, `vera-coast`, no de una coordenada escrita a mano. El orden es la
// prioridad al descartar solapes: primero los municipios que tienen maqueta.
const ANCHORS: Array<[string, number, number]> = [
  ["Mojácar", 602204, 4105475],
  ["Carboneras", 598324, 4095110],
  ["Garrucha", 604992, 4116428],
  ["Vera", 605909, 4118751],
  ["Cabo de Gata", 572181, 4064283],
  ["Las Negras", 584042, 4081532],
  ["Villaricos", 608822, 4122979],
  ["San Miguel", 567987, 4071737]
];

// El interior solo interesa en la vista general. A partir de ahí el recorrido
// baja la costa en tramos cortos y muy cerrados, uno por parada.
const SECTORS: Array<{ name: string; anchors: string[] }> = [
  { name: "De Villaricos a Garrucha", anchors: ["Villaricos", "Vera", "Garrucha"] },
  { name: "Mojácar", anchors: ["Mojácar"] },
  { name: "Carboneras", anchors: ["Carboneras"] },
  { name: "Níjar · Las Negras", anchors: ["Las Negras"] },
  { name: "Cabo de Gata", anchors: ["Cabo de Gata", "San Miguel"] }
];
const STOPS = SECTORS.length + 1;
// El mar queda al sureste del recorte en coordenadas de escena.
const SEAWARD = new THREE.Vector3(1, 0, 1).normalize();

const SIZE_X = BOUNDS.east - BOUNDS.west;
const SIZE_Z = BOUNDS.north - BOUNDS.south;

const params = new URLSearchParams(window.location.search);
const number = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
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

const app = document.querySelector<HTMLElement>("#app")!;
// Mismo recurso que el recorrido municipal: un escenario alto con la escena
// pegajosa dentro, para que el scroll de la página mueva la cámara.
app.innerHTML = `
  <style>
    /* Un gesto de scroll, un keyframe. \`scroll-snap-stop: always\` es lo que
       impide que un impulso largo se salte paradas, igual que en /coast/. */
    html { scroll-behavior: smooth; scroll-snap-type: y mandatory; }
    html, body { margin: 0; overscroll-behavior-y: none; }
    @media (prefers-reduced-motion: reduce) { html { scroll-behavior: auto; } }
    .story-stop {
      position: absolute;
      left: 0;
      width: 1px;
      height: 1px;
      scroll-snap-align: start;
      scroll-snap-stop: always;
      pointer-events: none;
    }
  </style>
  <main style="margin:0;font:14px system-ui">
    <section id="stage" style="position:relative;height:${STOPS * 100}vh">
      <div id="scene" style="position:sticky;top:0;height:100vh;overflow:hidden"></div>
      ${Array.from({ length: STOPS }, (_, index) =>
        `<i class="story-stop" style="top:${index * 100}vh" aria-hidden="true"></i>`).join("")}
    </section>
    <div style="position:fixed;left:0;right:0;bottom:0;display:flex;flex-wrap:wrap;gap:.4rem 1.1rem;align-items:center;padding:.5rem 1rem;background:#17353a;color:#fff8e9;font-size:12px">
      <label>Fecha <input id="date" type="date" style="font:inherit"></label>
      <label>Hora <output id="clock"></output>
        <input id="time" type="range" min="0" max="1425" step="15"></label>
      <button id="now" type="button" style="font:inherit">Ahora</button>
      <span id="sun"></span>
      <label>Exageración <output id="exag-out"></output>
        <input id="exag" type="range" min="1" max="5" step="0.1"></label>
      <label><input id="wire" type="checkbox"> Malla</label>
      <span id="stats" style="opacity:.75"></span>
      <span id="viewpoint" style="margin-left:auto;opacity:.85"></span>
    </div>
  </main>`;

const container = document.querySelector<HTMLElement>("#scene")!;
// La rejilla la manda el asset, no una constante escrita a mano: así cambiar la
// resolución del MDT no obliga a tocar el cliente.
const demMetadata = await loadJson<{ width: number; height: number; webResolutionMeters: number }>(
  "/metadata/levante-dem.json"
);
const WIDTH = demMetadata.width;
const HEIGHT = demMetadata.height;
const RESOLUTION = demMetadata.webResolutionMeters;
const heights = await loadFloat32("/terrain/assets/levante-dem.f32");
if (heights.length !== WIDTH * HEIGHT) throw new Error(`DEM ${heights.length} != ${WIDTH * HEIGHT}`);

// El mar es la cota cero conectada con el borde del recorte. Sin `seaSide`: a
// esta escala la costa gira en el cabo y el mar rodea la maqueta por dos lados.
const sea = seaMask(heights);
const shoreDistance = distanceToLand(sea);
// Batimetría y praderas DERA rasterizadas a la misma rejilla: 5 bits de banda
// batimétrica y 3 de clase de fondo vegetado por celda.
const seaCover = new Uint8Array(await (await fetch("/terrain/assets/levante-sea.u8")).arrayBuffer());
const landCover = new Uint8Array(await (await fetch("/terrain/assets/levante-land.u8")).arrayBuffer());
const seaMetadata = await loadJson<{ depthBands: Record<string, string> }>("/metadata/levante-sea.json");
const bandDepths = bandMidpoints(seaMetadata.depthBands);
const waveNormals = await loadTexture("/terrain/textures/mediterranean-waves-normal.webp");
waveNormals.wrapS = THREE.RepeatWrapping;
waveNormals.wrapT = THREE.RepeatWrapping;
// A escala comarcal el relieve del oleaje no es medible: repite muy corto para
// que solo aporte grano al agua, igual que la textura de los chunks.
waveNormals.repeat.set(46, 55);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.append(renderer.domElement);

const sky = new THREE.Color("#f1e5db");
const scene = new THREE.Scene();
scene.background = sky;
const world = new THREE.Group();
world.scale.z = -1;
scene.add(world);

const distance = 150000;
const sceneSize = Math.max(SIZE_X, SIZE_Z);
scene.fog = new THREE.Fog(sky, distance * .86, distance + sceneSize * 1.35);
const camera = new THREE.OrthographicCamera(-SIZE_X * .56, SIZE_X * .56, SIZE_Z * .56, -SIZE_Z * .56, 1, 600000);
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
// litoral: la maqueta se extiende tierra adentro hacia el noroeste, así que
// centrarla en la costa la desplazaba hacia un lado. Al recortar el encuadre
// las esquinas se pierden de todos modos, que era lo que antes justificaba
// correrlo hacia el mar.
const focus = new THREE.Vector3();
camera.position.copy(cameraOffset).add(focus);
camera.lookAt(focus);
camera.updateMatrixWorld();
const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);

const hemisphere = new THREE.HemisphereLight("#fff1d5", "#62556d", 1.35);
const ambient = new THREE.AmbientLight("#637987", 0);
const fill = new THREE.DirectionalLight("#8ba6b8", 0);
fill.position.set(26000, 42000, 26000);
scene.add(hemisphere, ambient, fill);
const sunRadius = SUN_LIGHT_RADIUS * 14;
const sun = createSunLight(Math.hypot(SIZE_X, SIZE_Z), 2048, sunRadius);
scene.add(sun, sun.target);

const { mesh, maxElevation } = buildTerrain();
let exaggeration = number("exag", 2.5);
mesh.scale.y = exaggeration;
world.add(mesh);

// El zócalo es lo que convierte el recorte en maqueta: paredes estratificadas,
// fondo y sombra de contacto sobre el fondo del lienzo.
const base = createChunkBase(heights, {
  terrain: { width: WIDTH, height: HEIGHT, verticalExaggeration: exaggeration },
  projectedBounds: BOUNDS,
  chunk: { depthMeters: CHUNK_DEPTH },
  visualStyle: "mediterranean-illustrated"
} as unknown as BeachConfig);
if (params.get("base") !== "0") world.add(base.group);

const water = buildSea();
if (params.get("sea") !== "0") world.add(water);

const labels = ANCHORS.map(([name, x, y]) => anchorLabel(name, x, y));
for (const label of labels) world.add(label);

// Los rótulos son sprites en unidades de mundo: sin corregir, al acercarse a un
// sector taparían media comarca. Se redimensionan con el zoom para ocupar
// siempre lo mismo en pantalla.
const projected = new THREE.Vector3();
function placeLabels() {
  const worldWidth = (camera.right - camera.left) / camera.zoom;
  const worldHeight = (camera.top - camera.bottom) / camera.zoom;
  const ndcHeight = 2 * LABEL_HEIGHT / worldHeight;
  world.updateMatrixWorld();
  // En el Levante los pueblos están a dos y tres kilómetros y al alejarse las
  // cajas se pisan. Se descartan por solape real, y gana el primero de la lista.
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
  ...SECTORS.map((sector) => ({
    name: sector.name,
    // Los sectores de los extremos caen sobre las esquinas del recorte, así que
    // se sesgan un poco hacia el centro; y todos se corren hacia el mar, que es
    // lo que cambia sierra por costa sin tener que girar la cámara.
    target: sectorTarget(sector.anchors).lerp(focus, .08)
      .addScaledVector(SEAWARD, number("seaward", 1500)),
    zoom: number("sectorZoom", 4.6)
  }))
];

const stage = document.querySelector<HTMLElement>("#stage")!;
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
  const travel = Math.max(1, stage.offsetHeight - window.innerHeight);
  return THREE.MathUtils.clamp((window.scrollY - stage.offsetTop) / travel, 0, 1);
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
  `${WIDTH}×${HEIGHT} = ${(WIDTH * HEIGHT / 1000).toFixed(0)}k vértices · ${(heights.byteLength / 1e6).toFixed(2)} MB · cota máx ${maxElevation.toFixed(0)} m · ${RESOLUTION} m/celda · rumbo ${BEARING}°`;

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
  showExaggeration();
  resize();
});
document.querySelector<HTMLInputElement>("#wire")!.addEventListener("change", (event) => {
  (mesh.material as THREE.MeshToonMaterial).wireframe = (event.target as HTMLInputElement).checked;
  draw();
});

function resize() {
  const width = container.clientWidth;
  const height = container.clientHeight;
  const aspect = width / Math.max(1, height);
  let halfWidth = 0;
  let halfHeight = 0;
  for (const x of [-SIZE_X / 2, SIZE_X / 2]) {
    for (const y of [-CHUNK_DEPTH, maxElevation * exaggeration]) {
      for (const z of [-SIZE_Z / 2, SIZE_Z / 2]) {
        // Relativas al objetivo: la cámara ya no mira al centro del bloque.
        const corner = new THREE.Vector3(x - focus.x, y, z - focus.z);
        halfWidth = Math.max(halfWidth, Math.abs(corner.dot(cameraRight)));
        halfHeight = Math.max(halfHeight, Math.abs(corner.dot(cameraUp)));
      }
    }
  }
  // El frustum encaja el bloque justo a zoom 1, sin margen: el aire alrededor
  // lo daba un 8 % que solo servía para alejar la maqueta. El acercamiento lo
  // hace `camera.zoom`, que la cámara ortográfica ya aplica al proyectar.
  const viewHeight = Math.max(halfHeight * 2, halfWidth * 2 / Math.max(.1, aspect));
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  // El descarte de rótulos depende del frustum, que aquí acaba de cambiar.
  placeLabels();
  draw();
}
// Cielo, luces y exposición gobernados por la altura real del Sol, con la misma
// gradación que `createScene`: es lo que da a los overviews su hora del día.
function applySolarAppearance(dateISO: string, minutes: number) {
  const solar = getSolarPosition(dateISO, minutes, CENTRE.lat, CENTRE.lon);
  updateSunLight(sun, sunVectorForWorldAxes(solar.vector, "south-positive"), solar.aboveHorizon, true, sunRadius);
  const daylight = solar.aboveHorizon ? THREE.MathUtils.smoothstep(solar.altitudeDegrees, -2, 28) : 0;
  const horizonWarmth = solar.aboveHorizon ? 1 - THREE.MathUtils.smoothstep(solar.altitudeDegrees, 4, 24) : 0;
  const background = new THREE.Color("#183440")
    .lerp(new THREE.Color("#d69578"), Math.max(horizonWarmth, daylight * .35))
    .lerp(new THREE.Color("#f1e5db"), daylight);
  scene.background = background;
  if (scene.fog) scene.fog.color.copy(background);
  hemisphere.color.copy(new THREE.Color("#6f91a0").lerp(new THREE.Color("#fff2d8"), daylight));
  hemisphere.groundColor.copy(new THREE.Color("#302b42").lerp(new THREE.Color("#6b5a68"), daylight));
  hemisphere.intensity = .58 + daylight * .55;
  ambient.color.copy(new THREE.Color("#526b7b").lerp(new THREE.Color("#ffe3c0"), daylight));
  ambient.intensity = .32 + horizonWarmth * .42 + daylight * .12;
  fill.color.copy(new THREE.Color("#66859b").lerp(new THREE.Color("#ffe0bc"), daylight));
  fill.intensity = .55 + horizonWarmth * 1.25 + daylight * .1;
  sun.color.copy(new THREE.Color("#ff9b67").lerp(new THREE.Color("#fff5d8"), 1 - horizonWarmth));
  sun.intensity = solar.aboveHorizon ? 2.25 + daylight * .6 : 0;
  renderer.toneMappingExposure = .82 + daylight * .18;
  // El cielo tiñe también el lienzo y la barra del navegador, como en /coast/.
  const skyColour = background.getStyle();
  container.style.backgroundColor = skyColour;
  document.body.style.backgroundColor = skyColour;
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

window.addEventListener("resize", () => {
  resize();
  requestStoryUpdate();
});
resize();
// Nada se anima por sí solo en esta escena: se dibuja cuando algo cambia, no en
// bucle a 60 fps. Además de ahorrar batería, es lo que permite capturarla.
function draw() {
  renderer.render(scene, camera);
}
draw();

function buildTerrain() {
  const geometry = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, WIDTH - 1, HEIGHT - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const sand = new THREE.Color("#e7ad55");
  const sandLight = new THREE.Color("#f4cf72");
  const earth = new THREE.Color("#a69661");
  const rock = new THREE.Color("#666b70");
  const colour = new THREE.Color();
  const landColour = new THREE.Color();
  let maxElevation = 0;
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const index = row * WIDTH + col;
      const sourceRow = HEIGHT - 1 - row;
      const source = sourceRow * WIDTH + col;
      const offshore = sea[source] === 1;
      // Sin `coastMask` en el agua, cualquier celda de tierra que el MDT deja a
      // cota cero —ramblas, salinas, llanos litorales— queda bajo la lámina y se
      // lee como mar. El suelo mínimo la mantiene por encima, igual que el rim
      // del zócalo.
      const elevation = offshore ? -6 : Math.max(SEA_LEVEL + .35, heights[source]);
      maxElevation = Math.max(maxElevation, elevation);
      positions.setY(index, elevation);
      const left = heights[sourceRow * WIDTH + Math.max(0, col - 1)];
      const right = heights[sourceRow * WIDTH + Math.min(WIDTH - 1, col + 1)];
      const north = heights[Math.max(0, sourceRow - 1) * WIDTH + col];
      const south = heights[Math.min(HEIGHT - 1, sourceRow + 1) * WIDTH + col];
      const slope = Math.hypot(right - left, south - north) / 200;
      // El grano mineral de las playas está calibrado en índices de celda: a 4 m
      // es textura, a 100 m son franjas de 2 km cruzando la comarca. Aquí va a
      // frecuencia alta y amplitud corta, solo para romper el plano.
      const noise = (Math.sin(col * 1.9 + row * 1.1) + Math.sin(col * .53 - row * .81) * .7) * .5 + .5;
      // Rampa hipsométrica: la fórmula por playa normaliza con `maxElevation` y
      // con 1.573 m dejaría toda la comarca en arena. Los tramos son llanura
      // litoral, secano y sierra, para que el gris de roca aparezca donde el
      // overview municipal lo pone.
      if (elevation <= 20) {
        colour.copy(sand).lerp(sandLight, .45 + noise * .16);
      } else if (elevation <= 140) {
        colour.copy(sand).lerp(earth, (elevation - 20) / 120);
      } else {
        const heightMix = Math.min(1, (elevation - 140) / 700);
        colour.copy(earth).lerp(rock, Math.min(1, slope * 1.4 + heightMix * .92));
      }
      // El uso del suelo pone el tono y la hipsometría sigue poniendo la luz:
      // mezclada, no sustituida, la ladera y la cumbre se siguen leyendo.
      const cover = landCover[source];
      if (cover) {
        landColour.set(LAND_COLOURS[cover]);
        // Por encima de la media montaña manda la hipsometría: CORINE clasifica
        // como matorral hasta las cumbres y a esa altura el gris de roca es lo
        // que sostiene la lectura del relieve. El cauce se salva de esa regla:
        // es una forma del terreno, no una cobertura, y en la sierra es justo
        // donde el drenaje explica el relieve.
        const coverMix = cover === 9
          ? .8
          : .72 * (1 - THREE.MathUtils.smoothstep(elevation, 700, 1300));
        colour.lerp(landColour, coverMix);
      }
      // El overview municipal gana su contraste oscureciendo las laderas; a
      // 100 m la pendiente ya viene suavizada por el remuestreo, así que se
      // refuerza aquí en vez de dejar la comarca en un ocre plano.
      colour.offsetHSL(0, .03, (noise - .5) * .03 - Math.min(.08, slope * .3));
      colors[index * 3] = colour.r;
      colors[index * 3 + 1] = colour.g;
      colors[index * 3 + 2] = colour.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const terrain = new THREE.Mesh(geometry, toonMaterial({ vertexColors: true }));
  terrain.castShadow = true;
  terrain.receiveShadow = true;
  return { mesh: terrain, maxElevation };
}

function buildSea(): THREE.Mesh {
  // Recortada exactamente al bloque, como en los overviews: el agua es parte de
  // la maqueta, no un plano infinito bajo ella.
  const geometry = new THREE.PlaneGeometry(SIZE_X, SIZE_Z, WIDTH - 1, HEIGHT - 1);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const foam = new THREE.Color("#e4f3ec");
  const colour = new THREE.Color();
  const flora = new THREE.Color();
  for (let row = 0; row < HEIGHT; row++) {
    for (let col = 0; col < WIDTH; col++) {
      const index = row * WIDTH + col;
      const source = (HEIGHT - 1 - row) * WIDTH + col;
      // Ocho celdas de orilla, unos 800 m: la banda clara que en los chunks de
      // playa sale del `shoreDistance` del sombreador del agua.
      // Recortada a la máscara: una lámina plana que cubre todo el pie del
      // bloque asoma por debajo del relieve en los bordes cercanos, tanto más
      // cuanto más levanta la sierra. Los chunks de playa lo evitan con el
      // `coastMask` del sombreador; aquí se hunde el vértice de tierra.
      if (sea[source] !== 1) positions.setY(index, -CHUNK_DEPTH);
      // El color del agua lo pone la batimetría oficial, no la distancia a la
      // orilla: es lo que separa la plataforma ancha del Levante del desplome
      // de Cabo de Gata, donde la isóbata de 1.000 m se pega a la costa.
      const packed = seaCover[source];
      depthColour(bandDepths[packed & 31] ?? 0, colour);
      const floraClass = packed >> 5;
      if (floraClass) {
        // Praderas de fanerógamas y alga roja de fondo rocoso: hábitats
        // cartografiados, no una lectura del estado del agua.
        flora.set(FLORA_COLOURS[floraClass] ?? "#1c7a5e");
        // Las praderas caen en los tres primeros tramos batimétricos, donde el
        // agua ya es turquesa clara: con una mezcla suave se perdían.
        colour.lerp(flora, .85);
      }
      // La rompiente sigue siendo la orilla, no la profundidad.
      if (shoreDistance[source] <= 1) colour.copy(foam);
      colors[index * 3] = colour.r;
      colors[index * 3 + 1] = colour.g;
      colors[index * 3 + 2] = colour.b;
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    normalMap: waveNormals,
    normalScale: new THREE.Vector2(.35, .35),
    roughness: .68,
    metalness: 0,
    clearcoat: .08,
    clearcoatRoughness: .72
  }));
  mesh.position.y = SEA_LEVEL;
  mesh.receiveShadow = true;
  return mesh;
}


function depthColour(metres: number, target: THREE.Color): THREE.Color {
  if (metres <= DEPTH_STOPS[0][0]) return target.copy(depthStopColours[0]);
  for (let index = 1; index < DEPTH_STOPS.length; index++) {
    const [depth] = DEPTH_STOPS[index];
    if (metres > depth) continue;
    const [previous] = DEPTH_STOPS[index - 1];
    const from = Math.log10(Math.max(1, previous));
    const to = Math.log10(depth);
    const t = to === from ? 1 : (Math.log10(Math.max(1, metres)) - from) / (to - from);
    return target.copy(depthStopColours[index - 1]).lerp(depthStopColours[index], t);
  }
  return target.copy(depthStopColours[depthStopColours.length - 1]);
}

function bandMidpoints(bands: Record<string, string>): number[] {
  const midpoints: number[] = [];
  for (const [band, interval] of Object.entries(bands)) {
    const [from, to] = interval.split("-").map(Number);
    midpoints[Number(band)] = (from + to) / 2;
  }
  return midpoints;
}

function easeInOut(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function sectorTarget(names: string[]): THREE.Vector3 {
  const centreX = (BOUNDS.west + BOUNDS.east) / 2;
  const centreY = (BOUNDS.south + BOUNDS.north) / 2;
  const target = new THREE.Vector3();
  for (const name of names) {
    const anchor = ANCHORS.find(([anchorName]) => anchorName === name);
    if (!anchor) throw new Error(`Sector sin ancla: ${name}`);
    // El mundo invierte Z, así que el objetivo va en coordenadas de escena.
    target.add(new THREE.Vector3(anchor[1] - centreX, 0, centreY - anchor[2]));
  }
  return target.multiplyScalar(1 / names.length);
}

function anchorLabel(name: string, utmX: number, utmY: number): THREE.Sprite {
  // El lienzo se ajusta al texto en vez de ser fijo: con un tamaño fijo el
  // rótulo era casi todo relleno y la letra se quedaba en unos pocos píxeles.
  const font = "600 96px system-ui, sans-serif";
  const measure = document.createElement("canvas").getContext("2d")!;
  measure.font = font;
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(measure.measureText(name).width) + 96;
  canvas.height = 176;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(23, 53, 58, .9)";
  context.beginPath();
  context.roundRect(0, 0, canvas.width, canvas.height, 40);
  context.fill();
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff8e9";
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 4);
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
  return sprite;
}

function seaMask(source: Float32Array): Uint8Array {
  const mask = new Uint8Array(source.length);
  const queue: number[] = [];
  const push = (index: number) => {
    if (!mask[index] && source[index] <= .05) {
      mask[index] = 1;
      queue.push(index);
    }
  };
  for (let col = 0; col < WIDTH; col++) {
    push(col);
    push((HEIGHT - 1) * WIDTH + col);
  }
  for (let row = 0; row < HEIGHT; row++) {
    push(row * WIDTH);
    push(row * WIDTH + WIDTH - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / WIDTH);
    const col = index % WIDTH;
    if (col > 0) push(index - 1);
    if (col < WIDTH - 1) push(index + 1);
    if (row > 0) push(index - WIDTH);
    if (row < HEIGHT - 1) push(index + WIDTH);
  }
  return mask;
}

function distanceToLand(mask: Uint8Array): Uint16Array {
  const distances = new Uint16Array(mask.length).fill(0xffff);
  const queue: number[] = [];
  for (let index = 0; index < mask.length; index++) {
    if (!mask[index]) {
      distances[index] = 0;
      queue.push(index);
    }
  }
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const index = queue[cursor];
    const row = Math.floor(index / WIDTH);
    const col = index % WIDTH;
    const next = distances[index] + 1;
    const visit = (neighbour: number) => {
      if (distances[neighbour] > next) {
        distances[neighbour] = next;
        queue.push(neighbour);
      }
    };
    if (col > 0) visit(index - 1);
    if (col < WIDTH - 1) visit(index + 1);
    if (row > 0) visit(index - WIDTH);
    if (row < HEIGHT - 1) visit(index + WIDTH);
  }
  return distances;
}
