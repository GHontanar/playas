import { describe, expect, it } from "vitest";
import rawConfig from "../src/beaches/ventanicas.json";
import { parseBeachConfig } from "../src/beaches/types";
import { createChunkBase } from "../src/map/chunkBase";

describe("zócalo tridimensional del chunk", () => {
  it("crea caras, fondo y acabado ilustrado a la profundidad configurada", () => {
    const config = parseBeachConfig(rawConfig);
    const heights = new Float32Array(config.terrain.width * config.terrain.height);
    const base = createChunkBase(heights, {
      width: config.terrain.width,
      height: config.terrain.height,
      bounds: config.projectedBounds,
      depthMeters: config.chunk.depthMeters,
      verticalExaggeration: config.terrain.verticalExaggeration,
      visualStyle: config.visualStyle
    });
    expect(base.group.children).toHaveLength(4);
    expect(base.group.children[1].position.y).toBe(-config.chunk.depthMeters);
    expect(base.group.children.some((child) => child.type === "LineLoop")).toBe(true);
    expect(base.group.children.some((child) =>
      child.position.y === -config.chunk.depthMeters - 1.2
    )).toBe(true);
    base.setExaggeration(2);
    base.dispose();
  });
});
