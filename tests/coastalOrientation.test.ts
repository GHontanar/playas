import { describe, expect, it } from "vitest";
import {
  coastAt,
  coastlineEnvelope,
  coastalFloodMask,
  isPointInPolygon,
  isSeaPoint,
  landPolygonFromCoastlines,
  seawardNormal
} from "../src/map/coastalOrientation";

const coast: Array<[number, number]> = [[0, 0], [10, 100], [30, 200]];

describe("orientación costa-mar de Ventanicas (mar al este)", () => {
  it("interpola la X de costa en coordenadas métricas", () => {
    expect(coastAt(coast, 50, "east")).toBeCloseTo(5);
    expect(coastAt(coast, 150, "east")).toBeCloseTo(20);
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
    const envelope = coastlineEnvelope([
      [[0, 0], [2, 10]],
      [[5, 0], [3, 10]]
    ], "east", 1);
    // Un cubo sin vértices se resuelve muestreando el tramo, no heredando el
    // ramal interior: ningún punto sale de la rama de X pequeña.
    expect(envelope).toHaveLength(11);
    for (const [x, z] of envelope) expect(x).toBeGreaterThan(z * .2);
  });

  it("conserva un espigón que vuelve sobre sí mismo en la máscara poligonal", () => {
    const polygon = landPolygonFromCoastlines([
      [[0, -50], [0, -20]],
      [[0, -20], [30, -20], [30, 20], [0, 20]],
      [[0, 20], [0, 50]]
    ], "east", 60, 60);
    expect(isPointInPolygon([20, 0], polygon)).toBe(true);
    expect(isPointInPolygon([40, 0], polygon)).toBe(false);
    expect(isPointInPolygon([-20, 0], polygon)).toBe(true);
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

describe("orientación costa-mar de Barreiros (mar al norte)", () => {
  const northCoast: Array<[number, number]> = [[0, 0], [100, 10], [200, 30]];

  it("interpola la Z de costa a partir de la X", () => {
    expect(coastAt(northCoast, 50, "north")).toBeCloseTo(5);
    expect(coastAt(northCoast, 150, "north")).toBeCloseTo(20);
  });

  it("clasifica como mar únicamente el lado septentrional y respeta el margen", () => {
    expect(isSeaPoint(northCoast, 150, 22, "north", 1.5)).toBe(true);
    expect(isSeaPoint(northCoast, 150, 21, "north", 1.5)).toBe(false);
    expect(isSeaPoint(northCoast, 150, 19, "north")).toBe(false);
  });

  it("orienta la normal de las rompientes hacia Z UTM positiva", () => {
    const normal = seawardNormal(10, 0, "north");
    expect(normal.z).toBeCloseTo(1);
    expect(normal.x).toBeCloseTo(0);
  });

  it("reduce ramales costeros al borde exterior septentrional", () => {
    const envelope = coastlineEnvelope([
      [[0, 0], [10, 2]],
      [[0, 5], [10, 3]]
    ], "north", 1);
    expect(envelope).toHaveLength(11);
    for (const [x, z] of envelope) expect(z).toBeGreaterThan(x * .2);
  });

  it("cierra la bocana de la ría en vez de descolgarse hasta la orilla interior", () => {
    const envelope = coastlineEnvelope([
      [[-100, 0], [-20, 0]],
      [[20, 0], [100, 0]],
      // Orillas del estuario: entran 400 m tierra adentro por una boca de 40 m.
      [[-20, 0], [-20, -400], [20, -400], [20, 0]]
    ], "north", 4);
    for (const [, z] of envelope) expect(z).toBeGreaterThan(-1);
  });

  it("conserva una ensenada más ancha que profunda", () => {
    const envelope = coastlineEnvelope([
      [[-300, 0], [-200, 0]],
      [[200, 0], [300, 0]],
      [[-200, 0], [-200, -40], [200, -40], [200, 0]]
    ], "north", 4);
    expect(Math.min(...envelope.map(([, z]) => z))).toBeCloseTo(-40);
  });

  it("cierra el polígono terrestre por el lado sur", () => {
    const polygon = landPolygonFromCoastlines([
      [[-10, 0], [10, 0]]
    ], "north", 10, 10);
    expect(isPointInPolygon([0, -5], polygon)).toBe(true);
    expect(isPointInPolygon([0, 5], polygon)).toBe(false);
  });

  it("no se filtra por los huecos de una costa fragmentada", () => {
    const size = 21;
    const heights = new Float32Array(size * size);
    for (let demRow = 0; demRow < size; demRow++) {
      const z = 10 - demRow;
      for (let col = 0; col < size; col++) {
        heights[demRow * size + col] = z > 0 ? 0 : 8;
      }
    }
    const mask = coastalFloodMask(
      [
        [[-10, 0], [-2, 0]],
        [[2, 0], [10, 0]]
      ],
      "north",
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
    expect(at(0, 4)).toBe(1);
    expect(at(5, 4)).toBe(1);
    expect(at(-5, 4)).toBe(1);
    expect(at(0, -4)).toBe(0);
    expect(at(5, -4)).toBe(0);
    expect(at(-5, -4)).toBe(0);
  });

  it("siembra la inundación por el borde norte de la rejilla", () => {
    const mask = coastalFloodMask([
      [[-5, 0], [5, 0]]
    ], "north", 21, 21, 5, 5);
    const at = (x: number, z: number) => {
      const col = Math.round((x + 5) / 10 * 20);
      const row = Math.round((z + 5) / 10 * 20);
      return mask[row * 21 + col];
    };
    expect(at(0, 4)).toBe(1);
    expect(at(0, 0)).toBe(0);
  });
});
