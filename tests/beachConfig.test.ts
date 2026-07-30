import { describe, expect, it } from "vitest";
import config from "../src/beaches/ventanicas.json";
import { clampExaggeration, parseBeachConfig } from "../src/beaches/types";

describe("configuración declarativa de playa", () => {
  it("valida Ventanicas", () => {
    const parsed = parseBeachConfig(config);
    expect(parsed.id).toBe("ventanicas");
    expect(parsed.projectedBounds.crs).toBe("EPSG:25830");
    expect(parsed.terrain.sourceResolutionMeters).toBe(2);
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
