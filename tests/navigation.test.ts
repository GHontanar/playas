import { describe, expect, it } from "vitest";
import { beaches, municipalities } from "../src/beaches/catalog";
import {
  getRegion,
  municipalitiesOfRegion,
  regionAssets,
  regionHref,
  regionOfMunicipality,
  regions
} from "../src/regions/catalog";
import { beachCrumbs, municipalityCrumbs, municipalityChipsHtml, regionCrumbs } from "../src/nav/breadcrumb";

/**
 * La jerarquía tiene cuatro niveles —índice, comarca, costa y playa— y cada uno
 * enlaza al de arriba y al de abajo. Aquí se comprueba que ningún enlace apunte
 * a un identificador que no existe: es el fallo que no da error en el navegador,
 * solo lleva al sitio equivocado, porque cada nivel resuelve un desconocido con
 * su primer elemento.
 */

describe("catálogo comarcal", () => {
  it("cada municipio pertenece a una comarca declarada", () => {
    for (const municipality of municipalities) {
      const region = regionOfMunicipality(municipality);
      expect(region.id, `${municipality.id} apunta a una comarca inexistente`).toBe(municipality.regionId);
      expect(municipalitiesOfRegion(region).map((item) => item.id)).toContain(municipality.id);
    }
  });

  it("cada comarca tiene al menos una costa con maqueta", () => {
    for (const region of regions) {
      expect(municipalitiesOfRegion(region).length, `${region.id} no tiene costas`).toBeGreaterThan(0);
    }
  });

  it("los rótulos que enlazan apuntan a municipios del catálogo", () => {
    for (const region of regions) {
      const own = new Set(municipalitiesOfRegion(region).map((municipality) => municipality.id));
      for (const anchor of region.anchors) {
        if (!anchor.municipalityId) continue;
        expect(own, `${region.id}/${anchor.name} enlaza fuera de su comarca`).toContain(anchor.municipalityId);
      }
    }
  });

  it("cada costa con maqueta está rotulada en su comarca", () => {
    for (const region of regions) {
      const linked = new Set(region.anchors.map((anchor) => anchor.municipalityId).filter(Boolean));
      for (const municipality of municipalitiesOfRegion(region)) {
        expect(linked, `${municipality.id} no tiene rótulo en ${region.id}`).toContain(municipality.id);
      }
    }
  });

  it("las paradas del recorrido usan anclas existentes", () => {
    for (const region of regions) {
      const names = new Set(region.anchors.map((anchor) => anchor.name));
      for (const sector of region.sectors) {
        expect(sector.anchors.length, `${region.id}/${sector.name} sin anclas`).toBeGreaterThan(0);
        for (const name of sector.anchors) {
          expect(names, `${region.id}/${sector.name} cita un ancla que no existe`).toContain(name);
        }
      }
    }
  });

  it("las anclas caen dentro del recorte de su comarca", () => {
    for (const region of regions) {
      for (const anchor of region.anchors) {
        expect(anchor.x, `${anchor.name} fuera del bloque`).toBeGreaterThanOrEqual(region.bounds.west);
        expect(anchor.x, `${anchor.name} fuera del bloque`).toBeLessThanOrEqual(region.bounds.east);
        expect(anchor.y, `${anchor.name} fuera del bloque`).toBeGreaterThanOrEqual(region.bounds.south);
        expect(anchor.y, `${anchor.name} fuera del bloque`).toBeLessThanOrEqual(region.bounds.north);
      }
    }
  });

  it("una comarca desconocida cae en la primera, no en undefined", () => {
    expect(getRegion("no-existe").id).toBe(regions[0].id);
    expect(getRegion(null).id).toBe(regions[0].id);
  });

  it("la miniatura y el bloque completo no comparten rutas", () => {
    for (const region of regions) {
      const full = regionAssets(region);
      const thumbnail = regionAssets(region, "thumbnail");
      expect(thumbnail.dem).not.toBe(full.dem);
      expect(thumbnail.sea).not.toBe(full.sea);
      expect(thumbnail.land).not.toBe(full.land);
      // Las bandas batimétricas no dependen de la resolución: se reutilizan.
      expect(thumbnail.seaMetadata).toBe(full.seaMetadata);
    }
  });
});

describe("migas de pan", () => {
  it("la ruta de una playa recorre índice, comarca, costa y playa", () => {
    const beach = beaches.find((candidate) => candidate.id === "ventanicas")!;
    const crumbs = beachCrumbs(beach);
    expect(crumbs).toHaveLength(4);
    expect(crumbs[0].href).toBe("/");
    expect(crumbs[1].href).toBe("/region/?region=levante");
    expect(crumbs[2].href).toBe("/coast/?municipality=mojacar");
    expect(crumbs[3].label).toBe(beach.name);
    // El nivel actual se rotula, pero no enlaza a sí mismo.
    expect(crumbs[3].href).toBeUndefined();
  });

  it("cada playa del catálogo produce una ruta completa y navegable", () => {
    for (const beach of beaches) {
      const crumbs = beachCrumbs(beach);
      expect(crumbs, beach.id).toHaveLength(4);
      expect(crumbs.slice(0, 3).every((crumb) => crumb.href), `${beach.id} tiene un eslabón sin enlace`).toBe(true);
      expect(crumbs[3].label).toBe(beach.name);
    }
  });

  it("la costa enlaza hacia arriba con la comarca a la que pertenece", () => {
    for (const municipality of municipalities) {
      const crumbs = municipalityCrumbs(municipality);
      expect(crumbs[1].href).toBe(regionHref(regionOfMunicipality(municipality)));
      expect(crumbs[2].label).toBe(municipality.name);
    }
  });

  it("la comarca solo enlaza hacia el índice", () => {
    for (const region of regions) {
      const crumbs = regionCrumbs(region);
      expect(crumbs).toHaveLength(2);
      expect(crumbs[0].href).toBe("/");
      expect(crumbs[1].href).toBeUndefined();
    }
  });

  it("las fichas hermanas marcan la costa actual sin enlazarla", () => {
    const html = municipalityChipsHtml(regions[0], "mojacar");
    expect(html).toContain('<span aria-current="page">Mojácar</span>');
    expect(html).not.toContain('href="/coast/?municipality=mojacar"');
    expect(html).toContain('href="/coast/?municipality=carboneras"');
  });
});
