import { describe, expect, it } from "vitest";
import {
  coastlineEnvelope,
  coastalFloodMask,
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

  it("deja entrar el mar por una bocana sin atravesar los muelles", () => {
    const mask = coastalFloodMask([
      [[0, -5], [0, -1], [-3, -1], [-3, 1], [0, 1], [0, 5]]
    ], "east", 21, 21, 5, 5);
    const at = (x: number, z: number) => {
      const col = Math.round((x + 5) / 10 * 20);
      const row = Math.round((z + 5) / 10 * 20);
      return mask[row * 21 + col];
    };
    expect(at(-1, 0)).toBe(1);
    expect(at(-4, 3)).toBe(0);
    expect(at(3, 3)).toBe(1);
  });

  it("inunda la dársena encerrada sin invadir la playa llana", () => {
    // Recorte tipo Playazo Garrucha: costa abierta al este, muelles que
    // encierran una dársena abierta por el borde sur y una franja de arena
    // llana pegada a la costa que sigue siendo tierra.
    const size = 21;
    const heights = new Float32Array(size * size);
    for (let demRow = 0; demRow < size; demRow++) {
      for (let col = 0; col < size; col++) {
        const x = col - 10;
        const z = 10 - demRow;
        const basin = x > -6 && x < -2 && z < -3;
        const beach = x >= 3 && x < 5;
        heights[demRow * size + col] = basin ? .4 : beach ? .5 : x > 5 ? 0 : 8;
      }
    }
    const mask = coastalFloodMask(
      [
        [[5, -10], [5, 10]],
        [[-6, -10], [-6, -3], [-2, -3], [-2, -10]]
      ],
      "east",
      size,
      size,
      10,
      10,
      { heightsNorthToSouth: heights }
    );
    const at = (x: number, z: number) => {
      const col = Math.round((x + 10) / 20 * (size - 1));
      const row = Math.round((z + 10) / 20 * (size - 1));
      return mask[row * size + col];
    };
    expect(at(7, 0)).toBe(1);
    expect(at(-4, -6)).toBe(1);
    expect(at(4, 0)).toBe(0);
    expect(at(-8, 0)).toBe(0);
    expect(at(-4, 5)).toBe(0);
  });
});
