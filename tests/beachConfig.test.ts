import { describe, expect, it } from "vitest";
import config from "../src/beaches/ventanicas.json";
import { beaches, coastOverview, municipalities } from "../src/beaches/catalog";
import { clampExaggeration, parseBeachConfig } from "../src/beaches/types";

describe("configuración declarativa de playa", () => {
  it("valida Ventanicas", () => {
    const parsed = parseBeachConfig(config);
    expect(parsed.id).toBe("ventanicas");
    expect(parsed.projectedBounds.crs).toBe("EPSG:25830");
    expect(parsed.terrain.sourceResolutionMeters).toBe(2);
  });

  it("valida todos los catálogos municipales sin identificadores duplicados", () => {
    const parsed = beaches.map(parseBeachConfig);
    expect(parsed).toHaveLength(31);
    expect(new Set(parsed.map((beach) => beach.id)).size).toBe(31);
    expect(municipalities.map((municipality) => municipality.beaches.length)).toEqual([7, 7, 3, 4, 10]);
    for (const beach of parsed) {
      expect(beach.shoreline.start.x).toBeGreaterThanOrEqual(beach.projectedBounds.west);
      expect(beach.shoreline.start.x).toBeLessThanOrEqual(beach.projectedBounds.east);
      expect(beach.shoreline.end.z).toBeGreaterThanOrEqual(beach.projectedBounds.south);
      expect(beach.shoreline.end.z).toBeLessThanOrEqual(beach.projectedBounds.north);
    }
  });

  it("declara un overview municipal ligero y separado", () => {
    expect(coastOverview.id).toBe("mojacar-coast");
    expect(coastOverview.urbanDetail).toBe("overview");
    expect(coastOverview.terrain.webResolutionMeters).toBe(20);
    expect(coastOverview.projectedBounds.north - coastOverview.projectedBounds.south)
      .toBeGreaterThan(8_000);
    const carboneras = municipalities.find((item) => item.id === "carboneras")!;
    expect(carboneras.overview.id).toBe("carboneras-coast");
    expect(carboneras.overview.projectedBounds.north - carboneras.overview.projectedBounds.south)
      .toBeGreaterThan(11_000);
    expect(municipalities.find((item) => item.id === "garrucha")?.overview.id).toBe("garrucha-coast");
    expect(municipalities.find((item) => item.id === "vera")?.overview.id).toBe("vera-coast");
  });

  it("declara los espigones oficiales solo donde existen", () => {
    const lance = beaches.map(parseBeachConfig).find((beach) => beach.id === "lance-nuevo")!;
    const bancal = beaches.map(parseBeachConfig).find((beach) => beach.id === "venta-del-bancal")!;
    expect(lance.coastalStructures).toEqual([
      { featureId: 10125300000520, kind: "breakwater" }
    ]);
    expect(lance.seaLevelMeters).toBe(0.15);
    expect(lance.worldAxes).toBe("south-positive");
    expect(lance.visualStyle).toBe("mediterranean-illustrated");
    expect(lance.camera.bearing).toBe(45);
    expect(lance.camera.roll).toBe(0);
    expect(bancal.coastalStructures).toEqual([
      { featureId: 10125300000519, kind: "breakwater" }
    ]);
    const parsed = beaches.map(parseBeachConfig);
    expect(parsed.every((beach) =>
      beach.worldAxes === "south-positive"
      && beach.camera.bearing === 45
      && beach.camera.roll === 0
    )).toBe(true);
    expect(parsed.every((beach) =>
      beach.visualStyle === "mediterranean-illustrated"
    )).toBe(true);
    expect(parsed
      .filter((beach) => ![
        "lance-nuevo", "venta-del-bancal", "garrucha-playa",
        "garrucha-posito", "garrucha-playazo"
      ].includes(beach.id))
      .every((beach) => beach.coastalStructures.length === 0)).toBe(true);
    expect(parsed.filter((beach) => beach.municipalityId === "garrucha")
      .every((beach) => beach.coastalStructures.length > 0)).toBe(true);
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
