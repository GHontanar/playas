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
      lifeguardService: "active",
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

export function refreshStatusAfterHourChange(callback: () => void | Promise<void>): () => void {
  let timer = 0;
  const schedule = () => {
    // Los cambios oficiales de 2026 se producen en horas enteras. Esperar un
    // minuto adicional evita reutilizar la respuesta de borde anterior.
    const nextHour = Math.ceil(Date.now() / 3_600_000) * 3_600_000;
    timer = window.setTimeout(async () => {
      await callback();
      schedule();
    }, Math.max(1_000, nextHour + 65_000 - Date.now()));
  };
  schedule();
  return () => window.clearTimeout(timer);
}
