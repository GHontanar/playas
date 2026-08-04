import { mkdir, writeFile } from "node:fs/promises";

type Municipality = "garrucha" | "vera";
type Bounds = { west: number; south: number; east: number; north: number };
type Entry = readonly [string, string, Municipality, readonly number[], readonly number[]];

// Catálogo General de Playas de Andalucía, ETRS89 / UTM 30N.
const beaches: Entry[] = [
  ["garrucha-playa", "Playa de Garrucha", "garrucha", [604458, 4114608], [604597, 4115373]],
  ["garrucha-posito", "Pósito Garrucha", "garrucha", [604597, 4115373], [604656, 4115688]],
  ["garrucha-playazo", "Playazo Garrucha", "garrucha", [604979, 4116384], [605006, 4116482]],
  ["vera-marinas-bolaga", "Las Marinas-Bolaga", "vera", [605124.9, 4116433.7], [605488.8, 4117734.6]],
  ["vera-puerto-rey", "Puerto Rey", "vera", [605488.8, 4117734.6], [605787.4, 4119032]],
  ["vera-playazo", "El Playazo", "vera", [605787.4, 4119032], [606603.2, 4120891.3]],
  ["vera-cala-marques", "Cala Marqués", "vera", [606603.2, 4120891.3], [606692.4, 4121067.9]]
];

const attribution = [
  "Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es",
  "Línea de costa DERA (IECA), CC BY 4.0",
  "Edificios: Dirección General del Catastro",
  "Calles: © OpenStreetMap contributors, ODbL 1.0"
];

await mkdir("src/beaches", { recursive: true });
for (const [id, name, municipalityId, start, end] of beaches) {
  const west = Math.floor(Math.min(start[0], end[0]) - 350);
  const east = Math.ceil(Math.max(start[0], end[0]) + 260);
  const south = Math.floor(Math.min(start[1], end[1]) - (id.endsWith("playazo") && municipalityId === "garrucha" ? 260 : 140));
  const north = Math.ceil(Math.max(start[1], end[1]) + (id.endsWith("playazo") && municipalityId === "garrucha" ? 260 : 140));
  const inland = municipalityId === "garrucha" ? 2300 : 2800;
  const horizon = { west: west - inland, south: south - 600, east: east + 300, north: north + 600 };
  const center = unproject((start[0] + end[0]) / 2, (start[1] + end[1]) / 2);
  await writeFile(`src/beaches/${id}.json`, `${JSON.stringify(makeConfig(id, name, municipalityId, center, { west, south, east, north }, horizon, start, end, 4), null, 2)}\n`);
}

const overviews = [
  ["garrucha-coast", "Costa de Garrucha", "garrucha", { west: 603700, south: 4114350, east: 605300, north: 4116750 }, [604458, 4114608], [605006, 4116482], 4200],
  ["vera-coast", "Costa de Vera", "vera", { west: 604500, south: 4116150, east: 607000, north: 4121250 }, [605124.9, 4116433.7], [606692.4, 4121067.9], 7800]
] as const;
for (const [id, name, municipalityId, bounds, start, end, distance] of overviews) {
  const center = unproject((bounds.west + bounds.east) / 2, (bounds.south + bounds.north) / 2);
  const config = makeConfig(id, name, municipalityId, center, bounds, bounds, start, end, 20);
  config.camera.distance = distance;
  config.camera.pitch = 32;
  config.terrain.verticalExaggeration = 1.7;
  config.shadowTerrain.terrain.verticalExaggeration = 1.7;
  config.shadowTerrain.terrain.webResolutionMeters = 40;
  config.urbanDetail = "overview";
  config.seaLevelMeters = .15;
  await writeFile(`src/beaches/${id}.json`, `${JSON.stringify(config, null, 2)}\n`);
}

function makeConfig(id: string, name: string, municipalityId: Municipality, center: { lat: number; lon: number }, projectedBounds: Bounds, horizon: Bounds, start: readonly number[], end: readonly number[], resolution: number) {
  return {
    id, name, municipalityId, timezone: "Europe/Madrid", center,
    bounds: geographicBounds(projectedBounds), projectedBounds: { ...projectedBounds, crs: "EPSG:25830" },
    camera: { bearing: 45, pitch: 35.264, roll: 0, distance: Math.round(Math.max(projectedBounds.east - projectedBounds.west, projectedBounds.north - projectedBounds.south) * .9) },
    terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: resolution, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-dem.f32` },
    chunk: { depthMeters: 90 }, seaSide: "east", worldAxes: "south-positive", visualStyle: "mediterranean-illustrated", urbanDetail: "detailed", seaLevelMeters: 1.5,
    coastalStructures: municipalityId === "garrucha" ? garruchaStructures(id) : [], overviewZonePaddingMeters: id === "garrucha-playazo" ? 100 : 0, shoreline: { start: { x: start[0], z: start[1] }, end: { x: end[0], z: end[1] } },
    shadowTerrain: { bounds: geographicBounds(horizon), projectedBounds: { ...horizon, crs: "EPSG:25830" }, terrain: { verticalExaggeration: 1.5, sourceResolutionMeters: 2, webResolutionMeters: 15, width: 2, height: 2, minElevation: 0, maxElevation: 1, asset: `/terrain/assets/${id}-horizon.f32` } },
    coastlineAsset: `/terrain/assets/${id}-coastline.geojson`, buildingsAsset: `/terrain/assets/${id}-buildings.geojson`, roadsAsset: `/terrain/assets/${id}-roads.geojson`, attribution
  };
}

function unproject(x: number, y: number) {
  const a = 6378137, e = 0.0818191910428158, e1sq = e * e / (1 - e * e), k0 = .9996;
  const xx = x - 500000, m = y / k0;
  const mu = m / (a * (1 - e * e / 4 - 3 * e ** 4 / 64 - 5 * e ** 6 / 256));
  const e1 = (1 - Math.sqrt(1 - e * e)) / (1 + Math.sqrt(1 - e * e));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + 151 * e1 ** 3 / 96 * Math.sin(6 * mu);
  const n1 = a / Math.sqrt(1 - e * e * Math.sin(phi1) ** 2), t1 = Math.tan(phi1) ** 2, c1 = e1sq * Math.cos(phi1) ** 2;
  const r1 = a * (1 - e * e) / (1 - e * e * Math.sin(phi1) ** 2) ** 1.5, d = xx / (n1 * k0);
  const lat = phi1 - n1 * Math.tan(phi1) / r1 * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * e1sq) * d ** 4 / 24 + (61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * e1sq - 3 * c1 ** 2) * d ** 6 / 720);
  const lon = -3 * Math.PI / 180 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6 + (5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * e1sq + 24 * t1 ** 2) * d ** 5 / 120) / Math.cos(phi1);
  return { lat: round(lat * 180 / Math.PI), lon: round(lon * 180 / Math.PI) };
}
function geographicBounds(bounds: Bounds): Bounds { const sw = unproject(bounds.west, bounds.south), ne = unproject(bounds.east, bounds.north); return { west: sw.lon, south: sw.lat, east: ne.lon, north: ne.lat }; }
function round(value: number) { return Math.round(value * 1e6) / 1e6; }
function garruchaStructures(id: string) {
  return (id === "garrucha-coast" || id === "garrucha-playa"
    ? [10125300000252, 10125300001431]
    : [10125300001431]).map((featureId) => ({ featureId, kind: "breakwater" }));
}
