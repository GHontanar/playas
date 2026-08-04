import { readFile, writeFile } from "node:fs/promises";
import { regions, type RegionCatalog } from "../src/regions/catalog";

/**
 * Rejilla diezmada de cada comarca, para las miniaturas del índice.
 *
 * El índice enseña los mismos bloques que las vistas comarcales, no capturas:
 * lo que cambia es la resolución. Los derivados completos pesan 5,6 MB y 4,1 MB
 * y no se pueden pedir dos a la vez en una portada, así que aquí se reducen a
 * un octavo por eje —de 50 m a 400 m— y quedan en unos 90 KB por comarca.
 *
 *   npm run data:thumbnails
 *
 * No toca las fuentes originales: parte de los derivados ya publicados, que son
 * los que la vista comarcal carga. Regenerarlos exige rehacer las miniaturas.
 */

const FACTOR = 8;
// El mar del bloque se deduce por inundación desde el borde comparando con esta
// cota; la celda diezmada tiene que caer del mismo lado que sus originales.
const SEA_LEVEL_EPSILON = .05;

interface DemMetadata {
  bounds: [number, number, number, number];
  webResolutionMeters: number;
  width: number;
  height: number;
  maxElevation: number;
  minElevation: number;
}

for (const region of regions) await prepare(region);

async function prepare(region: RegionCatalog) {
  const metadata: DemMetadata = JSON.parse(
    await readFile(`public/metadata/${region.assets}-dem.json`, "utf8")
  );
  const { width, height } = metadata;
  const dem = await readFile(`public/terrain/assets/${region.assets}-dem.f32`);
  // El Buffer puede ser una vista sobre un ArrayBuffer mayor; hay que decirlo.
  const heights = new Float32Array(dem.buffer, dem.byteOffset, dem.byteLength / Float32Array.BYTES_PER_ELEMENT);
  const seaCover = new Uint8Array(await readFile(`public/terrain/assets/${region.assets}-sea.u8`));
  const landCover = new Uint8Array(await readFile(`public/terrain/assets/${region.assets}-land.u8`));
  if (heights.length !== width * height) throw new Error(`${region.id}: DEM ${heights.length} != ${width * height}`);
  if (seaCover.length !== width * height) throw new Error(`${region.id}: batimetría desalineada`);
  if (landCover.length !== width * height) throw new Error(`${region.id}: usos del suelo desalineados`);

  // Se redondea hacia arriba para no perder la última franja de celdas: el
  // bloque diezmado tiene que cubrir los mismos bounds, no un recorte menor.
  const thumbWidth = Math.ceil(width / FACTOR);
  const thumbHeight = Math.ceil(height / FACTOR);
  const thumbHeights = new Float32Array(thumbWidth * thumbHeight);
  const thumbSea = new Uint8Array(thumbWidth * thumbHeight);
  const thumbLand = new Uint8Array(thumbWidth * thumbHeight);
  let maxElevation = 0;

  for (let row = 0; row < thumbHeight; row++) {
    for (let col = 0; col < thumbWidth; col++) {
      const fromRow = row * FACTOR;
      const fromCol = col * FACTOR;
      const toRow = Math.min(height, fromRow + FACTOR);
      const toCol = Math.min(width, fromCol + FACTOR);
      let landCells = 0;
      let seaCells = 0;
      let landSum = 0;
      const landModes = new Map<number, number>();
      const seaModes = new Map<number, number>();
      for (let sourceRow = fromRow; sourceRow < toRow; sourceRow++) {
        for (let sourceCol = fromCol; sourceCol < toCol; sourceCol++) {
          const index = sourceRow * width + sourceCol;
          if (heights[index] <= SEA_LEVEL_EPSILON) {
            seaCells++;
            count(seaModes, seaCover[index]);
          } else {
            landCells++;
            landSum += heights[index];
            count(landModes, landCover[index]);
          }
        }
      }
      const index = row * thumbWidth + col;
      // Promediar sin más subía las celdas de agua de la orilla por encima de
      // cero y la inundación dejaba de alcanzarlas: media de la tierra, y cota
      // cero limpia cuando el bloque original era mayoritariamente mar.
      const elevation = seaCells >= landCells || !landCells ? 0 : landSum / landCells;
      thumbHeights[index] = elevation;
      maxElevation = Math.max(maxElevation, elevation);
      thumbSea[index] = mode(seaModes);
      thumbLand[index] = elevation > 0 ? mode(landModes) : 0;
    }
  }

  const prefix = `${region.assets}-thumb`;
  await writeFile(`public/terrain/assets/${prefix}-dem.f32`, Buffer.from(thumbHeights.buffer));
  await writeFile(`public/terrain/assets/${prefix}-sea.u8`, Buffer.from(thumbSea));
  await writeFile(`public/terrain/assets/${prefix}-land.u8`, Buffer.from(thumbLand));
  await writeFile(`public/metadata/${prefix}-dem.json`, `${JSON.stringify({
    bounds: metadata.bounds,
    webResolutionMeters: metadata.webResolutionMeters * FACTOR,
    width: thumbWidth,
    height: thumbHeight,
    maxElevation,
    minElevation: 0,
    decimation: FACTOR,
    sourceGrid: [width, height],
    assetBytes: thumbHeights.byteLength
  }, null, 2)}\n`);

  const kilobytes = (thumbHeights.byteLength + thumbSea.length + thumbLand.length) / 1024;
  console.log(
    `${region.id}: ${width}×${height} → ${thumbWidth}×${thumbHeight} ` +
    `(${metadata.webResolutionMeters * FACTOR} m/celda, ${kilobytes.toFixed(0)} KB, cota máx ${maxElevation.toFixed(0)} m)`
  );
}

function count(tally: Map<number, number>, value: number) {
  tally.set(value, (tally.get(value) ?? 0) + 1);
}

/** La clase más repetida del bloque; el empate lo rompe el valor más bajo. */
function mode(tally: Map<number, number>): number {
  let best = 0;
  let bestCount = 0;
  for (const [value, occurrences] of [...tally].sort((a, b) => a[0] - b[0])) {
    if (occurrences > bestCount) {
      best = value;
      bestCount = occurrences;
    }
  }
  return best;
}
