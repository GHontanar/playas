import * as THREE from "three";

/**
 * El recorrido editorial ligado al scroll, común a la costa municipal y al
 * bloque comarcal.
 *
 * Las dos vistas son un escenario alto con la escena pegajosa dentro: bajar por
 * la página mueve la cámara entre paradas fijas. Un gesto de scroll elige una
 * parada —no rasca valores intermedios arbitrarios—, y la transición hasta ella
 * se interpola con suavizado. Con `prefers-reduced-motion` no hay transición:
 * se salta directamente, que es lo que ya hacía cada copia por su lado.
 *
 * Lo que cambia entre niveles es qué se hace con la cámara —el comarcal además
 * mira al objetivo, recoloca rótulos y dibuja a mano, porque su escena no tiene
 * bucle— así que eso se queda en `onFrame`. Aquí solo vive el mecanismo.
 */

export interface Viewpoint {
  /** Objetivo de la cámara, en coordenadas de escena. */
  target: THREE.Vector3;
  zoom: number;
  /** Rótulo de la parada, cuando la vista lo muestra. */
  name?: string;
}

export interface ScrollStoryFrame {
  /** Objetivo interpolado entre las dos paradas que rodean al progreso. */
  target: THREE.Vector3;
  zoom: number;
  /** La parada más cercana; la que da nombre a lo que se está viendo. */
  viewpoint: Viewpoint;
  /** Progreso continuo del recorrido, de 0 a 1. */
  progress: number;
}

export interface ScrollStoryOptions {
  /** Escenario alto: su altura menos el viewport es el trayecto disponible. */
  scroller: HTMLElement;
  viewpoints: Viewpoint[];
  onFrame(frame: ScrollStoryFrame): void;
  /**
   * Fija el recorrido en un punto e ignora el scroll. `?progress=0..1` lo usa
   * para inspeccionar las paradas una a una y para las capturas automáticas.
   */
  forcedProgress?: number | null;
}

export interface ScrollStory {
  /** Reaplica la parada actual. Para llamar después de un `resize`. */
  refresh(): void;
  dispose(): void;
}

export function createScrollStory(options: ScrollStoryOptions): ScrollStory {
  const { scroller, viewpoints, onFrame } = options;
  if (!viewpoints.length) throw new Error("Un recorrido necesita al menos una parada");
  const last = viewpoints.length - 1;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const forced = options.forcedProgress ?? null;

  const apply = (progress: number) => {
    const position = progress * last;
    const from = Math.min(last, Math.floor(position));
    const to = Math.min(last, from + 1);
    const t = smoothstep(position - from);
    onFrame({
      target: viewpoints[from].target.clone().lerp(viewpoints[to].target, t),
      zoom: THREE.MathUtils.lerp(viewpoints[from].zoom, viewpoints[to].zoom, t),
      viewpoint: viewpoints[t < .5 ? from : to],
      progress
    });
  };

  const scrollProgress = () => {
    const travel = Math.max(1, scroller.offsetHeight - window.innerHeight);
    return THREE.MathUtils.clamp((window.scrollY - scroller.offsetTop) / travel, 0, 1);
  };
  // El scroll elige un keyframe, no un valor intermedio cualquiera.
  const keyedProgress = () => last === 0 ? 0 : Math.round(scrollProgress() * last) / last;

  let current = forced ?? keyedProgress();
  let target = current;
  let frame = 0;

  const animate = () => {
    const difference = target - current;
    current = Math.abs(difference) < .0001 ? target : current + difference * .16;
    apply(current);
    if (current !== target) frame = requestAnimationFrame(animate);
  };

  const update = () => {
    if (forced !== null) return;
    target = keyedProgress();
    cancelAnimationFrame(frame);
    if (reducedMotion) {
      // Sin transición, y como el objetivo siempre es una parada exacta, la
      // interpolación cae justo sobre ella.
      current = target;
      apply(current);
    } else {
      frame = requestAnimationFrame(animate);
    }
  };

  window.addEventListener("scroll", update, { passive: true });
  apply(current);

  return {
    refresh: () => apply(current),
    dispose() {
      window.removeEventListener("scroll", update);
      cancelAnimationFrame(frame);
    }
  };
}

function smoothstep(value: number): number {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}
