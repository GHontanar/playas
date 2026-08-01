"""Rasteriza batimetría y flora marina DERA a la rejilla del MDT comarcal.

Spike P0 del nivel regional. Produce una rejilla de un byte por celda con la
banda batimétrica en los 5 bits bajos y la clase de fondo vegetado en los 3
altos, para que el agua deje de ser un teal plano sin cargar polígonos en el
cliente. Solo se rellenan las celdas de mar; en tierra el byte es 0 y la rejilla
comprime bien.
"""
import json
import pathlib
from collections import deque

import fiona
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import box, mapping, shape

WEST, SOUTH, EAST, NORTH = 557600, 4060000, 612000, 4125000
# La rejilla la manda el MDT ya generado, para que no puedan desalinearse.
_DEM = json.loads(pathlib.Path("public/metadata/levante-dem.json").read_text())
RESOLUTION = _DEM["webResolutionMeters"]
WIDTH, HEIGHT = _DEM["width"], _DEM["height"]
RELIEVE = "data/source/1_Relieve.gpkg"
MARINO = "data/source/dera-medio-marino/5_Medio_Marino.gpkg"

# Fanerógamas y alga roja separadas: son hábitats distintos y no deben leerse
# como un único "fondo verde".
FLORA_CLASSES = {
    "Posidonia Oceánica": 1,
    "Cymodocea Nodosa": 2,
    "Posidonia Oceánica Y Cymodocea Nodosa": 3,
    "Rissoella Verruculosa": 4,
}


def sea_mask(heights: np.ndarray) -> np.ndarray:
    """Mar es la cota cero conectada con el borde, igual que en el cliente."""
    candidate = heights <= 0.05
    water = np.zeros_like(candidate)
    queue: deque[tuple[int, int]] = deque()

    def push(row: int, col: int) -> None:
        if candidate[row, col] and not water[row, col]:
            water[row, col] = True
            queue.append((row, col))

    for row in range(HEIGHT):
        push(row, 0)
        push(row, WIDTH - 1)
    for col in range(WIDTH):
        push(0, col)
        push(HEIGHT - 1, col)
    while queue:
        row, col = queue.popleft()
        for drow, dcol in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            next_row, next_col = row + drow, col + dcol
            if 0 <= next_row < HEIGHT and 0 <= next_col < WIDTH:
                push(next_row, next_col)
    return water


def burn(path: str, layer: str, value_of, transform) -> tuple[np.ndarray, dict]:
    clip = box(WEST, SOUTH, EAST, NORTH)
    shapes = []
    tally: dict = {}
    with fiona.open(path, layer=layer) as collection:
        for feature in collection.filter(bbox=(WEST, SOUTH, EAST, NORTH)):
            geometry = shape(feature["geometry"]).intersection(clip)
            if geometry.is_empty:
                continue
            value = value_of(feature["properties"])
            if not value:
                continue
            shapes.append((mapping(geometry), value))
            tally[value] = tally.get(value, 0) + 1
    grid = rasterize(
        shapes,
        out_shape=(HEIGHT, WIDTH),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=True,
    )
    return grid, tally


def main() -> None:
    transform = from_origin(WEST, NORTH, RESOLUTION, RESOLUTION)
    heights = np.fromfile("public/terrain/assets/levante-dem.f32", dtype="<f4").reshape(HEIGHT, WIDTH)
    water = sea_mask(heights)

    depth, depth_tally = burn(
        RELIEVE, "T01_06_IntervaloBatimetrico",
        lambda p: int(p["rango"]) if p.get("rango") else 0,
        transform,
    )
    flora, flora_tally = burn(
        MARINO, "T05_03_FloraMarina",
        lambda p: FLORA_CLASSES.get((p.get("especie") or "").strip(), 0),
        transform,
    )
    if depth.max() > 31 or flora.max() > 7:
        raise SystemExit("Las clases no caben en 5+3 bits")

    depth[~water] = 0
    flora[~water] = 0
    packed = (depth | (flora << 5)).astype("uint8")
    packed.tofile("public/terrain/assets/levante-sea.u8")

    covered = int((depth[water] > 0).sum())
    print(f"mar {int(water.sum())} celdas · con banda batimétrica {covered} ({100 * covered / water.sum():.1f}%)")
    print(f"celdas con flora {int((flora > 0).sum())}")
    intervals = {}
    with fiona.open(RELIEVE, layer="T01_06_IntervaloBatimetrico") as collection:
        for feature in collection.filter(bbox=(WEST, SOUTH, EAST, NORTH)):
            band = feature["properties"].get("rango")
            if band:
                intervals[int(band)] = feature["properties"].get("intervalo")
    metadata = {
        "source": [
            "Batimetría: DERA 1 Relieve, T01_06_IntervaloBatimetrico (IECA), CC BY 4.0",
            "Flora marina: DERA 5 Medio Marino, T05_03_FloraMarina (IECA), CC BY 4.0",
        ],
        "bounds": [WEST, SOUTH, EAST, NORTH],
        "webResolutionMeters": RESOLUTION,
        "width": WIDTH,
        "height": HEIGHT,
        "encoding": "uint8: bits 0-4 banda batimétrica, bits 5-7 clase de flora",
        "depthBands": {str(k): intervals.get(k) for k in sorted(intervals)},
        "floraClasses": {str(v): k for k, v in FLORA_CLASSES.items()},
        "depthCellsByBand": {str(k): int((depth == k).sum()) for k in sorted(depth_tally)},
        "floraCells": {str(k): int((flora == k).sum()) for k in sorted(flora_tally)},
        "assetBytes": int(packed.nbytes),
    }
    with open("public/metadata/levante-sea.json", "w", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


if __name__ == "__main__":
    main()
