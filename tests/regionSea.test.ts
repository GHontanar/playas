import { describe, expect, it } from "vitest";
import { buildRegionSea, REGION_CHUNK_DEPTH, type RegionGrid } from "../src/map/regionChunk";
import { regions } from "../src/regions/catalog";

/**
 * La lámina de agua comarcal cubría el bloque entero y hundía sus celdas de
 * tierra hasta el fondo, a 15 cm del suelo del zócalo. Con el plano lejano a
 * 600 km el buffer de profundidad no separa esa distancia, así que las dos
 * caras se peleaban; en el Levante no se veía —sus dos caras visibles son mar
 * abierto— pero en la Mariña, donde la tierra llega al borde sur, el moteado se
 * comía el zócalo justo donde tenía que leerse como tierra.
 *
 * Estas pruebas fijan las dos condiciones que lo evitan: no se tesela tierra
 * adentro y ningún vértice del agua llega al suelo del bloque.
 */

// Cuatro por cuatro con la fila norte de mar, como la Mariña: al voltear la
// rejilla, la fila sur del ráster es la que queda contra la cámara.
function gridWithNorthernSea(width = 4, height = 4): RegionGrid {
  const cells = width * height;
  const sea = new Uint8Array(cells);
  for (let col = 0; col < width; col++) sea[col] = 1;
  const shoreDistance = new Uint16Array(cells);
  for (let index = 0; index < cells; index++) shoreDistance[index] = sea[index] ? 1 : 0;
  return {
    width,
    height,
    resolution: 50,
    heights: new Float32Array(cells).map((_, index) => sea[index] ? 0 : 120),
    seaCover: new Uint8Array(cells),
    landCover: new Uint8Array(cells),
    bandDepths: [5],
    sea,
    shoreDistance,
    demBytes: cells * 4
  };
}

describe("lámina de agua comarcal", () => {
  it("no tesela los cuadros que son tierra por sus cuatro esquinas", () => {
    const grid = gridWithNorthernSea();
    const mesh = buildRegionSea(regions[0].bounds, grid);
    const index = mesh.geometry.getIndex();
    expect(index, "la lámina debe ir indexada para poder descartar tierra").not.toBeNull();
    // De los nueve cuadros solo sobrevive la fila que toca el mar: tres cuadros,
    // seis triángulos.
    expect(index!.count / 3).toBe(6);
  });

  it("ningún vértice del agua baja hasta el suelo del zócalo", () => {
    const grid = gridWithNorthernSea();
    const mesh = buildRegionSea(regions[0].bounds, grid);
    const positions = mesh.geometry.attributes.position;
    let lowest = 0;
    for (let vertex = 0; vertex < positions.count; vertex++) {
      lowest = Math.min(lowest, positions.getY(vertex));
    }
    expect(lowest).toBeGreaterThan(-REGION_CHUNK_DEPTH);
    // Y con holgura: rozar el suelo reproduce la pelea de profundidad.
    expect(REGION_CHUNK_DEPTH + lowest).toBeGreaterThan(100);
  });

  it("hunde la tierra de la orilla para que el relieve la tape", () => {
    const grid = gridWithNorthernSea();
    const mesh = buildRegionSea(regions[0].bounds, grid);
    const positions = mesh.geometry.attributes.position;
    // Fila de vértices 3 = fila 0 del ráster = mar; fila 2 = tierra de orilla.
    // El giro del plano deja residuo de coma flotante en el cero.
    expect(positions.getY(3 * 4)).toBeCloseTo(0, 6);
    expect(positions.getY(2 * 4)).toBeLessThan(0);
  });

  it("un bloque sin tierra conserva la lámina entera", () => {
    const grid = gridWithNorthernSea();
    grid.sea.fill(1);
    const mesh = buildRegionSea(regions[0].bounds, grid);
    expect(mesh.geometry.getIndex()!.count / 3).toBe(9 * 2);
  });
});
