// Índice: la elección de comarca. Las miniaturas no son capturas, son el mismo
// bloque comarcal con la rejilla diezmada ocho veces por `prepare-region-
// thumbnails.ts`, montado con el mismo escenario, el mismo zócalo y el Sol de
// ahora. Cuesta unos 90 KB por comarca y garantiza que lo que se elige es lo
// que se abre.
import "./styles/landing.css";
import { createChunkBase } from "./map/chunkBase";
import { createStage } from "./map/createStage";
import { buildRegionSea, buildRegionTerrain, loadRegionGrid, REGION_CHUNK_DEPTH } from "./map/regionChunk";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { regionHref, regions, type RegionCatalog } from "./regions/catalog";
import type { BeachConfig } from "./beaches/types";

const THUMBNAIL_EXAGGERATION = 2.5;

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <main class="landing">
    <h1 class="landing-title">Costas</h1>
    <ul class="region-grid">
      ${regions.map(regionCard).join("")}
    </ul>
    <footer class="landing-footer">MDT02 del IGN · DERA · IHM · Catastro · OpenStreetMap</footer>
  </main>`;

// La tarjeta es la maqueta y su nombre. Cuántas costas y cuántas playas trae ya
// lo cuenta el nivel comarcal, que está a un clic.
function regionCard(region: RegionCatalog): string {
  return `
    <li class="region-card">
      <a class="region-card-link" href="${regionHref(region)}">
        <div class="region-thumb" data-region="${region.id}" data-note="…" role="img"
          aria-label="Maqueta topográfica de ${region.name} en miniatura"></div>
        <h2>${region.name}<small>${region.subtitle}</small></h2>
      </a>
    </li>`;
}

const thumbnails = [...document.querySelectorAll<HTMLElement>(".region-thumb")];
if (!window.WebGLRenderingContext) {
  for (const element of thumbnails) element.dataset.note = "Este dispositivo no ofrece WebGL.";
} else {
  // En serie y solo cuando la tarjeta se acerca a pantalla: cada miniatura pide
  // su rejilla, construye dos mallas y abre su propio contexto WebGL, y hacerlo
  // a la vez para todas las comarcas alarga la primera de ellas sin necesidad.
  const pending = new Set(thumbnails);
  let queue: Promise<void> = Promise.resolve();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target as HTMLElement;
      if (!pending.delete(element)) continue;
      observer.unobserve(element);
      queue = queue.then(() => renderThumbnail(element).catch((error: unknown) => {
        element.dataset.note = error instanceof Error ? error.message : "No se pudo montar la maqueta.";
      }));
    }
  }, { rootMargin: "200px" });
  for (const element of thumbnails) observer.observe(element);
}

async function renderThumbnail(element: HTMLElement) {
  const region = regions.find((candidate) => candidate.id === element.dataset.region);
  if (!region) throw new Error("Comarca desconocida.");
  const grid = await loadRegionGrid(region, "thumbnail");
  const { mesh, maxElevation } = buildRegionTerrain(region, grid);

  const stage = createStage(element, {
    bounds: region.bounds,
    // Mismo rumbo y elevación que los tres niveles: la miniatura tiene que ser
    // reconocible como la vista que abre.
    camera: { bearing: 45, pitch: 32, roll: 0, distance: 150000 },
    worldAxes: "south-positive",
    visualStyle: "mediterranean-illustrated",
    vertical: { maxElevation, depthMeters: REGION_CHUNK_DEPTH, exaggeration: THUMBNAIL_EXAGGERATION },
    shadowSceneSize: Math.hypot(
      region.bounds.east - region.bounds.west,
      region.bounds.north - region.bounds.south
    ),
    // A diferencia de la vista comarcal, aquí el bloque entero tiene que caber:
    // la miniatura es la que enseña la forma de la comarca.
    margin: 1.04,
    shadowMapSize: 1024,
    sunLightRadius: SUN_LIGHT_RADIUS * 14,
    cameraFar: 600000
  });
  mesh.scale.y = THUMBNAIL_EXAGGERATION;
  stage.world.add(mesh);
  stage.world.add(createChunkBase(grid.heights, {
    terrain: { width: grid.width, height: grid.height, verticalExaggeration: THUMBNAIL_EXAGGERATION },
    projectedBounds: region.bounds,
    chunk: { depthMeters: REGION_CHUNK_DEPTH },
    visualStyle: "mediterranean-illustrated"
  } as unknown as BeachConfig).group);
  // Sin normal map: a este tamaño el grano del agua no se ve y son 59 KB que la
  // portada no tiene por qué pedir.
  stage.world.add(buildRegionSea(region, grid));

  const now = nowInMojacar();
  const solar = getSolarPosition(now.dateISO, now.minutes, region.centre.lat, region.centre.lon);
  updateSunLight(
    stage.light,
    sunVectorForWorldAxes(solar.vector, "south-positive"),
    solar.aboveHorizon,
    true,
    SUN_LIGHT_RADIUS * 14
  );
  stage.setSolarAppearance(solar.altitudeDegrees, solar.aboveHorizon);

  // Nada se anima: se dibuja una vez y se redibuja solo si cambia el tamaño.
  stage.resize();
  stage.draw();
  delete element.dataset.note;
  window.addEventListener("resize", () => {
    stage.resize();
    stage.draw();
  });
}
