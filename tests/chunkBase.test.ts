import { describe, expect, it } from "vitest";
import rawConfig from "../src/beaches/ventanicas.json";
import { parseBeachConfig } from "../src/beaches/types";
import { createChunkBase } from "../src/map/chunkBase";

describe("zócalo tridimensional del chunk", () => {
  it("crea caras laterales y fondo a la profundidad configurada", () => {
    const config = parseBeachConfig(rawConfig);
    const heights = new Float32Array(config.terrain.width * config.terrain.height);
    const base = createChunkBase(heights, config);
    expect(base.group.children).toHaveLength(2);
    expect(base.group.children[1].position.y).toBe(-config.chunk.depthMeters);
    base.setExaggeration(2);
    base.dispose();
  });
});
