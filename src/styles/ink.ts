import * as THREE from "three";

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

/**
 * Saca el cielo de la escena del lienzo y lo lleva al resto de la página: el
 * fondo, la tinta de los rótulos y la barra del navegador. Sin esto el lienzo
 * anochece y la página se queda beige alrededor.
 *
 * Devuelve el color aplicado, que es el que el escenario acaba de calcular para
 * la altura solar del momento.
 */
export function applySceneSky(container: HTMLElement): string {
  const sky = container.style.backgroundColor;
  document.documentElement.style.setProperty("--coast-sky", sky);
  document.documentElement.style.setProperty("--scene-ink", inkOn(new THREE.Color(sky)));
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", sky);
  return sky;
}
