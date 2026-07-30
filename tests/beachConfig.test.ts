import { describe, expect, it } from "vitest";
import config from "../src/beaches/ventanicas.json";
import { beaches } from "../src/beaches/catalog";
import { clampExaggeration, parseBeachConfig } from "../src/beaches/types";

describe("configuración declarativa de playa", () => {
  it("valida Ventanicas", () => {
    const parsed = parseBeachConfig(config);
    expect(parsed.id).toBe("ventanicas");
    expect(parsed.projectedBounds.crs).toBe("EPSG:25830");
    expect(parsed.terrain.sourceResolutionMeters).toBe(2);
  });

  it("valida las siete playas sin identificadores duplicados", () => {
    const parsed = beaches.map(parseBeachConfig);
    expect(parsed).toHaveLength(7);
    expect(new Set(parsed.map((beach) => beach.id)).size).toBe(7);
    for (const beach of parsed) {
      expect(beach.shoreline.start.x).toBeGreaterThanOrEqual(beach.projectedBounds.west);
      expect(beach.shoreline.start.x).toBeLessThanOrEqual(beach.projectedBounds.east);
      expect(beach.shoreline.end.z).toBeGreaterThanOrEqual(beach.projectedBounds.south);
      expect(beach.shoreline.end.z).toBeLessThanOrEqual(beach.projectedBounds.north);
    }
  });

  it("rechaza bounds invertidos", () => {
    expect(() => parseBeachConfig({
      ...config,
      bounds: { ...config.bounds, west: config.bounds.east }
    })).toThrow();
  });

  it("limita la exageración al rango seguro", () => {
    expect(clampExaggeration(0)).toBe(0.5);
    expect(clampExaggeration(1.7)).toBe(1.7);
    expect(clampExaggeration(8)).toBe(3);
  });
});
