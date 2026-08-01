/**
 * Frases de carga de las tres vistas. Describen lo que la escena está montando
 * de verdad —el mar, la arena, el relieve, la costa, las ramblas y el Sol— para
 * que la espera cuente algo en vez de repetir «cargando».
 */
export const LOADING_MESSAGES = [
  "Llenando el mar…",
  "Echando arena en las playas…",
  "Levantando la sierra…",
  "Trazando la línea de costa…",
  "Peinando las ramblas…",
  "Orientando el Sol…"
] as const;

export function loadingMessage(random = Math.random): string {
  return LOADING_MESSAGES[Math.floor(random() * LOADING_MESSAGES.length) % LOADING_MESSAGES.length];
}
