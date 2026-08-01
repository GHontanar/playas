// Spike P0 del nivel regional. Página desechable: no entra en el build ni en el
// catálogo. Responde si el relieve del Levante y Cabo de Gata lee como maqueta a
// 100 m, sin la maquinaria costera dependiente de `seaSide`.
import * as THREE from "three";
import type { BeachConfig } from "./beaches/types";
import { loadFloat32, loadJson, loadTexture } from "./map/assets";
import { createChunkBase } from "./map/chunkBase";
import { SUN_LIGHT_RADIUS, createSunLight, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { toonMaterial } from "./styles/toonMaterial";

const BOUNDS = { west: 557600, south: 4060000, east: 612000, north: 4125000 };
const WIDTH = 544;
const HEIGHT = 650;
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
  8: "#d98c74"   // urbano e industrial
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

const SIZE_X = BOUNDS.east - BOUNDS.west;
const SIZE_Z = BOUNDS.north - BOUNDS.south;

const params = new URLSearchParams(window.location.search);
const number = (key: string, fallback: number) => Number(params.get(key) ?? fallback);
// Mismo rumbo y elevación que los overviews municipales, para que los tres
// niveles se lean como la misma maqueta vista desde el mismo sitio.
const BEARING = number("bearing", 45);
const PITCH = number("pitch", 32);

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <main style="margin:0;height:100vh;display:flex;flex-direction:column;font:14px system-ui">
    <div id="scene" style="flex:1;min-height:0"></div>
    <div style="display:flex;gap:1.5rem;align-items:center;padding:.6rem 1rem;background:#17353a;color:#fff8e9">
      <label>Exageración <output id="exag-out"></output>
        <input id="exag" type="range" min="1" max="5" step="0.1"></label>
      <label><input id="wire" type="checkbox"> Malla</label>
      <span id="stats"></span>
    </div>
  </main>`;

const container = document.querySelector<HTMLElement>("#scene")!;
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
camera.position.set(
  Math.sin(bearing) * Math.cos(pitch) * distance,
  Math.sin(pitch) * distance,
  Math.cos(bearing) * Math.cos(pitch) * distance
);
// Un rectángulo que contenga Villaricos y el cabo arrastra por fuerza una
// esquina de mar abierto al sureste y otra de sierra sin costa al noroeste.
// Encuadrar sobre el centro de la costa, y no sobre el centro del bloque,
// recupera para el litoral el espacio que el centro geométrico regala al agua.
const focus = coastCentre();
camera.position.add(focus);
camera.lookAt(focus);
camera.zoom = number("zoom", 1.02);
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

// Anclas reales para comprobar orientación y encuadre sin adivinar.
const ANCHORS: Array<[string, number, number]> = [
  ["Villaricos", 608822, 4122979],
  ["Garrucha", 604992, 4116428],
  ["Mojácar", 602204, 4105475],
  ["Carboneras", 598324, 4095110],
  ["Las Negras", 584042, 4081532],
  ["Cabo de Gata", 572181, 4064283],
  ["San Miguel", 567987, 4071737]
];
for (const [name, x, y] of ANCHORS) world.add(anchorLabel(name, x, y));

document.querySelector<HTMLElement>("#stats")!.textContent =
  `${WIDTH}×${HEIGHT} = ${(WIDTH * HEIGHT / 1000).toFixed(0)}k vértices · ${(heights.byteLength / 1e6).toFixed(2)} MB · cota máx ${maxElevation.toFixed(0)} m · 100 m/celda · rumbo ${BEARING}°`;

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
  const viewHeight = Math.max(halfHeight * 2, halfWidth * 2 / Math.max(.1, aspect)) * 1.08 / camera.zoom;
  camera.left = -viewHeight * aspect / 2;
  camera.right = viewHeight * aspect / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}
// Cielo, luces y exposición gobernados por la altura real del Sol, con la misma
// gradación que `createScene`: es lo que da a los overviews su hora del día.
function applySolarAppearance() {
  const now = nowInMojacar();
  const solar = getSolarPosition(now.dateISO, number("minutes", now.minutes), CENTRE.lat, CENTRE.lon);
  updateSunLight(sun, sunVectorForWorldAxes(solar.vector, "south-positive"), solar.aboveHorizon, true, sunRadius);
  const daylight = solar.aboveHorizon ? THREE.MathUtils.smoothstep(solar.altitudeDegrees, -2, 28) : 0;
  const horizonWarmth = solar.aboveHorizon ? 1 - THREE.MathUtils.smoothstep(solar.altitudeDegrees, 4, 24) : 0;
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
  sun.color.copy(new THREE.Color("#ff9b67").lerp(new THREE.Color("#fff5d8"), 1 - horizonWarmth));
  sun.intensity = solar.aboveHorizon ? 2.25 + daylight * .6 : 0;
  renderer.toneMappingExposure = .82 + daylight * .18;
}
applySolarAppearance();

window.addEventListener("resize", resize);
resize();
renderer.setAnimationLoop(() => renderer.render(scene, camera));

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
        // que sostiene la lectura del relieve.
        colour.lerp(landColour, .72 * (1 - THREE.MathUtils.smoothstep(elevation, 700, 1300)));
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

function coastCentre(): THREE.Vector3 {
  let sumX = 0;
  let sumZ = 0;
  let count = 0;
  for (let index = 0; index < shoreDistance.length; index++) {
    if (shoreDistance[index] !== 1) continue;
    sumX += index % WIDTH;
    sumZ += Math.floor(index / WIDTH);
    count++;
  }
  if (!count) return new THREE.Vector3();
  // El world invierte Z, así que el objetivo va en coordenadas de escena.
  return new THREE.Vector3(
    (sumX / count) / (WIDTH - 1) * SIZE_X - SIZE_X / 2,
    0,
    (sumZ / count) / (HEIGHT - 1) * SIZE_Z - SIZE_Z / 2
  );
}

function anchorLabel(name: string, utmX: number, utmY: number): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 160;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "rgba(23, 53, 58, .88)";
  context.beginPath();
  context.roundRect(8, 8, 752, 144, 36);
  context.fill();
  context.font = "600 54px system-ui, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = "#fff8e9";
  context.fillText(name, 384, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  const col = Math.round((utmX - BOUNDS.west) / 100);
  const row = Math.round((BOUNDS.north - utmY) / 100);
  const elevation = heights[row * WIDTH + col] ?? 0;
  sprite.position.set(
    utmX - (BOUNDS.west + BOUNDS.east) / 2,
    elevation * exaggeration + 900,
    utmY - (BOUNDS.south + BOUNDS.north) / 2
  );
  const width = SIZE_Z * .075;
  sprite.scale.set(width, width * 160 / 768, 1);
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
