import { describe, expect, it } from "vitest";
import { classifyWindForBeach, windFlowVector } from "../src/wind/windDirection";

const northSouthBeach = {
  shoreline: { start: { x: 0, z: 0 }, end: { x: 0, z: 1000 } },
  seaSide: "east" as const
};

describe("viento respecto a la playa", () => {
  it("transforma dirección meteorológica de origen en vector de avance", () => {
    expect(windFlowVector(90).x).toBeCloseTo(-1);
    expect(windFlowVector(270).x).toBeCloseTo(1);
  });

  it("clasifica Levante como viento de mar en una costa con mar al este", () => {
    expect(classifyWindForBeach(90, northSouthBeach)).toBe("onshore");
  });

  it("clasifica Poniente como viento de tierra", () => {
    expect(classifyWindForBeach(270, northSouthBeach)).toBe("offshore");
  });

  it("distingue el sentido de un viento lateral", () => {
    expect(classifyWindForBeach(180, northSouthBeach)).toBe("lateral-north");
    expect(classifyWindForBeach(0, northSouthBeach)).toBe("lateral-south");
  });
});
