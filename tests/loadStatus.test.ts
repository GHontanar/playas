import { afterEach, describe, expect, it, vi } from "vitest";
import { municipalities } from "../src/beaches/catalog";
import { loadObservedStatus } from "../src/status/loadStatus";
import type { ObservedStatusResponse } from "../src/status/types";

/**
 * La lectura del estado oficial. Su modo de fallo interesante no es el error,
 * es el falso acierto: un entorno sin la Pages Function montada responde a
 * `/api/status` con el HTML de la aplicación y un 200, así que `response.ok` es
 * cierto y el fallo llegaba como un error de sintaxis de JSON. Las vistas
 * tratan cualquier fallo de estado como «sin datos» y dejan las franjas sin
 * color, de modo que el síntoma era una costa apagada sin explicación.
 */

const respondWith = (body: string, init: ResponseInit = {}) => {
  globalThis.fetch = vi.fn(async () => new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init
  })) as unknown as typeof fetch;
};

afterEach(() => vi.restoreAllMocks());

describe("estado observado", () => {
  it("devuelve las playas que trae la respuesta", async () => {
    const payload: ObservedStatusResponse = {
      fetchedAt: "2026-08-04T09:00:00.000Z",
      beaches: [{
        beachId: "ventanicas",
        flag: "yellow",
        lifeguardService: "active",
        jellyfish: false,
        observedAtLocal: "04-08-2026 11:08",
        source: "gestiondeplayas"
      }]
    };
    respondWith(JSON.stringify(payload));
    await expect(loadObservedStatus(false, "mojacar")).resolves.toEqual(payload.beaches);
  });

  it("rechaza el HTML de la aplicación servido con un 200", async () => {
    // Exactamente lo que devolvía `vite dev` antes de montar `functions/api/*`.
    respondWith("<!doctype html><html><body><div id=\"app\"></div></body></html>", {
      headers: { "content-type": "text/html" }
    });
    await expect(loadObservedStatus(false, "mojacar")).rejects.toThrow(/no devolvió JSON/);
  });

  it("menciona la Pages Function, que es lo que suele faltar", async () => {
    respondWith("<!doctype html>", { headers: { "content-type": "text/html" } });
    await expect(loadObservedStatus(false, "mojacar")).rejects.toThrow(/Pages Function/);
  });

  it("propaga el código cuando el endpoint falla de verdad", async () => {
    respondWith("", { status: 502 });
    await expect(loadObservedStatus(false, "mojacar")).rejects.toThrow(/502/);
  });

  it("pide el municipio que se le pasa", async () => {
    respondWith(JSON.stringify({ fetchedAt: "", beaches: [] }));
    await loadObservedStatus(false, "barreiros");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/status?municipality=barreiros",
      expect.objectContaining({ headers: { Accept: "application/json" } })
    );
  });
});

describe("modo de demostración", () => {
  it("no toca la red", async () => {
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
    await loadObservedStatus(true, "mojacar");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("inventa estados solo para playas que existen en el municipio", async () => {
    for (const municipality of municipalities) {
      const statuses = await loadObservedStatus(true, municipality.id);
      const real = new Set(municipality.beaches.map((beach) => beach.id));
      for (const status of statuses) {
        expect(real, `${municipality.id}: ${status.beachId} no está en el catálogo`)
          .toContain(status.beachId);
      }
      expect(statuses.length, municipality.id).toBe(municipality.beaches.length);
    }
  });
});
