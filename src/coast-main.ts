import * as THREE from "three";
import "./styles/coast.css";
import { coastOverview } from "./beaches/catalog";
import { createScene } from "./map/createScene";
import { createBeachZones } from "./map/beachZones";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { loadObservedStatus, refreshStatusAfterHourChange } from "./status/loadStatus";
import { forecastKey, loadBeachForecast, seaStateForWaveHeight } from "./forecast/openMeteo";

const app = document.querySelector<HTMLElement>("#app")!;
app.innerHTML = `
  <main class="coast-story">
    <section id="story-stage" class="story-stage" aria-label="Recorrido topográfico por las playas de Mojácar">
      <div id="overview-scene" class="overview-scene">
        <div id="loading" class="loading">Preparando la costa completa…</div>
        <div id="overview-error" class="scene-error" hidden></div>
      </div>
      <i id="viewpoint-general" class="story-stop story-stop--general" aria-hidden="true"></i>
      <i id="viewpoint-north" class="story-stop story-stop--north" aria-hidden="true"></i>
      <i id="viewpoint-centre" class="story-stop story-stop--centre" aria-hidden="true"></i>
      <i id="viewpoint-south" class="story-stop story-stop--south" aria-hidden="true"></i>
    </section>
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
  const controller = await createScene(container, coastOverview);
  controller.setSeaConditions({ state: "calm", source: "fallback" });
  const zones = await createBeachZones(coastOverview, controller.terrain.heights);
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
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const overviewZoom = 1;
  const detailZoom = window.innerWidth <= 760 ? 3.35 : 3.15;
  let hoverBeach: string | null = null;
  const averageAnchor = (indices: number[]) => indices
    .reduce((target, index) => target.add(anchors[index]), new THREE.Vector3())
    .multiplyScalar(1 / indices.length);
  const viewpoints = [
    { target: new THREE.Vector3(), zoom: overviewZoom },
    // Marina is the end beach of the chunk: bias the target northwards and
    // leave more breathing room than in the inner sectors.
    { target: anchors[0].clone().lerp(anchors[1], .35), zoom: detailZoom * .88 },
    { target: averageAnchor([2, 3, 4]), zoom: detailZoom * .8 },
    { target: averageAnchor([5, 6]), zoom: detailZoom }
  ];

  const setCamera = (target: THREE.Vector3, zoom: number) => {
    controller.camera.position.copy(cameraOffset).add(target);
    controller.camera.zoom = zoom;
    controller.camera.updateProjectionMatrix();
  };

  const applyProgress = (progress: number) => {
    const position = progress * (viewpoints.length - 1);
    if (reducedMotion) {
      const viewpoint = viewpoints[Math.round(position)];
      setCamera(viewpoint.target, viewpoint.zoom);
      zones.setActive(null);
      return;
    }
    const from = Math.min(viewpoints.length - 1, Math.floor(position));
    const to = Math.min(viewpoints.length - 1, from + 1);
    const t = smoothstep(position - from);
    setCamera(
      viewpoints[from].target.clone().lerp(viewpoints[to].target, t),
      THREE.MathUtils.lerp(viewpoints[from].zoom, viewpoints[to].zoom, t)
    );
    if (!hoverBeach) zones.setActive(null);
  };

  const scrollProgress = () => {
    const distance = Math.max(1, stage.offsetHeight - window.innerHeight);
    return THREE.MathUtils.clamp((window.scrollY - stage.offsetTop) / distance, 0, 1);
  };
  const keyedProgress = () => Math.round(scrollProgress() * (viewpoints.length - 1)) / (viewpoints.length - 1);
  let currentProgress = keyedProgress();
  let targetProgress = currentProgress;
  let frame = 0;
  const animateToScroll = () => {
    const difference = targetProgress - currentProgress;
    currentProgress = Math.abs(difference) < .0001
      ? targetProgress
      : currentProgress + difference * .16;
    applyProgress(currentProgress);
    if (currentProgress !== targetProgress) frame = requestAnimationFrame(animateToScroll);
  };
  const requestStoryUpdate = () => {
    // Scroll chooses a camera keyframe; it does not scrub arbitrary zoom values.
    targetProgress = keyedProgress();
    cancelAnimationFrame(frame);
    if (reducedMotion) {
      currentProgress = targetProgress;
      applyProgress(currentProgress);
    } else {
      frame = requestAnimationFrame(animateToScroll);
    }
  };
  window.addEventListener("scroll", requestStoryUpdate, { passive: true });
  window.addEventListener("resize", () => {
    controller.resize();
    requestStoryUpdate();
  });
  applyProgress(currentProgress);

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
      zones.setStatuses(await loadObservedStatus(demo));
    } catch {
      zones.setStatuses([]);
    }
  };
  await refreshStatus();
  refreshStatusAfterHourChange(refreshStatus);
}

function smoothstep(value: number) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function openBeach(beachId: string) {
  window.location.assign(`/terrain/?beach=${encodeURIComponent(beachId)}`);
}

function showError(message: string) {
  document.querySelector("#loading")?.remove();
  errorElement.hidden = false;
  errorElement.textContent = message;
}
