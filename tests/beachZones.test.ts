import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { getMunicipality } from "../src/beaches/catalog";
import { FLAG_STATES, LIFEGUARD_SERVICE_STATES, type ObservedBeachStatus } from "../src/status/types";
import { alongOf } from "../src/map/coastalOrientation";
import { createBeachZones, zoneAppearance } from "../src/map/beachZones";

/**
 * Las franjas de baño del overview municipal son la parte del sistema donde
 * equivocarse tiene consecuencias para quien va a bañarse: dicen qué playa está
 * en qué bandera. Hasta aquí eran 302 líneas sin una sola prueba.
 *
 * Se comprueban dos cosas distintas. La regla de pintado, que es lógica pura y
 * se puede recorrer entera. Y el montaje de la capa contra la costa DERA real
 * de Mojácar, porque una franja bien coloreada pero puesta sobre otra playa
 * miente igual.
 */

const status = (over: Partial<ObservedBeachStatus> = {}): ObservedBeachStatus => ({
  beachId: "ventanicas",
  flag: "green",
  lifeguardService: "active",
  jellyfish: false,
  observedAtLocal: "04-08-2026 11:08",
  source: "gestiondeplayas",
  ...over
});

describe("regla de pintado de una franja", () => {
  it("solo colorea con servicio activo y bandera conocida", () => {
    for (const flag of FLAG_STATES) {
      for (const service of LIFEGUARD_SERVICE_STATES) {
        const { opacity } = zoneAppearance(status({ flag, lifeguardService: service }), false);
        const debeColorear = service === "active" && flag !== "unknown";
        expect(opacity > 0, `bandera ${flag} con servicio ${service}`).toBe(debeColorear);
      }
    }
  });

  it("no infiere color cuando el servicio está inactivo, aunque la bandera sea verde", () => {
    // Una bandera verde retenida después del cierre no es playa vigilada.
    expect(zoneAppearance(status({ lifeguardService: "inactive" }), false).opacity).toBe(0);
    expect(zoneAppearance(status({ lifeguardService: "unknown" }), false).opacity).toBe(0);
  });

  it("una playa sin observación queda transparente y en color neutro", () => {
    const sinDato = zoneAppearance(undefined, false);
    expect(sinDato.opacity).toBe(0);
    expect(sinDato.colour).toBe(zoneAppearance(status({ flag: "unknown" }), false).colour);
  });

  it("cada bandera tiene su color y ninguno se repite", () => {
    const colores = FLAG_STATES.map((flag) => zoneAppearance(status({ flag }), false).colour);
    expect(new Set(colores).size).toBe(FLAG_STATES.length);
  });

  it("el resaltado sube la opacidad pero no inventa color", () => {
    const conDato = status();
    expect(zoneAppearance(conDato, true).opacity)
      .toBeGreaterThan(zoneAppearance(conDato, false).opacity);
    // Sin dato, resaltar deja un velo neutro: visible, pero no una bandera.
    const sinDato = zoneAppearance(undefined, true);
    expect(sinDato.opacity).toBeGreaterThan(0);
    expect(sinDato.opacity).toBeLessThan(zoneAppearance(conDato, false).opacity);
  });
});

describe("capa de franjas sobre la costa de Mojácar", () => {
  const municipality = getMunicipality("mojacar");
  const overview = municipality.overview;
  let layer: Awaited<ReturnType<typeof createBeachZones>>;

  beforeAll(async () => {
    stubBrowserCanvas();
    stubFetchFromPublic();
    // Relieve plano: la cota solo eleva la franja sobre el terreno, no decide
    // dónde cae, que es lo que se comprueba aquí.
    const heights = new Float32Array(overview.terrain.width * overview.terrain.height);
    layer = await createBeachZones(overview, heights, municipality.beaches);
  });

  it("crea una franja por playa, identificada por su id", () => {
    expect(layer.meshes).toHaveLength(municipality.beaches.length);
    expect(layer.meshes.map((mesh) => mesh.userData.beachId))
      .toEqual(municipality.beaches.map((beach) => beach.id));
  });

  it("cada franja cae sobre el tramo litoral de su propia playa", () => {
    const side = overview.seaSide;
    const centreX = (overview.projectedBounds.west + overview.projectedBounds.east) / 2;
    const centreZ = (overview.projectedBounds.south + overview.projectedBounds.north) / 2;
    const centreAlong = alongOf(side, centreX, centreZ);
    for (const [index, mesh] of layer.meshes.entries()) {
      const beach = municipality.beaches[index];
      const box = new THREE.Box3().setFromObject(mesh);
      const middle = box.getCenter(new THREE.Vector3());
      const zoneAlong = alongOf(side, middle.x, middle.z);
      const start = alongOf(side, beach.shoreline.start.x, beach.shoreline.start.z) - centreAlong;
      const end = alongOf(side, beach.shoreline.end.x, beach.shoreline.end.z) - centreAlong;
      const padding = beach.overviewZonePaddingMeters;
      expect(zoneAlong, `${beach.id} fuera de su tramo`)
        .toBeGreaterThanOrEqual(Math.min(start, end) - padding - 1);
      expect(zoneAlong, `${beach.id} fuera de su tramo`)
        .toBeLessThanOrEqual(Math.max(start, end) + padding + 1);
    }
  });

  it("las franjas siguen el orden del catálogo por la costa, sin cruzarse", () => {
    const side = overview.seaSide;
    const centres = layer.meshes.map((mesh) => {
      const middle = new THREE.Box3().setFromObject(mesh).getCenter(new THREE.Vector3());
      return alongOf(side, middle.x, middle.z);
    });
    // El catálogo de Mojácar baja de norte a sur, así que la serie es monótona
    // decreciente. Lo que importa no es el sentido, sino que ninguna franja se
    // salga de la secuencia: eso delataría un tramo litoral mal asignado.
    const steps = centres.slice(1).map((value, index) => value - centres[index]);
    const decreciente = steps.every((step) => step < 0);
    const creciente = steps.every((step) => step > 0);
    expect(decreciente || creciente, `centros fuera de secuencia: ${centres.join(", ")}`).toBe(true);
  });

  it("aplica el estado a la playa que le corresponde", () => {
    layer.setStatuses([
      { ...status({ beachId: "ventanicas", flag: "red" }) },
      { ...status({ beachId: "el-cantal", flag: "yellow" }) },
      // Una playa de otro municipio no debe pintar nada aquí.
      { ...status({ beachId: "carboneras-ancon", flag: "green" }) }
    ]);
    const colourOf = (id: string) => {
      const mesh = layer.meshes.find((candidate) => candidate.userData.beachId === id)!;
      return (mesh.material as THREE.MeshBasicMaterial);
    };
    expect(colourOf("ventanicas").color.getHexString())
      .toBe(new THREE.Color(zoneAppearance(status({ flag: "red" }), false).colour).getHexString());
    expect(colourOf("el-cantal").color.getHexString())
      .toBe(new THREE.Color(zoneAppearance(status({ flag: "yellow" }), false).colour).getHexString());
    // Las que no venían en la respuesta se quedan sin pintar.
    expect(colourOf("lance-nuevo").opacity).toBe(0);
  });

  it("una respuesta vacía deja todas las franjas sin color", () => {
    layer.setStatuses([]);
    for (const mesh of layer.meshes) {
      expect((mesh.material as THREE.MeshBasicMaterial).opacity, String(mesh.userData.beachId)).toBe(0);
    }
  });

  it("los separadores solo aparecen cuando se piden", () => {
    const separators = layer.group.children.find((child) => child.name === "beach-zone-separators")!;
    const material = (separators as THREE.Mesh).material as THREE.MeshBasicMaterial;
    layer.setSeparatorsVisible(false);
    expect(material.opacity).toBe(0);
    layer.setSeparatorsVisible(true);
    expect(material.opacity).toBeGreaterThan(0);
  });
});

/**
 * `createBeachLabel` rotula sobre un lienzo 2D del navegador. Aquí solo importa
 * que la capa se monte, no lo que ponga el rótulo, así que basta un doble que
 * acepte las llamadas de dibujo sin hacer nada.
 */
function stubBrowserCanvas() {
  const context = {
    fillStyle: "", font: "", textAlign: "", textBaseline: "",
    beginPath() {}, roundRect() {}, fill() {}, fillText() {},
    measureText: () => ({ width: 100 })
  };
  globalThis.document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context })
  } as unknown as Document;
}

/** Sirve `public/` como si fuera el servidor, para usar la costa DERA real. */
function stubFetchFromPublic() {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const path = new URL(String(input), "http://localhost").pathname;
    return new Response(await readFile(`public${path}`));
  }) as typeof fetch;
}
