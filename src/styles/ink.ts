/**
 * El cielo de las maquetas va del beige de mediodía al azul de noche, así que
 * la tinta del rótulo no puede ser fija: se elige la de la paleta que contrasta
 * con el fondo del momento.
 */
const DARK_INK = "#173a3d";
const LIGHT_INK = "#f2ece4";

export function inkOn(background: { r: number; g: number; b: number }): string {
  // Luminancia relativa aproximada sobre componentes lineales de Three.js.
  const luminance = .2126 * background.r + .7152 * background.g + .0722 * background.b;
  return luminance > .18 ? DARK_INK : LIGHT_INK;
}
