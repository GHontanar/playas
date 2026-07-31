import { describe, expect, it } from "vitest";
import { forecastKey, mergeForecasts, seaStateForWaveHeight, windName } from "../src/forecast/openMeteo";

describe("previsión de playa", () => {
  it("combina tiempo y mar por hora local", () => {
    const values = mergeForecasts(
      { hourly: { time: ["2026-07-31T12:00"], temperature_2m: [29], wind_speed_10m: [12] } },
      { hourly: { time: ["2026-07-31T12:00"], sea_surface_temperature: [25.2], wave_height: [.5] } }
    ).get("2026-07-31T12:00");
    expect(values).toMatchObject({ airTemperature: 29, windSpeed: 12, seaTemperature: 25.2, waveHeight: .5 });
  });

  it("redondea el selector al paso horario del modelo", () => {
    expect(forecastKey("2026-07-31", 12 * 60 + 20)).toBe("2026-07-31T12:00");
    expect(forecastKey("2026-07-31", 12 * 60 + 40)).toBe("2026-07-31T13:00");
  });

  it("traduce los regímenes principales de viento", () => {
    expect(windName(90)).toBe("Levante");
    expect(windName(270)).toBe("Poniente");
    expect(windName(0)).toBe("Norte");
  });

  it("clasifica Hs con los umbrales calibrados para Mojácar", () => {
    expect(seaStateForWaveHeight(.44)).toBe("calm");
    expect(seaStateForWaveHeight(.45)).toBe("moderate");
    expect(seaStateForWaveHeight(.89)).toBe("moderate");
    expect(seaStateForWaveHeight(.9)).toBe("rough");
    expect(seaStateForWaveHeight(null)).toBeNull();
  });
});
