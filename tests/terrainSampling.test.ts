import { describe, expect, it } from "vitest";
import { sampleTerrainElevation } from "../src/map/terrain";

describe("muestreo de elevación para capas urbanas", () => {
  const config = {
    projectedBounds: {
      west: 0, south: 0, east: 10, north: 10, crs: "EPSG:25830" as const
    },
    terrain: {
      verticalExaggeration: 1,
      sourceResolutionMeters: 5,
      webResolutionMeters: 5,
      width: 2,
      height: 2,
      minElevation: 0,
      maxElevation: 30,
      asset: ""
    }
  };

  it("interpola el centro de cuatro celdas", () => {
    expect(sampleTerrainElevation(new Float32Array([0, 10, 20, 30]), config, 0, 0))
      .toBeCloseTo(15);
  });

  it("respeta las esquinas norte-oeste y sur-este", () => {
    const heights = new Float32Array([0, 10, 20, 30]);
    expect(sampleTerrainElevation(heights, config, -5, 5)).toBe(0);
    expect(sampleTerrainElevation(heights, config, 5, -5)).toBe(30);
  });
});
