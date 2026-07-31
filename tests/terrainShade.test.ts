import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ventanicas from "../src/beaches/ventanicas.json";
import { estimateTerrainHorizon } from "../src/map/terrain";
import { calculateTerrainShadeTime } from "../src/solar/terrainShade";

const buffer = readFileSync(`public${ventanicas.shadowTerrain.terrain.asset}`);
const heights = new Float32Array(
  buffer.buffer,
  buffer.byteOffset,
  buffer.byteLength / Float32Array.BYTES_PER_ELEMENT
);
const horizon = (bearing: number) => estimateTerrainHorizon(
  heights,
  { center: ventanicas.center, ...ventanicas.shadowTerrain },
  bearing
);

describe("hora de sombra orográfica", () => {
  it.each([
    ["2026-06-21", 20 * 60 + 23, 60],
    ["2026-09-23", 18 * 60 + 59, 60],
    ["2026-12-21", 16 * 60 + 49, 55]
  ])("reproduce el perfil validado de Ventanicas el %s", (date, expectedShade, minimumLead) => {
    const result = calculateTerrainShadeTime(
      date,
      ventanicas.center.lat,
      ventanicas.center.lon,
      horizon
    );
    expect(result.shadeStartMinutes).toBe(expectedShade);
    expect(result.leadBeforeSunsetMinutes).toBeGreaterThan(minimumLead);
  });

  it("coincide prácticamente con la puesta cuando el horizonte es plano", () => {
    const result = calculateTerrainShadeTime("2026-06-21", 37.1, -1.84, () => 0);
    expect(result.shadeStartMinutes).not.toBeNull();
    expect(result.leadBeforeSunsetMinutes).toBeLessThan(10);
  });

  it("declara ausencia de Sol directo si el perfil bloquea todo el día", () => {
    const result = calculateTerrainShadeTime("2026-12-21", 37.1, -1.84, () => 90);
    expect(result.lastDirectSunMinutes).toBeNull();
    expect(result.shadeStartMinutes).toBeNull();
    expect(result.leadBeforeSunsetMinutes).toBeNull();
  });
});
