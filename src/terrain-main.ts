import "./styles/terrain.css";
import rawConfig from "./beaches/ventanicas.json";
import { parseBeachConfig, clampExaggeration } from "./beaches/types";
import { createScene } from "./map/createScene";
import { estimateTerrainHorizon } from "./map/terrain";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { formatLocalTime, getSolarPosition, nowInMojacar } from "./solar/sunPosition";

const config = parseBeachConfig(rawConfig);
const app = document.querySelector<HTMLElement>("#app")!;
const initial = nowInMojacar();

app.innerHTML = `
  <main class="terrain-app">
    <header class="title">
      <div>
        <a href="/" class="back">Mojácar / experimento topográfico</a>
        <h1>${config.name}</h1>
      </div>
      <span class="model-tag">MDT02 · maqueta 3D</span>
    </header>
    <section class="scene-shell" aria-label="Maqueta topográfica tridimensional de Ventanicas">
      <div id="scene" class="scene"><div id="loading" class="loading">Preparando el relieve…</div></div>
      <div id="scene-error" class="scene-error" hidden></div>
      <aside class="solar-card" aria-live="polite">
        <span id="sun-state" class="sun-state">Calculando Sol…</span>
        <strong id="time-readout">—</strong>
        <dl>
          <div><dt>Azimut</dt><dd id="azimuth">—</dd></div>
          <div><dt>Elevación</dt><dd id="altitude">—</dd></div>
          <div><dt>Horizonte</dt><dd id="horizon">—</dd></div>
          <div><dt>Salida / puesta</dt><dd id="sun-times">—</dd></div>
        </dl>
      </aside>
    </section>
    <section class="controls" aria-label="Controles solares">
      <label>Fecha<input id="date" type="date" value="${initial.dateISO}"></label>
      <label class="time-control">
        Hora <output id="slider-output">—</output>
        <input id="time" type="range" min="0" max="1425" step="15" value="${initial.minutes}">
      </label>
      <button id="now" type="button">Volver a ahora</button>
      <details>
        <summary>Depuración</summary>
        <div class="debug-grid">
          <label>Exageración <output id="exaggeration-output">${config.terrain.verticalExaggeration.toFixed(1)}×</output>
            <input id="exaggeration" type="range" min="0.5" max="3" step="0.1" value="${config.terrain.verticalExaggeration}">
          </label>
          <label class="check"><input id="shadows" type="checkbox" checked> Sombras físicas</label>
          <label class="check"><input id="wireframe" type="checkbox"> Mostrar malla</label>
          <p>${config.terrain.width * config.terrain.height} vértices · ${(config.terrain.width - 1) * (config.terrain.height - 1) * 2} triángulos · ${config.terrain.webResolutionMeters} m</p>
        </div>
      </details>
    </section>
    <footer>
      <p>Solo modela la orografía del terreno desnudo; no incluye edificios, árboles ni mobiliario. “Oculto por relieve” es una estimación desde el centro de la playa.</p>
      <p>${config.attribution.join(" · ")}</p>
    </footer>
  </main>`;

const sceneElement = document.querySelector<HTMLElement>("#scene")!;
const errorElement = document.querySelector<HTMLElement>("#scene-error")!;
const dateInput = document.querySelector<HTMLInputElement>("#date")!;
const timeInput = document.querySelector<HTMLInputElement>("#time")!;
const shadowsInput = document.querySelector<HTMLInputElement>("#shadows")!;
const wireframeInput = document.querySelector<HTMLInputElement>("#wireframe")!;
const exaggerationInput = document.querySelector<HTMLInputElement>("#exaggeration")!;

if (!window.WebGLRenderingContext) {
  showError("Este dispositivo no ofrece WebGL, necesario para mostrar la maqueta 3D.");
} else {
  initialise().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : "No se pudo preparar la escena.");
  });
}

async function initialise() {
  const controller = await createScene(sceneElement, config);
  document.querySelector("#loading")?.remove();
  const update = () => {
    const minutes = Number(timeInput.value);
    const solar = getSolarPosition(dateInput.value, minutes, config.center.lat, config.center.lon);
    const horizon = estimateTerrainHorizon(
      controller.shadowTerrain.heights,
      { center: config.center, ...config.shadowTerrain },
      solar.azimuthDegrees
    );
    const terrainHidden = solar.aboveHorizon && solar.altitudeDegrees <= horizon;
    updateSunLight(
      controller.light,
      solar.vector,
      solar.aboveHorizon,
      shadowsInput.checked,
      SUN_LIGHT_RADIUS
    );
    controller.renderer.shadowMap.enabled = shadowsInput.checked;
    text("#time-readout", `${formatMinutes(minutes)} · Europe/Madrid`);
    text("#slider-output", formatMinutes(minutes));
    text("#azimuth", `${solar.azimuthDegrees.toFixed(1)}°`);
    text("#altitude", `${solar.altitudeDegrees.toFixed(1)}°`);
    text("#horizon", `${horizon.toFixed(1)}°`);
    text("#sun-times", `${formatLocalTime(solar.sunrise)} / ${formatLocalTime(solar.sunset)}`);
    const state = !solar.aboveHorizon
      ? "Sol bajo el horizonte"
      : terrainHidden ? "Sol potencialmente oculto por relieve" : "Sol visible sobre el relieve";
    const stateEl = document.querySelector<HTMLElement>("#sun-state")!;
    stateEl.textContent = state;
    stateEl.dataset.state = !solar.aboveHorizon ? "night" : terrainHidden ? "hidden" : "visible";
  };
  dateInput.addEventListener("input", update);
  timeInput.addEventListener("input", update);
  shadowsInput.addEventListener("change", update);
  wireframeInput.addEventListener("change", () => controller.setWireframe(wireframeInput.checked));
  exaggerationInput.addEventListener("input", () => {
    const value = clampExaggeration(Number(exaggerationInput.value));
    controller.setExaggeration(value);
    text("#exaggeration-output", `${value.toFixed(1)}×`);
  });
  document.querySelector("#now")!.addEventListener("click", () => {
    const now = nowInMojacar();
    dateInput.value = now.dateISO;
    timeInput.value = String(now.minutes);
    update();
  });
  window.addEventListener("resize", controller.resize);
  update();
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function text(selector: string, value: string) {
  document.querySelector<HTMLElement>(selector)!.textContent = value;
}

function showError(message: string) {
  document.querySelector("#loading")?.remove();
  errorElement.hidden = false;
  errorElement.textContent = message;
}
