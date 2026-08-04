import marina from "./marina-de-la-torre.json";
import descargador from "./descargador.json";
import piedraVillazar from "./piedra-villazar.json";
import elCantal from "./el-cantal.json";
import lanceNuevo from "./lance-nuevo.json";
import ventanicas from "./ventanicas.json";
import ventaDelBancal from "./venta-del-bancal.json";
import mojacarCoast from "./mojacar-coast.json";
import carbonerasCoast from "./carboneras-coast.json";
import carbonerasAncon from "./carboneras-ancon.json";
import carbonerasBarquicos from "./carboneras-barquicos-cocones.json";
import carbonerasMarinicas from "./carboneras-marinicas.json";
import carbonerasPuntica from "./carboneras-puntica.json";
import carbonerasMuertos from "./carboneras-los-muertos.json";
import carbonerasAlgarrobico from "./carboneras-algarrobico.json";
import carbonerasCorral from "./carboneras-corral.json";
import garruchaCoast from "./garrucha-coast.json";
import garruchaPlaya from "./garrucha-playa.json";
import garruchaPosito from "./garrucha-posito.json";
import garruchaPlayazo from "./garrucha-playazo.json";
import veraCoast from "./vera-coast.json";
import veraMarinas from "./vera-marinas-bolaga.json";
import veraPuertoRey from "./vera-puerto-rey.json";
import veraPlayazo from "./vera-playazo.json";
import veraCalaMarques from "./vera-cala-marques.json";
import barreirosCoast from "./barreiros-coast.json";
import barreirosAnguieira from "./barreiros-anguieira.json";
import barreirosAltar from "./barreiros-altar.json";
import barreirosSanBartolo from "./barreiros-san-bartolo.json";
import barreirosRemior from "./barreiros-remior.json";
import barreirosPenaDeSalsa from "./barreiros-pena-de-salsa.json";
import barreirosBenquerencia from "./barreiros-benquerencia.json";
import barreirosAreaDaBalea from "./barreiros-area-da-balea.json";
import barreirosLongara from "./barreiros-longara.json";
import barreirosAPasada from "./barreiros-a-pasada.json";
import barreirosArealonga from "./barreiros-arealonga.json";
import { parseBeachConfig, type BeachConfig } from "./types";

const mojacarBeaches: BeachConfig[] = [
  marina,
  descargador,
  piedraVillazar,
  elCantal,
  lanceNuevo,
  ventanicas,
  ventaDelBancal
].map(parseBeachConfig);

const carbonerasBeaches = [
  carbonerasAlgarrobico,
  carbonerasAncon,
  carbonerasPuntica,
  carbonerasBarquicos,
  carbonerasMarinicas,
  carbonerasCorral,
  carbonerasMuertos
].map(parseBeachConfig);

export type MunicipalityId = "mojacar" | "carboneras" | "garrucha" | "vera" | "barreiros";

export interface MunicipalityCatalog {
  id: MunicipalityId;
  name: string;
  /** Nombre de la comarca, tal y como se rotula en las fichas. */
  region: string;
  /** Comarca del catálogo regional, el nivel que hay por encima de la costa. */
  regionId: "levante" | "marina-lucense";
  overview: BeachConfig;
  beaches: BeachConfig[];
}

export const municipalities: MunicipalityCatalog[] = [
  { id: "mojacar", name: "Mojácar", region: "Levante de Almería", regionId: "levante", overview: parseBeachConfig(mojacarCoast), beaches: mojacarBeaches },
  { id: "carboneras", name: "Carboneras", region: "Levante de Almería", regionId: "levante", overview: parseBeachConfig(carbonerasCoast), beaches: carbonerasBeaches },
  { id: "garrucha", name: "Garrucha", region: "Levante de Almería", regionId: "levante", overview: parseBeachConfig(garruchaCoast), beaches: [garruchaPlaya, garruchaPosito, garruchaPlayazo].map(parseBeachConfig) },
  { id: "vera", name: "Vera", region: "Levante de Almería", regionId: "levante", overview: parseBeachConfig(veraCoast), beaches: [veraMarinas, veraPuertoRey, veraPlayazo, veraCalaMarques].map(parseBeachConfig) },
  { id: "barreiros", name: "Barreiros", region: "A Mariña Lucense", regionId: "marina-lucense", overview: parseBeachConfig(barreirosCoast), beaches: [barreirosAnguieira, barreirosAltar, barreirosSanBartolo, barreirosRemior, barreirosPenaDeSalsa, barreirosBenquerencia, barreirosAreaDaBalea, barreirosLongara, barreirosAPasada, barreirosArealonga].map(parseBeachConfig) }
];
export const beaches = municipalities.flatMap((municipality) => municipality.beaches);
export const coastOverview = municipalities[0].overview;

export function getMunicipality(id: string | null): MunicipalityCatalog {
  return municipalities.find((municipality) => municipality.id === id) ?? municipalities[0];
}

export function getBeach(id: string | null): BeachConfig {
  return beaches.find((beach) => beach.id === id) ??
    beaches.find((beach) => beach.id === "ventanicas")!;
}
