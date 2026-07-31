import type { ObservedBeachStatus, ObservedStatusResponse } from "./types";

const demoFlags = ["green", "green", "yellow", "green", "yellow", "green", "red"] as const;

export async function loadObservedStatus(demo = false): Promise<ObservedBeachStatus[]> {
  if (demo) {
    const ids = [
      "marina-de-la-torre", "descargador", "piedra-villazar", "el-cantal",
      "lance-nuevo", "ventanicas", "venta-del-bancal"
    ];
    return ids.map((beachId, index) => ({
      beachId,
      flag: demoFlags[index],
      jellyfish: index === 4,
      observedAtLocal: "modo de demostración",
      source: "gestiondeplayas"
    }));
  }
  const response = await fetch("/api/status", { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`Estado oficial no disponible (${response.status})`);
  const payload = await response.json() as ObservedStatusResponse;
  return payload.beaches;
}
