import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import { getSolarPosition, localDateTime, MOJACAR_TIMEZONE } from "../src/solar/sunPosition";

const LAT = 37.109198;
const LON = -1.843914;

describe("fecha local y posición solar", () => {
  it("respeta el horario de verano de Europe/Madrid", () => {
    const summer = DateTime.fromJSDate(localDateTime("2026-06-21", 12 * 60)).setZone(MOJACAR_TIMEZONE);
    const winter = DateTime.fromJSDate(localDateTime("2026-12-21", 12 * 60)).setZone(MOJACAR_TIMEZONE);
    expect(summer.offset).toBe(120);
    expect(winter.offset).toBe(60);
    expect(summer.hour).toBe(12);
  });

  it("sitúa el Sol alto y al sur cerca del mediodía del solsticio", () => {
    const solar = getSolarPosition("2026-06-21", 14 * 60, LAT, LON);
    expect(solar.aboveHorizon).toBe(true);
    expect(solar.altitudeDegrees).toBeGreaterThan(70);
    expect(solar.azimuthDegrees).toBeGreaterThan(150);
    expect(solar.azimuthDegrees).toBeLessThan(220);
  });

  it("trata la medianoche como Sol bajo el horizonte", () => {
    expect(getSolarPosition("2026-06-21", 0, LAT, LON).aboveHorizon).toBe(false);
  });

  it("rechaza minutos fuera del día", () => {
    expect(() => localDateTime("2026-06-21", 1440)).toThrow();
  });
});
