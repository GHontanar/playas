import { mkdir, writeFile } from "node:fs/promises";

// Inventario operativo trazado desde el Catálogo General de Playas de Andalucía
// (coordenadas ETRS89 / UTM 30N). Los márgenes son de encuadre, nunca costa.
const beaches = [
  ["carboneras-ancon", "El Ancón", [598824, 4095057], [598963.8, 4096339]],
  ["carboneras-barquicos-cocones", "Los Barquicos-Los Cocones", [598167.6, 4094567.9], [598674.5, 4094926.8]],
  ["carboneras-marinicas", "Las Marinicas", [597773.1, 4093237.7], [597982.1, 4094268.8]],
  ["carboneras-puntica", "La Puntica", [598679, 4094924], [598824, 4095051]],
  ["carboneras-los-muertos", "Los Muertos", [598167.3, 4089877], [598001, 4090677.9]],
  ["carboneras-algarrobico", "El Algarrobico", [599713, 4097895], [600024.6, 4099534.4]],
  ["carboneras-corral", "El Corral", [597957.6, 4091143.3], [598007, 4091389.7]]
] as const;

const attribution = [
  "Obra derivada de MDT02-cob2 2020 CC-BY 4.0 scne.es",
  "Línea de costa DERA (IECA), CC BY 4.0",
  "Edificios: Dirección General del Catastro",
  "Calles: © OpenStreetMap contributors, ODbL 1.0"
];

await mkdir("src/beaches", { recursive: true });
for (const [id, name, start, end] of beaches) {
  const west = Math.floor(Math.min(start[0], end[0]) - 350);
  const east = Math.ceil(Math.max(start[0], end[0]) + 260);
  const south = Math.floor(Math.min(start[1], end[1]) - 140);
  const north = Math.ceil(Math.max(start[1], end[1]) + 140);
  const horizon = { west: west - 2800, south: south - 600, east: east + 300, north: north + 600 };
  const center = unproject((start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
  const config = makeConfig(id, name, center, { west, south, east, north }, horizon, start, end, 4);
  await writeFile(`src/beaches/${id}.json`, `${JSON.stringify(config, null, 2)}\n`);
}

const coastBounds = { west: 596100, south: 4088050, east: 600350, north: 4099750 };
const coastCenter = unproject((coastBounds.west + coastBounds.east) / 2, (coastBounds.south + coastBounds.north) / 2);
const coast = makeConfig(
  "carboneras-coast", "Costa de Carboneras", coastCenter, coastBounds, coastBounds,
  [598050, 4089850], [599950, 4099550], 20
);
coast.camera.distance = 15500;
coast.camera.pitch = 32;
coast.terrain.verticalExaggeration = 1.7;
coast.shadowTerrain.terrain.verticalExaggeration = 1.7;
coast.shadowTerrain.terrain.webResolutionMeters = 40;
coast.urbanDetail = "overview";
coast.seaLevelMeters = .15;
await writeFile("src/beaches/carboneras-coast.json", `${JSON.stringify(coast, null, 2)}\n`);

function makeConfig(id: string, name: string, center: { lat: number; lon: number }, projectedBounds: Bounds, horizon: Bounds, start: readonly number[], end: readonly number[], resolution: number) {
  return {
    id, name, municipalityId: "carboneras", timezone: "Europe/Madrid",
    center,
    bounds: geographicBounds(projectedBounds),
    projectedBounds: { ...projectedBounds, crs: "EPSG:25830" },
    camera: { bearing: 45, pitch: 35.264, roll: 0, distance: Math.round(Math.max(projectedBounds.east - projectedBounds.west, projectedBounds.north - projectedBounds.south) * .9) },
    terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: resolution, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-dem.f32` },
    chunk: { depthMeters: 90 }, seaSide: "east", worldAxes: "south-positive", visualStyle: "mediterranean-illustrated", urbanDetail: "detailed", seaLevelMeters: 1.5,
    coastalStructures: [], shoreline: { start: { x: start[0], z: start[1] }, end: { x: end[0], z: end[1] } },
    shadowTerrain: {
      bounds: geographicBounds(horizon), projectedBounds: { ...horizon, crs: "EPSG:25830" },
      terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: 15, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-horizon.f32` }
    },
    coastlineAsset: `/terrain/assets/${id}-coastline.geojson`, buildingsAsset: `/terrain/assets/${id}-buildings.geojson`, roadsAsset: `/terrain/assets/${id}-roads.geojson`, attribution
  };
}

type Bounds = { west: number; south: number; east: number; north: number };
function unproject(x: number, y: number) {
  // Inversa UTM30/ETRS89 (GRS80; a esta precisión coincide con WGS84).
  const a = 6378137;
  const e = 0.0818191910428158;
  const e1sq = e * e / (1 - e * e);
  const k0 = .9996;
  const xx = x - 500000;
  const m = y / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + 151 * e1 ** 3 / 96 * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e * e * Math.sin(phi1) ** 2);
  const t1 = Math.tan(phi1) ** 2;
  const c1 = e1sq * Math.cos(phi1) ** 2;
  const r1 = a * (1 - e * e) / (1 - e * e * Math.sin(phi1) ** 2) ** 1.5;
  const d = xx / (n1 * k0);
  const lat = phi1 - n1 * Math.tan(phi1) / r1 * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * e1sq) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * e1sq - 3 * c1 ** 2) * d ** 6 / 720);
  const lon = (-3 * Math.PI / 180) + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * e1sq + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1);
  return { lat: round(lat * 180 / Math.PI), lon: round(lon * 180 / Math.PI) };
}
function geographicBounds(bounds: Bounds): Bounds {
  const sw = unproject(bounds.west, bounds.south);
  const ne = unproject(bounds.east, bounds.north);
  return { west: sw.lon, south: sw.lat, east: ne.lon, north: ne.lat };
}
function round(value: number) { return Math.round(value * 1e6) / 1e6; }
