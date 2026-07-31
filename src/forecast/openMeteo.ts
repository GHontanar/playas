export interface BeachForecastPoint {
  time: string;
  airTemperature: number | null;
  apparentTemperature: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  precipitationProbability: number | null;
  uvIndex: number | null;
  seaTemperature: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
}

export type ForecastSeaState = "calm" | "moderate" | "rough";
export const CALM_MAX_WAVE_HEIGHT = .45;
export const ROUGH_MIN_WAVE_HEIGHT = .9;

export function seaStateForWaveHeight(waveHeight: number | null | undefined): ForecastSeaState | null {
  if (waveHeight == null || !Number.isFinite(waveHeight)) return null;
  if (waveHeight < CALM_MAX_WAVE_HEIGHT) return "calm";
  if (waveHeight < ROUGH_MIN_WAVE_HEIGHT) return "moderate";
  return "rough";
}

export function seaStateLabel(state: ForecastSeaState | null): string {
  return state === "calm" ? "Calma" : state === "moderate" ? "Marejadilla" : state === "rough" ? "Agitado" : "";
}

type HourlyPayload = { hourly?: Record<string, Array<string | number | null>> };

export async function loadBeachForecast(lat: number, lon: number): Promise<Map<string, BeachForecastPoint>> {
  const location = `latitude=${lat}&longitude=${lon}&timezone=Europe%2FMadrid&forecast_days=7`;
  const weatherUrl = "https://api.open-meteo.com/v1/forecast?" + location +
    "&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation_probability,uv_index";
  const marineUrl = "https://marine-api.open-meteo.com/v1/marine?" + location +
    "&cell_selection=sea&hourly=wave_height,wave_period,wave_direction,sea_surface_temperature";
  const [weatherResponse, marineResponse] = await Promise.all([fetch(weatherUrl), fetch(marineUrl)]);
  if (!weatherResponse.ok || !marineResponse.ok) throw new Error("Previsión no disponible");
  return mergeForecasts(await weatherResponse.json() as HourlyPayload, await marineResponse.json() as HourlyPayload);
}

export function mergeForecasts(weather: HourlyPayload, marine: HourlyPayload): Map<string, BeachForecastPoint> {
  const result = new Map<string, BeachForecastPoint>();
  const weatherHourly = weather.hourly ?? {};
  const marineHourly = marine.hourly ?? {};
  const marineByTime = new Map((marineHourly.time ?? []).map((time, index) => [String(time), index]));
  (weatherHourly.time ?? []).forEach((timeValue, index) => {
    const time = String(timeValue);
    const marineIndex = marineByTime.get(time);
    result.set(time, {
      time,
      airTemperature: numberAt(weatherHourly.temperature_2m, index),
      apparentTemperature: numberAt(weatherHourly.apparent_temperature, index),
      windSpeed: numberAt(weatherHourly.wind_speed_10m, index),
      windDirection: numberAt(weatherHourly.wind_direction_10m, index),
      windGust: numberAt(weatherHourly.wind_gusts_10m, index),
      precipitationProbability: numberAt(weatherHourly.precipitation_probability, index),
      uvIndex: numberAt(weatherHourly.uv_index, index),
      seaTemperature: numberAt(marineHourly.sea_surface_temperature, marineIndex),
      waveHeight: numberAt(marineHourly.wave_height, marineIndex),
      wavePeriod: numberAt(marineHourly.wave_period, marineIndex),
      waveDirection: numberAt(marineHourly.wave_direction, marineIndex)
    });
  });
  return result;
}

function numberAt(values: Array<string | number | null> | undefined, index: number | undefined) {
  if (!values || index === undefined) return null;
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function forecastKey(dateISO: string, minutes: number): string {
  const date = new Date(`${dateISO}T00:00:00`);
  date.setMinutes(Math.round(minutes / 60) * 60);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:00`;
}

export function windName(degrees: number | null): string {
  if (degrees === null) return "—";
  const direction = ((degrees % 360) + 360) % 360;
  if (direction >= 45 && direction < 135) return "Levante";
  if (direction >= 225 && direction < 315) return "Poniente";
  const names = ["Norte", "Nordeste", "Este", "Sudeste", "Sur", "Suroeste", "Oeste", "Noroeste"];
  return names[Math.round(direction / 45) % 8];
}
