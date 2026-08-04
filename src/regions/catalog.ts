import { municipalities, type MunicipalityCatalog, type MunicipalityId } from "../beaches/catalog";

/**
 * El nivel comarcal: el bloque de 50 m que enseña de una vez toda la costa que
 * el catálogo cubre por municipios. Nació como dos spikes gemelos —Levante y
 * Mariña— con las mismas 780 líneas y solo las anclas cambiadas; aquí queda
 * únicamente lo que de verdad distingue una comarca de otra, y el recorrido lo
 * monta `region-main.ts` a partir de esta ficha.
 */

export type RegionId = "levante" | "marina-lucense";

export interface RegionAnchor {
  name: string;
  /** UTM del huso de la comarca: 30N en Almería, 29N en la Mariña. */
  x: number;
  y: number;
  /** Municipio con vista de costa, cuando lo hay. Sin él el lugar se rotula pero no enlaza. */
  municipalityId?: MunicipalityId;
}

export interface RegionSector {
  name: string;
  /** Anclas que encuadra esta parada del recorrido. */
  anchors: string[];
}

export interface RegionCatalog {
  id: RegionId;
  /** Rótulo grande de la escena. */
  name: string;
  /** Segunda línea del rótulo y del índice: qué recorte es, exactamente. */
  subtitle: string;
  /** Prefijo de los assets comarcales bajo `/terrain/assets` y `/metadata`. */
  assets: string;
  bounds: { west: number; south: number; east: number; north: number };
  /** Centro del recorte, para el Sol. */
  centre: { lat: number; lon: number };
  /** Mar abierto en coordenadas de escena; corre los rótulos y los sectores hacia el agua. */
  seaward: { x: number; z: number };
  /** Repeticiones del normal map del agua sobre el bloque, ajustadas a su tamaño. */
  waveRepeat: { x: number; y: number };
  anchors: RegionAnchor[];
  sectors: RegionSector[];
}

export const regions: RegionCatalog[] = [
  {
    id: "levante",
    name: "Almería",
    // «Almería» a secas prometería la provincia entera, que no es el recorte.
    subtitle: "Levante y Cabo de Gata",
    assets: "levante",
    bounds: { west: 557600, south: 4060000, east: 612000, north: 4125000 },
    centre: { lat: 36.936, lon: -2.055 },
    // El mar queda al sureste del recorte en coordenadas de escena.
    seaward: { x: 1, z: 1 },
    waveRepeat: { x: 46, y: 55 },
    // El orden es la prioridad al descartar solapes: primero los municipios que
    // tienen maqueta. Vera sale del punto medio del litoral de su overview
    // municipal, `vera-coast`, no de una coordenada escrita a mano. Villaricos
    // es Cuevas del Almanzora y los tres del cabo son Níjar y Almería, que
    // todavía no tienen catálogo: se rotulan, pero no enlazan.
    anchors: [
      { name: "Mojácar", x: 602204, y: 4105475, municipalityId: "mojacar" },
      { name: "Carboneras", x: 598324, y: 4095110, municipalityId: "carboneras" },
      { name: "Garrucha", x: 604992, y: 4116428, municipalityId: "garrucha" },
      { name: "Vera", x: 605909, y: 4118751, municipalityId: "vera" },
      { name: "Cabo de Gata", x: 572181, y: 4064283 },
      { name: "Las Negras", x: 584042, y: 4081532 },
      { name: "Villaricos", x: 608822, y: 4122979 },
      { name: "San Miguel", x: 567987, y: 4071737 }
    ],
    // El interior solo interesa en la vista general. A partir de ahí el
    // recorrido baja la costa en tramos cortos y muy cerrados, uno por parada.
    sectors: [
      { name: "De Villaricos a Garrucha", anchors: ["Villaricos", "Vera", "Garrucha"] },
      { name: "Mojácar", anchors: ["Mojácar"] },
      { name: "Carboneras", anchors: ["Carboneras"] },
      { name: "Níjar · Las Negras", anchors: ["Las Negras"] },
      { name: "Cabo de Gata", anchors: ["Cabo de Gata", "San Miguel"] }
    ]
  },
  {
    id: "marina-lucense",
    name: "Mariña de Lugo",
    subtitle: "Costa cantábrica · O Vicedo – Ribadeo",
    assets: "lugo",
    bounds: { west: 609215, south: 4799988, east: 661153, north: 4849303 },
    centre: { lat: 43.62, lon: -7.49 },
    // El Cantábrico queda al norte del recorte en coordenadas de escena.
    seaward: { x: 0, z: -1 },
    waveRepeat: { x: 48, y: 58 },
    // Oeste→este por la costa. Coordenadas en UTM 29N (EPSG:25829).
    anchors: [
      { name: "O Vicedo", x: 611705, y: 4833016 },
      { name: "Viveiro", x: 613111, y: 4835021 },
      { name: "Xove", x: 622608, y: 4840362 },
      { name: "San Cibrao", x: 627457, y: 4838911 },
      { name: "Burela", x: 629324, y: 4837489 },
      { name: "Foz", x: 641218, y: 4825511 },
      { name: "Barreiros", x: 648507, y: 4823944, municipalityId: "barreiros" },
      { name: "Ribadeo", x: 658593, y: 4822920 }
    ],
    sectors: [
      { name: "De O Vicedo a Viveiro", anchors: ["O Vicedo", "Viveiro"] },
      { name: "Xove y San Cibrao", anchors: ["Xove", "San Cibrao"] },
      { name: "Burela y Foz", anchors: ["Burela", "Foz"] },
      { name: "Barreiros", anchors: ["Barreiros"] },
      { name: "Ribadeo", anchors: ["Ribadeo"] }
    ]
  }
];

export function getRegion(id: string | null): RegionCatalog {
  return regions.find((region) => region.id === id) ?? regions[0];
}

/** La comarca a la que pertenece un municipio del catálogo. */
export function regionOfMunicipality(municipality: MunicipalityCatalog): RegionCatalog {
  return getRegion(municipality.regionId);
}

/** Los municipios con vista de costa de una comarca, en el orden del catálogo. */
export function municipalitiesOfRegion(region: RegionCatalog): MunicipalityCatalog[] {
  return municipalities.filter((municipality) => municipality.regionId === region.id);
}

export function regionHref(region: RegionCatalog): string {
  return `/region/?region=${region.id}`;
}

/**
 * Rutas de los derivados comarcales. La miniatura del índice usa la misma
 * rejilla diezmada ocho veces: el mismo bloque, no una captura aparte. Las
 * bandas batimétricas no dependen de la resolución, así que se comparten.
 */
export function regionAssets(region: RegionCatalog, variant: "full" | "thumbnail" = "full") {
  const prefix = variant === "thumbnail" ? `${region.assets}-thumb` : region.assets;
  return {
    dem: `/terrain/assets/${prefix}-dem.f32`,
    sea: `/terrain/assets/${prefix}-sea.u8`,
    land: `/terrain/assets/${prefix}-land.u8`,
    demMetadata: `/metadata/${prefix}-dem.json`,
    seaMetadata: `/metadata/${region.assets}-sea.json`
  };
}
