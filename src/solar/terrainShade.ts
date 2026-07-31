import { DateTime } from "luxon";
import SunCalc from "suncalc";
import { getSolarPosition, localDateTime, MOJACAR_TIMEZONE } from "./sunPosition";
import { sunCalcAzimuthToBearing } from "./sunVector";

export type TerrainShadeTime = {
  sunriseMinutes: number;
  sunsetMinutes: number;
  lastDirectSunMinutes: number | null;
  shadeStartMinutes: number | null;
  leadBeforeSunsetMinutes: number | null;
};

export function calculateTerrainShadeTime(
  dateISO: string,
  latitude: number,
  longitude: number,
  horizonAtBearing: (bearingDegrees: number) => number
): TerrainShadeTime {
  const reference = getSolarPosition(dateISO, 12 * 60, latitude, longitude);
  const sunriseMinutes = localMinutes(reference.sunrise);
  const sunsetMinutes = localMinutes(reference.sunset);
  let lastDirectSunMinutes: number | null = null;

  // Recorre hacia atrás: normalmente encuentra el último minuto de Sol
  // directo en unas decenas de muestras, sin evaluar todo el día.
  for (
    let minutes = Math.min(1439, sunsetMinutes + 2);
    minutes >= Math.max(0, sunriseMinutes - 2);
    minutes--
  ) {
    const position = SunCalc.getPosition(
      localDateTime(dateISO, minutes),
      latitude,
      longitude
    );
    const altitudeDegrees = position.altitude * 180 / Math.PI;
    if (
      altitudeDegrees > 0
      && altitudeDegrees > horizonAtBearing(sunCalcAzimuthToBearing(position.azimuth))
    ) {
      lastDirectSunMinutes = minutes;
      break;
    }
  }

  const shadeStartMinutes = lastDirectSunMinutes == null
    ? null
    : Math.min(sunsetMinutes, lastDirectSunMinutes + 1);
  return {
    sunriseMinutes,
    sunsetMinutes,
    lastDirectSunMinutes,
    shadeStartMinutes,
    leadBeforeSunsetMinutes: shadeStartMinutes == null
      ? null
      : Math.max(0, sunsetMinutes - shadeStartMinutes)
  };
}

function localMinutes(date: Date): number {
  const local = DateTime.fromJSDate(date).setZone(MOJACAR_TIMEZONE);
  return local.hour * 60 + local.minute;
}
