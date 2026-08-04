import { municipalities, type MunicipalityCatalog } from "../beaches/catalog";
import { getRegion, municipalitiesOfRegion, regionHref, type RegionCatalog } from "../regions/catalog";
import type { BeachConfig } from "../beaches/types";

/**
 * La ruta entre los cuatro niveles: índice, comarca, costa municipal y playa.
 *
 * Los rótulos de la maqueta comarcal y las franjas del overview municipal se
 * pican con el ratón sobre el lienzo, que no es alcanzable con teclado ni
 * anuncia a dónde lleva. Estas migas y las fichas de al lado son la misma
 * navegación en HTML, y son las que hacen que cada nivel se pueda dejar y
 * retomar por su URL.
 */

export interface Crumb {
  label: string;
  /** Sin `href` es el nivel actual: se rotula, pero no enlaza. */
  href?: string;
}

const escapeHtml = (value: string) => value.replace(/[&<>"]/g, (character) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]!);

export function breadcrumbHtml(crumbs: Crumb[]): string {
  const items = crumbs.map((crumb) => crumb.href
    ? `<li><a href="${crumb.href}">${escapeHtml(crumb.label)}</a></li>`
    : `<li aria-current="page">${escapeHtml(crumb.label)}</li>`);
  return `<nav class="scene-nav" aria-label="Ruta"><ol>${items.join("")}</ol></nav>`;
}

export const INDEX_CRUMB: Crumb = { label: "Costas", href: "/" };

export function regionCrumbs(region: RegionCatalog): Crumb[] {
  return [INDEX_CRUMB, { label: region.name }];
}

export function municipalityCrumbs(municipality: MunicipalityCatalog): Crumb[] {
  const region = getRegion(municipality.regionId);
  return [INDEX_CRUMB, { label: region.name, href: regionHref(region) }, { label: municipality.name }];
}

export function beachCrumbs(beach: BeachConfig): Crumb[] {
  const municipality = municipalities.find((item) => item.id === beach.municipalityId) ?? municipalities[0];
  const region = getRegion(municipality.regionId);
  return [
    INDEX_CRUMB,
    { label: region.name, href: regionHref(region) },
    { label: municipality.name, href: `/coast/?municipality=${municipality.id}` },
    { label: beach.name }
  ];
}

/**
 * Los municipios hermanos de una comarca. En la maqueta comarcal es la única
 * vía de teclado hacia las costas; en el overview municipal, la forma de saltar
 * de un municipio a otro sin volver a subir.
 */
export function municipalityChipsHtml(region: RegionCatalog, currentId?: string): string {
  const chips = municipalitiesOfRegion(region).map((municipality) => municipality.id === currentId
    ? `<li><span aria-current="page">${escapeHtml(municipality.name)}</span></li>`
    : `<li><a href="/coast/?municipality=${municipality.id}">${escapeHtml(municipality.name)}</a></li>`);
  return `<nav class="scene-siblings" aria-label="Costas de ${escapeHtml(region.name)}"><ol>${chips.join("")}</ol></nav>`;
}
