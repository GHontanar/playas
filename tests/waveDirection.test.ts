import { describe, expect, it } from "vitest";
import { waveTravelVector } from "../src/waves/waveDirection";

describe("dirección geográfica del oleaje", () => {
  it("convierte oleaje de Levante en avance hacia tierra al oeste", () => {
    const vector = waveTravelVector(90);
    expect(vector.x).toBeCloseTo(-1);
    expect(vector.z).toBeCloseTo(0);
  });

  it("conserva correctamente los ejes norte y sur", () => {
    expect(waveTravelVector(0).z).toBeCloseTo(-1);
    expect(waveTravelVector(180).z).toBeCloseTo(1);
  });

  it("produce siempre un vector unitario", () => {
    const vector = waveTravelVector(137);
    expect(Math.hypot(vector.x, vector.z)).toBeCloseTo(1);
  });
});
