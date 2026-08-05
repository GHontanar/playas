import { municipalities, type MunicipalityCatalog } from "../beaches/catalog";
import { getRegion, type RegionCatalog } from "./catalog";

/**
 * El puente entre los dos catálogos: qué costas tiene una comarca y a qué
 * comarca pertenece una costa.
 *
 * Vive aparte de `catalog.ts` por una razón de peso, literal. Estas dos
 * funciones son lo único del nivel comarcal que necesita el catálogo de playas,
 * y este arrastra las 31 fichas al importarlas. Con ellas dentro de
 * `catalog.ts`, el índice —que solo quiere el nombre y el recorte de cada
 * comarca para dibujar dos miniaturas— se llevaba las 31 playas por delante.
 */

/** Los municipios con vista de costa de una comarca, en el orden del catálogo. */
export function municipalitiesOfRegion(region: RegionCatalog): MunicipalityCatalog[] {
  return municipalities.filter((municipality) => municipality.regionId === region.id);
}

/** La comarca a la que pertenece un municipio del catálogo. */
export function regionOfMunicipality(municipality: MunicipalityCatalog): RegionCatalog {
  return getRegion(municipality.regionId);
}
