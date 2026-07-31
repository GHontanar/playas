import { describe, expect, it } from "vitest";
import {
  normaliseFlagSource,
  normaliseJellyfishSource
} from "../worker/playas-mojacar-proxy.js";

describe("normalización semántica de banners", () => {
  it.each([
    ["banner-mini-verde.gif", "green"],
    ["banner-mini-amarilla.gif", "yellow"],
    ["banner-mini-roja.gif", "red"],
    ["https://example.test/banner-mini-verde.gif?v=2", "green"],
    ["banner-mini-sin.gif", "unknown"],
    ["otro-formato.png", "unknown"]
  ])("convierte %s en %s", (source, expected) => {
    expect(normaliseFlagSource(source)).toBe(expected);
  });

  it("mantiene medusas como dimensión independiente", () => {
    expect(normaliseJellyfishSource("banner-mini-medusas.gif")).toBe(true);
    expect(normaliseJellyfishSource("banner-mini-blanca.gif")).toBe(false);
    expect(normaliseJellyfishSource("")).toBeNull();
  });
});
