import marina from "./marina-de-la-torre.json";
import descargador from "./descargador.json";
import piedraVillazar from "./piedra-villazar.json";
import elCantal from "./el-cantal.json";
import lanceNuevo from "./lance-nuevo.json";
import ventanicas from "./ventanicas.json";
import ventaDelBancal from "./venta-del-bancal.json";
import { parseBeachConfig, type BeachConfig } from "./types";

export const beaches: BeachConfig[] = [
  marina,
  descargador,
  piedraVillazar,
  elCantal,
  lanceNuevo,
  ventanicas,
  ventaDelBancal
].map(parseBeachConfig);

export function getBeach(id: string | null): BeachConfig {
  return beaches.find((beach) => beach.id === id) ??
    beaches.find((beach) => beach.id === "ventanicas")!;
}
