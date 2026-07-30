import { describe, expect, it } from "vitest";
import {
  coastXAt,
  isVentanicasSeaPoint,
  ventanicasSeawardNormal
} from "../src/map/coastalOrientation";

const coast: Array<[number, number]> = [[0, 0], [10, 100], [30, 200]];

describe("orientación costa-mar de Ventanicas", () => {
  it("interpola la X de costa en coordenadas métricas", () => {
    expect(coastXAt(coast, 50)).toBeCloseTo(5);
    expect(coastXAt(coast, 150)).toBeCloseTo(20);
  });

  it("clasifica como mar únicamente el lado oriental y respeta el margen", () => {
    expect(isVentanicasSeaPoint(coast, 22, 150, 1.5)).toBe(true);
    expect(isVentanicasSeaPoint(coast, 21, 150, 1.5)).toBe(false);
    expect(isVentanicasSeaPoint(coast, 19, 150)).toBe(false);
  });

  it("orienta la normal de las rompientes hacia X UTM positiva", () => {
    const normal = ventanicasSeawardNormal(0, 10);
    expect(normal.x).toBeCloseTo(1);
    expect(normal.z).toBeCloseTo(0);
  });
});
