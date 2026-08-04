import { mkdir, writeFile } from "node:fs/promises";

// Barreiros (Lugo), ETRS89 / UTM 29N (EPSG:25829). Centros y tramos costeros
// proceden del catálogo de praias de MeteoGalicia; la cota de la costa (z) se
// muestreó sobre la línea COALNE/PLEAMAR del Instituto Hidrográfico de la Marina.
type Entry = readonly [string, string, number, number, number, number, number, number];

const beaches: Entry[] = [
  // id, nombre, centerE, centerN, startX, startZ, endX, endZ
  ["barreiros-anguieira", "Playa de Anguieira", 641846, 4824903, 641300, 4825612, 641880, 4824867],
  ["barreiros-altar", "Playa de Altar", 641914, 4825205, 641880, 4824867, 642301, 4825218],
  ["barreiros-san-bartolo", "Playa de San Bartolo", 642688, 4825332, 642301, 4825218, 643008, 4825244],
  ["barreiros-remior", "Playa de Acantilado-Remior", 643328, 4825112, 643008, 4825244, 643750, 4825042],
  ["barreiros-pena-de-salsa", "Playa de Pena de Salsa", 644173, 4824986, 643750, 4825042, 644630, 4824902],
  ["barreiros-benquerencia", "Playa de Benquerencia", 645086, 4824795, 644630, 4824902, 645297, 4824769],
  ["barreiros-area-da-balea", "Playa de Area da Balea", 645508, 4824770, 645297, 4824769, 645811, 4824738],
  ["barreiros-longara", "Playa de Lóngara", 646115, 4824717, 645811, 4824738, 646430, 4824796],
  ["barreiros-a-pasada", "Playa de A Pasada", 646745, 4824731, 646430, 4824796, 647147, 4824957],
  ["barreiros-arealonga", "Playa de Arealonga", 647550, 4824137, 647147, 4824957, 647800, 4824065]
];

const attribution = [
  "Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es",
  "Línea de costa © Instituto Hidrográfico de la Marina",
  "Edificios: Dirección General del Catastro",
  "Calles: © OpenStreetMap contributors, ODbL 1.0"
];

await mkdir("src/beaches", { recursive: true });
for (const [id, name, , , startX, startZ, endX, endZ] of beaches) {
  const west = Math.floor(Math.min(startX, endX) - 350);
  const east = Math.ceil(Math.max(startX, endX) + 260);
  // Mar al norte (+z): tierra firme al sur (-z) y una franja de mar al norte.
  const south = Math.floor(Math.min(startZ, endZ) - 550);
  const north = Math.ceil(Math.max(startZ, endZ) + 350);
  const inland = 2600;
  const horizon = { west: west - 300, south: south - inland, east: east + 300, north: north + 600 };
  const center = unproject((startX + endX) / 2, (startZ + endZ) / 2);
  await writeFile(`src/beaches/${id}.json`, `${JSON.stringify(makeConfig(id, name, center, { west, south, east, north }, horizon, [startX, startZ], [endX, endZ], 4), null, 2)}\n`);
}

const overviewBounds = { west: 640400, south: 4822500, east: 649000, north: 4827000 };
const overview = makeConfig(
  "barreiros-coast",
  "Costa de Barreiros",
  unproject((overviewBounds.west + overviewBounds.east) / 2, (overviewBounds.south + overviewBounds.north) / 2),
  overviewBounds,
  overviewBounds,
  [641300, 4825612],
  [647800, 4824065],
  20
);
overview.camera.distance = 8200;
overview.camera.pitch = 32;
overview.terrain.verticalExaggeration = 1.7;
overview.shadowTerrain.terrain.verticalExaggeration = 1.7;
overview.shadowTerrain.terrain.webResolutionMeters = 40;
overview.urbanDetail = "overview";
overview.seaLevelMeters = .15;
await writeFile(`src/beaches/barreiros-coast.json`, `${JSON.stringify(overview, null, 2)}\n`);

function makeConfig(id: string, name: string, center: { lat: number; lon: number }, projectedBounds: Bounds, horizon: Bounds, start: readonly number[], end: readonly number[], resolution: number) {
  return {
    id, name, municipalityId: "barreiros", timezone: "Europe/Madrid", center,
    bounds: geographicBounds(projectedBounds), projectedBounds: { ...projectedBounds, crs: "EPSG:25829" },
    camera: { bearing: 45, pitch: 35.264, roll: 0, distance: Math.round(Math.max(projectedBounds.east - projectedBounds.west, projectedBounds.north - projectedBounds.south) * .9) },
    terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: resolution, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-dem.f32` },
    chunk: { depthMeters: 90 }, seaSide: "north", worldAxes: "south-positive", visualStyle: "mediterranean-illustrated", urbanDetail: "detailed", seaLevelMeters: 1.5,
    coastalStructures: [], overviewZonePaddingMeters: 0, useFloodMask: true,
    shoreline: { start: { x: start[0], z: start[1] }, end: { x: end[0], z: end[1] } },
    shadowTerrain: { bounds: geographicBounds(horizon), projectedBounds: { ...horizon, crs: "EPSG:25829" }, terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: 15, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-horizon.f32` } },
    coastlineAsset: `/terrain/assets/${id}-coastline.geojson`, buildingsAsset: `/terrain/assets/${id}-buildings.geojson`, roadsAsset: `/terrain/assets/${id}-roads.geojson`, attribution
  };
}

// UTM 29N (meridiano central −9°) → geográficas.
function unproject(x: number, y: number) {
  const a = 6378137, e = 0.0818191910428158, e1sq = e * e / (1 - e * e), k0 = .9996;
  const xx = x - 500000, m = y / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + 151 * e1 ** 3 / 96 * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e * e * Math.sin(phi1) ** 2), t1 = Math.tan(phi1) ** 2, c1 = e1sq * Math.cos(phi1) ** 2;
  const r1 = a * (1 - e * e) / (1 - e * e * Math.sin(phi1) ** 2) ** 1.5, d = xx / (n1 * k0);
  const lat = phi1 - n1 * Math.tan(phi1) / r1 * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * e1sq) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * e1sq - 3 * c1 ** 2) * d ** 6 / 720);
  const lon = -9 * Math.PI / 180 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * e1sq + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1);
  return { lat: round(lat * 180 / Math.PI), lon: round(lon * 180 / Math.PI) };
}
function geographicBounds(bounds: Bounds): Bounds { const sw = unproject(bounds.west, bounds.south), ne = unproject(bounds.east, bounds.north); return { west: sw.lon, south: sw.lat, east: ne.lon, north: ne.lat }; }
function round(value: number) { return Math.round(value * 1e6) / 1e6; }

type Bounds = { west: number; south: number; east: number; north: number };
