"""Rasteriza los usos del suelo DERA a la rejilla del MDT comarcal.

Spike P0 del nivel regional. La tierra ocupa el 62 % del bloque y sin ningún
acento se lee como una manta ocre. `T06_01_UsoSuelo` es CORINE nivel 3, 42
clases; aquí se agrupan en ocho familias porque a 100 m la diferencia entre un
olivar y un frutal no es legible y multiplicar colores rompería el parecido con
el overview municipal.

Nota de alcance: CORINE no distingue el cultivo bajo plástico. Los invernaderos
del Campo de Níjar quedan dentro de "Terrenos regados permanentemente" y no
pueden rotularse como invernaderos con esta fuente.
"""
import json
from collections import deque

import fiona
import numpy as np
from rasterio.features import rasterize
from rasterio.transform import from_origin
from shapely.geometry import box, mapping, shape

WEST, SOUTH, EAST, NORTH = 557600, 4060000, 612000, 4125000
RESOLUTION = 100
WIDTH, HEIGHT = 544, 650
USOS = "data/source/dera-usos-suelo/6_UsosdelSuelo.gpkg"

# CORINE nivel 3 agrupado. El orden importa: al rasterizar, las clases altas se
# pintan encima, así que lo escaso y significativo va después de lo extenso.
GROUPS: dict[int, tuple[str, tuple[int, ...]]] = {
    1: ("Suelo desnudo y roquedo", (331, 332, 333, 334)),
    2: ("Matorral y pastizal", (321, 322, 323)),
    3: ("Mosaico agrícola y secano", (211, 221, 222, 223, 231, 241, 242, 243, 244)),
    4: ("Bosque", (311, 312, 313, 324)),
    5: ("Regadío permanente", (212, 213)),
    6: ("Humedal y salinas", (411, 421, 422, 423)),
    7: ("Agua continental", (511, 512, 521, 522)),
    8: ("Urbano e industrial", (111, 112, 121, 122, 123, 124, 131, 132, 133, 141, 142)),
}
GROUP_OF = {code: group for group, (_, codes) in GROUPS.items() for code in codes}


def sea_mask(heights: np.ndarray) -> np.ndarray:
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


def main() -> None:
    transform = from_origin(WEST, NORTH, RESOLUTION, RESOLUTION)
    heights = np.fromfile("public/terrain/assets/levante-dem.f32", dtype="<f4").reshape(HEIGHT, WIDTH)
    water = sea_mask(heights)

    clip = box(WEST, SOUTH, EAST, NORTH)
    shapes: list[tuple[dict, int]] = []
    unmapped: dict[int, float] = {}
    with fiona.open(USOS, layer="T06_01_UsoSuelo") as collection:
        for feature in collection.filter(bbox=(WEST, SOUTH, EAST, NORTH)):
            geometry = shape(feature["geometry"]).intersection(clip)
            if geometry.is_empty:
                continue
            code = feature["properties"].get("cod_uso")
            group = GROUP_OF.get(int(code)) if code else None
            if not group:
                unmapped[int(code)] = unmapped.get(int(code), 0) + geometry.area / 1e6
                continue
            shapes.append((mapping(geometry), group))
    shapes.sort(key=lambda item: item[1])
    grid = rasterize(
        shapes,
        out_shape=(HEIGHT, WIDTH),
        transform=transform,
        fill=0,
        dtype="uint8",
        all_touched=False,
    )
    grid[water] = 0
    grid.tofile("public/terrain/assets/levante-land.u8")

    land = int((~water).sum())
    covered = int((grid > 0).sum())
    print(f"tierra {land} celdas · con uso asignado {covered} ({100 * covered / land:.1f}%)")
    for group, (name, _) in GROUPS.items():
        cells = int((grid == group).sum())
        if cells:
            print(f"  {group} {name:28s} {cells:6d} celdas · {cells / 100:6.1f} km2")
    if unmapped:
        print("códigos sin grupo:", {k: round(v, 1) for k, v in unmapped.items()})

    metadata = {
        "source": ["Usos del suelo: DERA 6 Usos del Suelo, T06_01_UsoSuelo (IECA), CC BY 4.0"],
        "nomenclature": "CORINE Land Cover nivel 3, agrupado",
        "scopeNote": (
            "CORINE no distingue el cultivo bajo plástico: los invernaderos quedan "
            "dentro de «Terrenos regados permanentemente» y no se rotulan como tales."
        ),
        "bounds": [WEST, SOUTH, EAST, NORTH],
        "webResolutionMeters": RESOLUTION,
        "width": WIDTH,
        "height": HEIGHT,
        "encoding": "uint8: 0 mar o sin dato, 1-8 grupo de uso",
        "groups": {str(g): {"name": name, "corine": list(codes)} for g, (name, codes) in GROUPS.items()},
        "cellsByGroup": {str(g): int((grid == g).sum()) for g in GROUPS},
        "assetBytes": int(grid.nbytes),
    }
    with open("public/metadata/levante-land.json", "w", encoding="utf-8") as stream:
        json.dump(metadata, stream, indent=2, ensure_ascii=False)
        stream.write("\n")


if __name__ == "__main__":
    main()
