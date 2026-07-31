import { describe, expect, it } from "vitest";
import {
  coastlineEnvelope,
  coastXAt,
  isPointInPolygon,
  isSeaPoint,
  landPolygonFromCoastlines,
  seawardNormal
} from "../src/map/coastalOrientation";

const coast: Array<[number, number]> = [[0, 0], [10, 100], [30, 200]];

describe("orientación costa-mar de Ventanicas", () => {
  it("interpola la X de costa en coordenadas métricas", () => {
    expect(coastXAt(coast, 50)).toBeCloseTo(5);
    expect(coastXAt(coast, 150)).toBeCloseTo(20);
  });

  it("clasifica como mar únicamente el lado oriental y respeta el margen", () => {
    expect(isSeaPoint(coast, 22, 150, "east", 1.5)).toBe(true);
    expect(isSeaPoint(coast, 21, 150, "east", 1.5)).toBe(false);
    expect(isSeaPoint(coast, 19, 150, "east")).toBe(false);
  });

  it("orienta la normal de las rompientes hacia X UTM positiva", () => {
    const normal = seawardNormal(0, 10, "east");
    expect(normal.x).toBeCloseTo(1);
    expect(normal.z).toBeCloseTo(0);
  });

  it("reduce ramales costeros al borde exterior del lado del mar", () => {
    expect(coastlineEnvelope([
      [[0, 0], [2, 10]],
      [[5, 0], [3, 10]]
    ], "east", 1)).toEqual([[5, 0], [3, 10]]);
  });

  it("conserva un espigón que vuelve sobre sí mismo en la máscara poligonal", () => {
    const polygon = landPolygonFromCoastlines([
      [[0, -10], [0, -2]],
      [[0, -2], [6, -2], [6, 2], [0, 2]],
      [[0, 2], [0, 10]]
    ], "east", 10, 10);
    expect(isPointInPolygon([4, 0], polygon)).toBe(true);
    expect(isPointInPolygon([8, 0], polygon)).toBe(false);
    expect(isPointInPolygon([-4, 0], polygon)).toBe(true);
  });
});
