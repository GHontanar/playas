import { describe, expect, it } from "vitest";
import {
  normaliseFlagSource,
  normaliseLifeguardServiceSource,
  lifeguardServiceAt,
  normaliseJellyfishSource
  , parseCarbonerasStations,
  carbonerasServiceAt
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

  it.each([
    ["banner-mini-verde.gif", "active"],
    ["banner-mini-amarilla.gif", "active"],
    ["banner-mini-roja.gif", "active"],
    ["https://example.test/banner-mini-sin.gif?v=2", "inactive"],
    ["", "unknown"],
    ["otro-formato.png", "unknown"]
  ])("distingue el servicio de socorrismo de %s", (source, expected) => {
    expect(normaliseLifeguardServiceSource(source)).toBe(expected);
  });

  it("cierra a las 19:00 entre semana en temporada alta", () => {
    expect(lifeguardServiceAt(new Date("2026-07-31T16:59:00Z"), "01")).toBe("active");
    expect(lifeguardServiceAt(new Date("2026-07-31T17:00:00Z"), "01")).toBe("inactive");
  });

  it("amplía hasta las 20:00 los fines de semana de julio y agosto", () => {
    expect(lifeguardServiceAt(new Date("2026-08-01T17:59:00Z"), "04")).toBe("active");
    expect(lifeguardServiceAt(new Date("2026-08-01T18:00:00Z"), "04")).toBe("inactive");
  });

  it("limita las fechas periféricas a las cuatro playas con servicio", () => {
    expect(lifeguardServiceAt(new Date("2026-09-05T10:00:00Z"), "12")).toBe("active");
    expect(lifeguardServiceAt(new Date("2026-09-05T10:00:00Z"), "04")).toBe("inactive");
  });

  it("no inventa el calendario de futuras temporadas", () => {
    expect(lifeguardServiceAt(new Date("2027-07-31T10:00:00Z"), "01")).toBe("unknown");
  });
});

describe("estado de Protección Civil Carboneras", () => {
  it("extrae puestos, bandera y ausencia explícita de socorrismo", () => {
    const rows = parseCarbonerasStations(`const beaches = [
      ["Playa El Ancón", 37.00589, -1.889062, 3, 'Baño libre'],
      ["Playa de Los Muertos", 36.952892, -1.898686, 2, 'Baño con precaución' + "<br>(SIN SERVICIO DE SOCORRISMO)"]
    ];`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ name: "Playa El Ancón", level: 3, noService: false });
    expect(rows[1]).toMatchObject({ name: "Playa de Los Muertos", level: 2, noService: true });
  });

  it("aplica el horario municipal 11:00–20:00", () => {
    expect(carbonerasServiceAt(new Date("2026-07-31T09:00:00Z"))).toBe("active");
    expect(carbonerasServiceAt(new Date("2026-07-31T18:00:00Z"))).toBe("inactive");
    expect(carbonerasServiceAt(new Date("2027-07-31T10:00:00Z"))).toBe("unknown");
  });
});
