import { DateTime } from "luxon";
import SunCalc from "suncalc";
import { sunCalcAnglesToVector, sunCalcAzimuthToBearing } from "./sunVector";

export const MOJACAR_TIMEZONE = "Europe/Madrid";

export interface SolarPosition {
  instant: Date;
  azimuthRadians: number;
  altitudeRadians: number;
  azimuthDegrees: number;
  altitudeDegrees: number;
  vector: ReturnType<typeof sunCalcAnglesToVector>;
  sunrise: Date;
  sunset: Date;
  aboveHorizon: boolean;
}

export function localDateTime(dateISO: string, minutes: number): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateISO) || minutes < 0 || minutes >= 1440) {
    throw new Error("Fecha u hora local no válida");
  }
  const dt = DateTime.fromISO(dateISO, { zone: MOJACAR_TIMEZONE }).startOf("day").plus({ minutes });
  if (!dt.isValid) throw new Error(dt.invalidExplanation ?? "Fecha local no válida");
  return dt.toJSDate();
}

export function getSolarPosition(
  dateISO: string,
  minutes: number,
  latitude: number,
  longitude: number
): SolarPosition {
  const instant = localDateTime(dateISO, minutes);
  const position = SunCalc.getPosition(instant, latitude, longitude);
  const times = SunCalc.getTimes(instant, latitude, longitude);
  const altitudeDegrees = position.altitude * 180 / Math.PI;
  return {
    instant,
    azimuthRadians: position.azimuth,
    altitudeRadians: position.altitude,
    azimuthDegrees: sunCalcAzimuthToBearing(position.azimuth),
    altitudeDegrees,
    vector: sunCalcAnglesToVector(position.azimuth, position.altitude),
    sunrise: times.sunrise,
    sunset: times.sunset,
    aboveHorizon: position.altitude > 0
  };
}

export function formatLocalTime(date: Date): string {
  return DateTime.fromJSDate(date).setZone(MOJACAR_TIMEZONE).toFormat("HH:mm");
}

export function nowInMojacar(): { dateISO: string; minutes: number } {
  const now = DateTime.now().setZone(MOJACAR_TIMEZONE);
  const rounded = Math.min(1425, now.hour * 60 + Math.round(now.minute / 15) * 15);
  return { dateISO: now.toISODate()!, minutes: rounded };
}
