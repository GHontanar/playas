import { describe, expect, it } from "vitest";
import { SUN_LIGHT_RADIUS, shadowCameraFar } from "../src/map/shadows";

describe("volumen de sombras", () => {
  it("alcanza el terreno desde la posición de la luz", () => {
    const casterDiameter = 3900;
    expect(shadowCameraFar(casterDiameter)).toBeGreaterThan(SUN_LIGHT_RADIUS);
    expect(shadowCameraFar(casterDiameter) - SUN_LIGHT_RADIUS)
      .toBeGreaterThan(casterDiameter);
  });
});
