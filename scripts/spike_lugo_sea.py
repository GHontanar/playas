#!/usr/bin/env python3
"""Rasteriza batimetría EMODnet a la rejilla del DEM de Lugo.

Spike P0 de la Mariña Lucense. Produce una rejilla de un byte por celda con la
banda batimétrica en los 5 bits bajos; en Lugo flora=0 siempre (no hay datos
de flora marina en esta costa).

Bandas batimétricas: 0-10, 10-30, 30-100, 100-300, 300-1000, 1000-1800, 1800+.
"""
import json
import pathlib
from collections import deque

import numpy as np
import rasterio.warp
from rasterio.enums import Resampling
from rasterio.transform import from_origin

BANDS = [(0, 10), (10, 30), (30, 100), (100, 300), (300, 1000), (1000, 1800), (1800, 99999)]
DEPTH_LABELS = {
    "0": "0-10",
    "1": "10-30",
    "2": "30-100",
    "3": "100-300",
    "4": "300-1000",
    "5": "1000-1800",
    "6": "1800-99999",
}

# La rejilla la manda el MDT ya generado, para que no puedan desalinearse.
_DEM = json.loads(pathlib.Path("public/metadata/lugo-dem.json").read_text())
RESOLUTION = _DEM["webResolutionMeters"]
WIDTH, HEIGHT = _DEM["width"], _DEM["height"]


def sea_mask(heights: np.ndarray) -> np.ndarray:
    """Mar es la cota cero conectada con el borde, igual que el cliente."""
    candidate = heights <= 0.05
    water = np.zeros_like(candidate, dtype=bool)
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


def main() -> None:
    transform = from_origin(609215, 4849303, RESOLUTION, RESOLUTION)

    # Cargar alturas del DEM ya generado.
    heights = np.fromfile("public/terrain/assets/lugo-dem.f32", dtype="<f4").reshape(HEIGHT, WIDTH)
    water = sea_mask(heights)

    # Reproyectar EMODnet a la rejilla de Lugo.
    emod = rasterio.open("data/source/gmrt-lugo.asc")
    bathy = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
    rasterio.warp.reproject(
        emod.read(1),
        bathy,
        src_crs="EPSG:4326",
        dst_crs="EPSG:25829",
        src_transform=emod.transform,
        dst_transform=transform,
        resampling=Resampling.bilinear,
        src_nodata=emod.nodata if emod.nodata is not None else -2147483648.0,
    )
    emod.close()

    # Rellenar nodata / valores corruptos con la celda válida más cercana (BFS).
    invalid = np.isnan(bathy) | np.isinf(bathy) | (bathy == -3.4028235e38) | (bathy == -2147483648.0)
    if emod.nodata is not None:
        invalid = invalid | (emod.nodata == bathy)

    initial_valid = int((~invalid).sum())

    filled = bathy.copy()
    dist = np.full((HEIGHT, WIDTH), -1, dtype=np.int32)
    queue: deque[tuple[int, int]] = deque()
    for r in range(HEIGHT):
        for c in range(WIDTH):
            if not invalid[r, c]:
                dist[r, c] = 0
                queue.append((r, c))

    while queue:
        r, c = queue.popleft()
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < HEIGHT and 0 <= nc < WIDTH and dist[nr, nc] == -1:
                dist[nr, nc] = dist[r, c] + 1
                filled[nr, nc] = filled[r, c]
                queue.append((nr, nc))

    bathy = filled
    filled_count = int(invalid.sum())

    # Profundidad = abs(valor).
    depth_raw = np.abs(bathy)

# Asignar banda: índice del tramo que contiene la profundidad.
    depth = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)
    for i, (lo, hi) in enumerate(BANDS):
        mask = (depth_raw >= lo) & (depth_raw < hi)
        depth[mask] = i
    # Valores >= último límite → banda final (6)
    depth[depth_raw >= BANDS[-1][1]] = len(BANDS) - 1

    # flora=0 (no hay datos de flora marina para la costa de Lugal).
    flora = np.zeros((HEIGHT, WIDTH), dtype=np.uint8)

    # En tierra: banda 0, flora 0.
    depth[~water] = 0
    flora[~water] = 0

    # Empaquetar: bits 0-4 = banda, bits 5-7 = flora.
    packed = (depth | (flora << 5)).astype("uint8")

    if packed.max() > 31:
        raise SystemExit("La banda batimétrica supera 31 (5 bits)")

    packed.tofile("public/terrain/assets/lugo-sea.u8")

    # Estadísticas por banda (solo celdas de mar).
    depth_counts: dict[int, int] = {}
    water_bands = depth[water]
    for i in range(len(BANDS)):
        c = int((water_bands == i).sum())
        if c:
            depth_counts[i] = c

    covered = int((depth[water] > 0).sum())
    total_water = int(water.sum())
    marine_invalid = int((invalid & water).sum())
    print(f"mar {total_water} celdas · con banda batimétrica {covered} ({100 * covered / total_water:.1f}%)")
    print(f"rellenadas desde nodata: {filled_count} celdas ({100 * filled_count / (filled_count + initial_valid):.1f}%)")
    print(f"celdas de mar con nodata original: {marine_invalid}")
    print("celdas por banda:")
    for i in sorted(depth_counts):
        print(f"  banda {i} ({DEPTH_LABELS[str(i)]}): {depth_counts[i]} celdas")

    # Metadata.
    metadata = {
        "source": [
            "Batimetría: GMRT GridServer (GEBCO 2023 + multibeam), marine-geo.org; EMODnet WCS no disponible en la descarga",
        ],
        "bounds": [609215, 4799988, 661153, 4849303],
        "webResolutionMeters": RESOLUTION,
        "width": WIDTH,
        "height": HEIGHT,
        "encoding": "uint8: bits 0-4 banda batimétrica, bits 5-7 clase de flora",
        "depthBands": DEPTH_LABELS,
        "floraClasses": {"0": "Sin flora cartografiada"},
        "depthCellsByBand": {str(k): v for k, v in depth_counts.items()},
        "assetBytes": int(packed.nbytes),
    }
    with open("public/metadata/lugo-sea.json", "w", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


if __name__ == "__main__":
    import rasterio
    main()