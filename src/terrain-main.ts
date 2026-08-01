import "./styles/terrain.css";
import { getBeach, getMunicipality, municipalities } from "./beaches/catalog";
import { clampExaggeration } from "./beaches/types";
import { createScene } from "./map/createScene";
import { estimateTerrainHorizon } from "./map/terrain";
import { SUN_LIGHT_RADIUS, updateSunLight } from "./map/shadows";
import { formatLocalTime, getSolarPosition, nowInMojacar } from "./solar/sunPosition";
import { sunVectorForWorldAxes } from "./solar/sunVector";
import { calculateTerrainShadeTime, type TerrainShadeTime } from "./solar/terrainShade";
import { createWindGlyph } from "./map/wind";
import { windRelationLabel, type WindRelation } from "./wind/windDirection";
import type { SeaState } from "./map/sea";
import type { WaterMode } from "./map/sea";
import { loadObservedStatus, refreshStatusAfterHourChange } from "./status/loadStatus";
import type { ObservedBeachStatus } from "./status/types";
import { forecastKey, loadBeachForecast, seaStateForWaveHeight, seaStateLabel, windName, type BeachForecastPoint } from "./forecast/openMeteo";
import { loadingMessage } from "./loading/loadingMessage";

const config = getBeach(new URLSearchParams(window.location.search).get("beach"));
const municipality = getMunicipality(config.municipalityId);
document.title = `${config.name} · ${municipality.name}`;
const app = document.querySelector<HTMLElement>("#app")!;
const initial = nowInMojacar();

app.innerHTML = `
  <main class="terrain-app">
    <header class="title">
      <div>
        <a href="/coast/?municipality=${municipality.id}" class="back">${municipality.name} / costa</a>
        <h1>${config.name}</h1>
        <div id="beach-status" class="beach-status" data-service="loading" aria-live="polite">
          <i class="beach-status-colour" aria-hidden="true"></i>
          <span>Consultando bandera…</span>
          <small></small>
        </div>
      </div>
      <label class="beach-picker">Playa
        <select id="beach">
          ${municipalities.map((item) => `<optgroup label="${item.name}">${item.beaches.map((beach) =>
            `<option value="${beach.id}"${beach.id === config.id ? " selected" : ""}>${beach.name}</option>`
          ).join("")}</optgroup>`).join("")}
        </select>
      </label>
    </header>
    <section class="scene-shell" aria-label="Maqueta topográfica tridimensional de ${config.name}">
      <div id="scene" class="scene"><div id="loading" class="loading">${loadingMessage()}</div></div>
      <div id="scene-error" class="scene-error" hidden></div>
      <div id="wind-glyph" class="wind-glyph" hidden aria-hidden="true"></div>
      <aside class="forecast-card" aria-live="polite">
        <div class="forecast-heading"><span>Previsión para</span><strong id="time-readout">—</strong></div>
        <div class="beach-metrics">
          <div><span>Agua</span><strong id="sea-temperature">—</strong></div>
          <div><span>Aire</span><strong id="air-temperature">—</strong><small id="feels-like"></small></div>
          <div><span>Oleaje</span><strong id="wave-height">—</strong><small id="wave-period"></small></div>
          <div><span>Viento</span><strong id="wind-speed">—</strong><small id="wind-direction"></small></div>
        </div>
        <p id="forecast-secondary" class="forecast-secondary">Cargando previsión de modelo…</p>
        <div class="terrain-shade">
          <span>Sombra orográfica</span>
          <strong id="terrain-shade-time">—</strong>
          <small id="terrain-shade-lead">Calculando perfil diario…</small>
        </div>
        <p id="sun-state" class="sun-state">Calculando Sol…</p>
        <details class="technical-solar">
          <summary>Datos solares y técnicos</summary>
          <dl>
            <div><dt>Azimut</dt><dd id="azimuth">—</dd></div>
            <div><dt>Elevación</dt><dd id="altitude">—</dd></div>
            <div><dt>Horizonte</dt><dd id="horizon">—</dd></div>
            <div><dt>Salida / puesta</dt><dd id="sun-times">—</dd></div>
          </dl>
        </details>
        <small class="forecast-source">Open-Meteo · previsión de modelo, no medición local</small>
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
          <label>Estado artístico del mar
            <select id="sea-state">
              <option value="auto" selected>Automático · previsión</option>
              <option value="calm">Calma</option>
              <option value="moderate">Marejadilla</option>
              <option value="rough">Agitado</option>
            </select>
          </label>
          <label>Modelo de agua
            <select id="water-mode">
              <option value="volumetric"${config.visualStyle === "mediterranean-illustrated" ? " selected" : ""}>Volumétrica</option>
              <option value="legacy"${config.visualStyle !== "mediterranean-illustrated" ? " selected" : ""}>Anterior</option>
            </select>
          </label>
          <label>Exageración <output id="exaggeration-output">${config.terrain.verticalExaggeration.toFixed(1)}×</output>
            <input id="exaggeration" type="range" min="0.5" max="3" step="0.1" value="${config.terrain.verticalExaggeration}">
          </label>
          <label class="check"><input id="shadows" type="checkbox" checked> Sombras físicas</label>
          <label class="check"><input id="wireframe" type="checkbox"> Mostrar malla</label>
          <label class="check"><input id="wind-field" type="checkbox" checked> Glifo de viento</label>
          <p>${config.terrain.width * config.terrain.height} vértices · ${(config.terrain.width - 1) * (config.terrain.height - 1) * 2} triángulos · ${config.terrain.webResolutionMeters} m</p>
        </div>
      </details>
    </section>
    <footer>
      <p>Edificios simplificados según plantas catastrales; no incluye árboles ni mobiliario. “Oculto por relieve” evalúa únicamente el perfil orográfico desde el centro de la playa.</p>
      <p>${config.attribution.join(" · ")}</p>
      <p class="data-credits">
        <a href="https://www.catastro.hacienda.gob.es/webinspire/index.html" target="_blank" rel="noopener">Edificios: Dirección General del Catastro</a>
        ·
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">Calles: © OpenStreetMap contributors, ODbL</a>
      </p>
    </footer>
  </main>`;

const sceneElement = document.querySelector<HTMLElement>("#scene")!;
const errorElement = document.querySelector<HTMLElement>("#scene-error")!;
const dateInput = document.querySelector<HTMLInputElement>("#date")!;
const timeInput = document.querySelector<HTMLInputElement>("#time")!;
const shadowsInput = document.querySelector<HTMLInputElement>("#shadows")!;
const wireframeInput = document.querySelector<HTMLInputElement>("#wireframe")!;
const exaggerationInput = document.querySelector<HTMLInputElement>("#exaggeration")!;
const seaStateInput = document.querySelector<HTMLSelectElement>("#sea-state")!;
const waterModeInput = document.querySelector<HTMLSelectElement>("#water-mode")!;
const windFieldInput = document.querySelector<HTMLInputElement>("#wind-field");
const windGlyphElement = document.querySelector<HTMLElement>("#wind-glyph");
const beachInput = document.querySelector<HTMLSelectElement>("#beach")!;
beachInput.addEventListener("change", () => {
  const url = new URL(window.location.href);
  url.searchParams.set("beach", beachInput.value);
  window.location.assign(url);
});
void loadBeachStatus();
refreshStatusAfterHourChange(loadBeachStatus);

if (!window.WebGLRenderingContext) {
  showError("Este dispositivo no ofrece WebGL, necesario para mostrar la maqueta 3D.");
} else {
  initialise().catch((error: unknown) => {
    showError(error instanceof Error ? error.message : "No se pudo preparar la escena.");
  });
}

async function initialise() {
  const controller = await createScene(sceneElement, config);
  const windField = windGlyphElement
    ? createWindGlyph(config, windGlyphElement)
    : undefined;
  if (windField) {
    controller.addFrameListener(windField.update);
  }
  let shadeCache: { date: string; value: TerrainShadeTime } | undefined;
  const terrainHorizon = (bearing: number) => estimateTerrainHorizon(
    controller.shadowTerrain.heights,
    { center: config.center, ...config.shadowTerrain },
    bearing
  );
  const dailyShade = () => {
    if (shadeCache?.date !== dateInput.value) {
      shadeCache = {
        date: dateInput.value,
        value: calculateTerrainShadeTime(
          dateInput.value,
          config.center.lat,
          config.center.lon,
          terrainHorizon
        )
      };
    }
    return shadeCache.value;
  };
  let forecast = new Map<string, BeachForecastPoint>();
  let forecastFailed = false;
  void loadBeachForecast(config.center.lat, config.center.lon).then((values) => {
    forecast = values;
    updateForecast();
  }).catch(() => {
    forecastFailed = true;
    updateForecast();
  });
  document.querySelector("#loading")?.remove();
  const updateForecast = () => {
    const point = forecast.get(forecastKey(dateInput.value, Number(timeInput.value)));
    const windRelation = windField?.setConditions(
      point?.windSpeed,
      point?.windDirection,
      point?.windGust
    );
    renderForecast(point, forecastFailed, windRelation);
    applyForecastSea(controller, point, seaStateInput.value);
  };
  const update = () => {
    const minutes = Number(timeInput.value);
    const solar = getSolarPosition(dateInput.value, minutes, config.center.lat, config.center.lon);
    const horizon = terrainHorizon(solar.azimuthDegrees);
    renderTerrainShade(dailyShade());
    const terrainHidden = solar.aboveHorizon && solar.altitudeDegrees <= horizon;
    updateSunLight(
      controller.light,
      sunVectorForWorldAxes(solar.vector, config.worldAxes),
      solar.aboveHorizon,
      shadowsInput.checked,
      SUN_LIGHT_RADIUS
    );
    controller.renderer.shadowMap.enabled = shadowsInput.checked;
    controller.setSeaSun(solar.vector, solar.aboveHorizon);
    controller.setSolarAppearance(solar.altitudeDegrees, solar.aboveHorizon);
    windField?.setSolarAppearance(solar.altitudeDegrees, solar.aboveHorizon);
    text("#time-readout", formatMinutes(minutes));
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
    updateForecast();
  };
  dateInput.addEventListener("input", update);
  timeInput.addEventListener("input", update);
  shadowsInput.addEventListener("change", update);
  seaStateInput.addEventListener("change", () => {
    const point = forecast.get(forecastKey(dateInput.value, Number(timeInput.value)));
    applyForecastSea(controller, point, seaStateInput.value);
  });
  waterModeInput.addEventListener("change", () => {
    controller.setWaterMode(waterModeInput.value as WaterMode);
  });
  windFieldInput?.addEventListener("change", () => windField?.setVisible(windFieldInput.checked));
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

function renderForecast(
  point: BeachForecastPoint | undefined,
  failed: boolean,
  windRelation?: WindRelation | null
) {
  text("#sea-temperature", metric(point?.seaTemperature, "°C", 0));
  text("#air-temperature", metric(point?.airTemperature, "°C", 0));
  text("#feels-like", point?.apparentTemperature == null ? "" : `Sensación ${Math.round(point.apparentTemperature)}°`);
  text("#wave-height", metric(point?.waveHeight, "m", 1));
  const seaState = seaStateForWaveHeight(point?.waveHeight);
  const waveDirection = point?.waveDirection != null
    ? ` · ${Math.round(point.waveDirection)}°`
    : "";
  text("#wave-period", point?.wavePeriod == null ? "" : `${seaStateLabel(seaState)} · ${point.wavePeriod.toFixed(0)} s${waveDirection}`);
  text("#wind-speed", metric(point?.windSpeed, "km/h", 0));
  text("#wind-direction", point?.windDirection == null
    ? ""
    : windRelation
      ? `${windName(point.windDirection)} · ${windRelationLabel(windRelation)}`
      : windName(point.windDirection));
  const secondary = document.querySelector<HTMLElement>("#forecast-secondary")!;
  secondary.textContent = point
    ? `UV ${point.uvIndex?.toFixed(0) ?? "—"} · Lluvia ${point.precipitationProbability?.toFixed(0) ?? "—"}% · Racha ${point.windGust?.toFixed(0) ?? "—"} km/h`
    : failed ? "Previsión temporalmente no disponible" : "Sin previsión para la fecha seleccionada";
}

function applyForecastSea(
  controller: Awaited<ReturnType<typeof createScene>>,
  point: BeachForecastPoint | undefined,
  selection: string
) {
  if (selection !== "auto") {
    controller.setSeaConditions({ state: selection as SeaState, source: "debug" });
    return;
  }
  const state = seaStateForWaveHeight(point?.waveHeight);
  controller.setSeaConditions(state ? {
    state,
    source: "marine-data",
    waveHeightMeters: point?.waveHeight ?? undefined,
    periodSeconds: point?.wavePeriod ?? undefined,
    directionDegrees: point?.waveDirection ?? undefined
  } : { state: "moderate", source: "fallback" });
}

function metric(value: number | null | undefined, unit: string, decimals: number) {
  return value == null ? "—" : `${value.toFixed(decimals)} ${unit}`;
}

function renderTerrainShade(value: TerrainShadeTime) {
  const timeElement = document.querySelector<HTMLElement>("#terrain-shade-time")!;
  const leadElement = document.querySelector<HTMLElement>("#terrain-shade-lead")!;
  if (value.shadeStartMinutes == null || value.leadBeforeSunsetMinutes == null) {
    timeElement.textContent = "Sin Sol directo";
    leadElement.textContent = "El perfil bloquea el recorrido solar calculado";
    return;
  }
  timeElement.textContent = `≈ ${formatMinutes(value.shadeStartMinutes)}`;
  leadElement.textContent = value.leadBeforeSunsetMinutes < 10
    ? `Prácticamente con la puesta · ${formatMinutes(value.sunsetMinutes)}`
    : `${formatDuration(value.leadBeforeSunsetMinutes)} antes de la puesta · ${formatMinutes(value.sunsetMinutes)}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

async function loadBeachStatus() {
  const element = document.querySelector<HTMLElement>("#beach-status")!;
  try {
    const demo = new URLSearchParams(window.location.search).get("demo") === "1";
    const status = (await loadObservedStatus(demo, config.municipalityId)).find((candidate) => candidate.beachId === config.id);
    renderBeachStatus(element, status);
  } catch {
    renderBeachStatus(element, undefined);
  }
}

function renderBeachStatus(element: HTMLElement, status: ObservedBeachStatus | undefined) {
  const label = element.querySelector<HTMLElement>("span")!;
  const detail = element.querySelector<HTMLElement>("small")!;
  const activeFlag = status?.lifeguardService === "active" && status.flag !== "unknown";
  element.dataset.service = status?.lifeguardService ?? "unknown";
  element.dataset.flag = activeFlag ? status.flag : "unknown";
  label.textContent = activeFlag
    ? `Bandera ${flagLabel(status.flag)}`
    : status?.lifeguardService === "inactive"
      ? "Sin servicio de socorrismo"
      : "Bandera no disponible";
  const permanentlyUnstaffed = ["carboneras-los-muertos", "carboneras-algarrobico"].includes(config.id);
  detail.textContent = activeFlag && status.observedAtLocal
    ? `Observada ${status.observedAtLocal}`
    : status?.lifeguardService === "inactive"
      ? permanentlyUnstaffed ? "Sin puesto municipal en la fuente oficial" : "Fuera del horario oficial"
      : "No se pudo confirmar el servicio";
}

function flagLabel(flag: ObservedBeachStatus["flag"]) {
  return ({ green: "verde", yellow: "amarilla", red: "roja", unknown: "desconocida" })[flag];
}

function text(selector: string, value: string) {
  document.querySelector<HTMLElement>(selector)!.textContent = value;
}

function showError(message: string) {
  document.querySelector("#loading")?.remove();
  errorElement.hidden = false;
  errorElement.textContent = message;
}
