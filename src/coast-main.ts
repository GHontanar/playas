import * as THREE from "three";
import "./styles/coast.css";
import { getMunicipality } from "./beaches/catalog";
import { createScene } from "./map/createScene";
import { createBeachZones } from "./map/beachZones";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { loadObservedStatus, refreshStatusAfterHourChange } from "./status/loadStatus";
import { forecastKey, loadBeachForecast, seaStateForWaveHeight } from "./forecast/openMeteo";
import { loadingMessage } from "./loading/loadingMessage";
import { breadcrumbHtml, municipalityChipsHtml, municipalityCrumbs } from "./nav/breadcrumb";
import { regionOfMunicipality } from "./regions/coasts";
import { applySceneSky } from "./styles/ink";
import { createScrollStory } from "./story/scrollStory";

const app = document.querySelector<HTMLElement>("#app")!;
const municipality = getMunicipality(new URLSearchParams(window.location.search).get("municipality"));
const region = regionOfMunicipality(municipality);
const coastOverview = municipality.overview;
document.title = `Costa de ${municipality.name} · Estado de las playas`;
app.innerHTML = `
  <main class="coast-story">
    <section id="story-stage" class="story-stage" aria-label="Recorrido topográfico por las playas de ${municipality.name}">
      <div id="overview-scene" class="overview-scene">
        <div class="scene-heading">
          ${breadcrumbHtml(municipalityCrumbs(municipality))}
          <h1 class="scene-title">${municipality.name}<small>${municipality.region}</small></h1>
        </div>
        <div id="loading" class="loading">${loadingMessage()}</div>
        <div id="overview-error" class="scene-error" hidden></div>
      </div>
      <i id="viewpoint-general" class="story-stop story-stop--general" aria-hidden="true"></i>
      <i id="viewpoint-north" class="story-stop story-stop--north" aria-hidden="true"></i>
      <i id="viewpoint-centre" class="story-stop story-stop--centre" aria-hidden="true"></i>
      <i id="viewpoint-south" class="story-stop story-stop--south" aria-hidden="true"></i>
    </section>
    ${municipalityChipsHtml(region, municipality.id)}
  </main>`;

const container = document.querySelector<HTMLElement>("#overview-scene")!;
const errorElement = document.querySelector<HTMLElement>("#overview-error")!;

if (!window.WebGLRenderingContext) {
  showError("Este dispositivo no ofrece WebGL, necesario para mostrar la maqueta.");
} else {
  initialise().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : "No se pudo preparar la costa.");
  });
}

async function initialise() {
  performance.mark("coast-initialise");
  const controller = await createScene(container, coastOverview, {
    onFirstFrame: () => {
      performance.mark("coast-first-frame");
      performance.measure("coast-time-to-model", "coast-initialise", "coast-first-frame");
      document.querySelector("#loading")?.remove();
    }
  });
  performance.mark("coast-scene-complete");
  performance.measure("coast-time-to-complete-scene", "coast-initialise", "coast-scene-complete");
  controller.setSeaConditions({ state: "calm", source: "fallback" });
  const zones = await createBeachZones(coastOverview, controller.terrain.heights, municipality.beaches);
  controller.world.add(zones.group);
  controller.world.updateMatrixWorld(true);

  const now = nowInMojacar();
  void loadBeachForecast(coastOverview.center.lat, coastOverview.center.lon).then((forecast) => {
    const point = forecast.get(forecastKey(now.dateISO, now.minutes));
    const state = seaStateForWaveHeight(point?.waveHeight);
    if (state) controller.setSeaConditions({
      state,
      source: "marine-data",
      waveHeightMeters: point?.waveHeight ?? undefined,
      periodSeconds: point?.wavePeriod ?? undefined,
      directionDegrees: point?.waveDirection ?? undefined
    });
  });
  const solar = getSolarPosition(now.dateISO, now.minutes, coastOverview.center.lat, coastOverview.center.lon);
  updateSunLight(
    controller.light,
    sunVectorForWorldAxes(solar.vector, coastOverview.worldAxes),
    solar.aboveHorizon,
    true,
    SUN_LIGHT_RADIUS
  );
  controller.setSolarAppearance(solar.altitudeDegrees, solar.aboveHorizon);
  applySceneSky(container);
  controller.setSeaSun(solar.vector, solar.aboveHorizon);
  document.querySelector("#loading")?.remove();

  controller.renderer.domElement.style.touchAction = "pan-y";

  const cameraOffset = controller.camera.position.clone();
  const anchors = zones.meshes.map((mesh) => {
    const center = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
    center.y = 0;
    return center;
  });
  const stage = document.querySelector<HTMLElement>("#story-stage")!;
  const overviewZoom = 1;
  const detailZoom = window.innerWidth <= 760 ? 3.35 : 3.15;
  let hoverBeach: string | null = null;
  const averageAnchor = (indices: number[]) => indices
    .reduce((target, index) => target.add(anchors[index]), new THREE.Vector3())
    .multiplyScalar(1 / indices.length);
  const groups = splitIntoGroups(anchors.length, 3);
  const viewpoints = [
    { target: new THREE.Vector3(), zoom: overviewZoom },
    // Marina is the end beach of the chunk: bias the target northwards and
    // leave more breathing room than in the inner sectors.
    ...groups.map((indices, index) => ({
      target: averageAnchor(indices),
      zoom: detailZoom * (index === groups.length - 1 ? 1 : .88)
    }))
  ];

  const story = createScrollStory({
    scroller: stage,
    viewpoints,
    onFrame({ target, zoom, progress }) {
      // Los separadores solo aparecen al entrar en el recorrido; en la vista
      // general el chunk se lee de una pieza.
      zones.setSeparatorsVisible(progress > 0);
      controller.camera.position.copy(cameraOffset).add(target);
      controller.camera.zoom = zoom;
      controller.camera.updateProjectionMatrix();
      if (!hoverBeach) zones.setActive(null);
    }
  });
  window.addEventListener("resize", () => {
    controller.resize();
    story.refresh();
  });

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pick = (event: PointerEvent) => {
    const rect = controller.renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, controller.camera);
    return raycaster.intersectObjects(zones.meshes, false)[0]?.object.userData.beachId as string | undefined;
  };
  controller.renderer.domElement.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    hoverBeach = pick(event) ?? null;
    zones.setActive(hoverBeach);
  });
  controller.renderer.domElement.addEventListener("pointerleave", () => {
    hoverBeach = null;
    zones.setActive(null);
  });
  let pointerDown: { x: number; y: number } | null = null;
  controller.renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDown = { x: event.clientX, y: event.clientY };
  });
  controller.renderer.domElement.addEventListener("click", (event) => {
    if (pointerDown && Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y) > 8) return;
    const beachId = pick(event);
    if (beachId) openBeach(beachId);
  });

  const demo = new URLSearchParams(window.location.search).get("demo") === "1";
  const refreshStatus = async () => {
    try {
      zones.setStatuses(await loadObservedStatus(demo, municipality.id));
    } catch (error: unknown) {
      // Sin bandera observada las franjas se quedan con su material original, que
      // es lo correcto: no se infiere un color. Pero el motivo tiene que salir por
      // consola, porque el resultado visual de «no hay datos» y el de «el estado
      // no se pudo pedir» son idénticos.
      console.warn("Estado oficial no disponible; las franjas quedan sin color.", error);
      zones.setStatuses([]);
    }
  };
  await refreshStatus();
  refreshStatusAfterHourChange(refreshStatus);
}

function splitIntoGroups(length: number, count: number): number[][] {
  return Array.from({ length: Math.min(count, length) }, (_, group) => {
    const start = Math.floor(group * length / count);
    const end = Math.floor((group + 1) * length / count);
    return Array.from({ length: Math.max(1, end - start) }, (_, index) => Math.min(length - 1, start + index));
  });
}

function openBeach(beachId: string) {
  window.location.assign(`/terrain/?beach=${encodeURIComponent(beachId)}`);
}

function showError(message: string) {
  document.querySelector("#loading")?.remove();
  errorElement.hidden = false;
  errorElement.textContent = message;
}
