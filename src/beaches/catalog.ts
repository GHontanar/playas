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

export interface MunicipalityCatalog {
  id: "mojacar" | "carboneras" | "garrucha" | "vera";
  name: string;
  overview: BeachConfig;
  beaches: BeachConfig[];
}

export const municipalities: MunicipalityCatalog[] = [
  { id: "mojacar", name: "Mojácar", overview: parseBeachConfig(mojacarCoast), beaches: mojacarBeaches },
  { id: "carboneras", name: "Carboneras", overview: parseBeachConfig(carbonerasCoast), beaches: carbonerasBeaches },
  { id: "garrucha", name: "Garrucha", overview: parseBeachConfig(garruchaCoast), beaches: [garruchaPlaya, garruchaPosito, garruchaPlayazo].map(parseBeachConfig) },
  { id: "vera", name: "Vera", overview: parseBeachConfig(veraCoast), beaches: [veraMarinas, veraPuertoRey, veraPlayazo, veraCalaMarques].map(parseBeachConfig) }
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
