import { describe, expect, it } from "vitest";
import {
  sunCalcAnglesToVector,
  sunCalcAzimuthToBearing,
  sunVectorForWorldAxes
} from "../src/solar/sunVector";

describe("transformación solar a ejes Three.js", () => {
  it("convierte el sur de SunCalc en bearing norte", () => {
    expect(sunCalcAzimuthToBearing(0)).toBeCloseTo(180);
  });

  it("apunta al sur al mediodía con elevación cero", () => {
    expect(sunCalcAnglesToVector(0, 0)).toEqual({ x: -0, y: 0, z: -1 });
  });

  it("apunta al este cuando SunCalc informa -90°", () => {
    const vector = sunCalcAnglesToVector(-Math.PI / 2, 0);
    expect(vector.x).toBeCloseTo(1);
    expect(vector.z).toBeCloseTo(0);
  });

  it("apunta verticalmente en el cénit", () => {
    const vector = sunCalcAnglesToVector(1.2, Math.PI / 2);
    expect(vector.x).toBeCloseTo(0);
    expect(vector.y).toBeCloseTo(1);
    expect(vector.z).toBeCloseTo(0);
  });

  it("invierte norte-sur al usar el sistema dextrógiro este-arriba-sur", () => {
    expect(sunVectorForWorldAxes({ x: 1, y: 2, z: 3 }, "south-positive"))
      .toEqual({ x: 1, y: 2, z: -3 });
    expect(sunVectorForWorldAxes({ x: 1, y: 2, z: 3 }, "north-positive"))
      .toEqual({ x: 1, y: 2, z: 3 });
  });
});
