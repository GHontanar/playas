#!/usr/bin/env python3
"""Rasteriza los usos del suelo CORINE CLC2018 sobre la rejilla del DEM Lugo.

Spike P0 de la Mariña Lucense. Consulta el Feature Layer de polígonos de
CORINE Land Cover 2018 (servicio DisCoMap EEA) y lo rasteriza en la rejilla
web EPSG:25829 del DEM.

No se incluyen cauces (no hay fuente propia de ríos). Los ríos y estuarios
se ven a través de la clase 511/512 (grupo 7, agua continental).
"""
import json
import pathlib
import urllib.request
from collections import deque

import numpy as np
import pyproj
import rasterio
import rasterio.features
import rasterio.warp
from rasterio.crs import CRS
from rasterio.transform import from_origin
from shapely.geometry import box, mapping, shape
from shapely.ops import transform as shp_transform

# ── rejilla destino ──────────────────────────────────────────────────────────
WEST, SOUTH, EAST, NORTH = 609215, 4799988, 661153, 4849303

_DEM = json.loads(pathlib.Path("public/metadata/lugo-dem.json").read_text())
RESOLUTION = _DEM["webResolutionMeters"]  # 50 m
WIDTH, HEIGHT = _DEM["width"], _DEM["height"]  # 1039 x 987
dst_transform = from_origin(WEST, NORTH, RESOLUTION, RESOLUTION)

# CRS transformers
CRS_4326 = CRS.from_epsg(4326)
CRS_25829 = CRS.from_epsg(25829)
Transformer_25829_to_4326 = pyproj.Transformer.from_crs(
    "EPSG:25829", "EPSG:4326", always_xy=True
)
Transformer_4326_to_25829 = pyproj.Transformer.from_crs(
    "EPSG:4326", "EPSG:25829", always_xy=True
)

# ── Grupos de CORINE (8 familias) ──────────────────────────────────────────
# Sin grupo 9 (no hay fuente de cauces).
GROUPS: dict[int, tuple[str, tuple[int, ...]]] = {
    1: ("Suelo desnudo y roquedo",            (331, 332, 333, 334)),
    2: ("Matorral y pastizal",                 (321, 322, 323)),
    3: ("Mosaico agrícola y secano",            (211, 221, 222, 223, 231, 241, 242, 243, 244)),
    4: ("Bosque",                              (311, 312, 313, 324)),
    5: ("Regadío permanente",                  (212, 213)),
    6: ("Humedal y salinas",                   (411, 421, 422, 423)),
    7: ("Agua continental",                    (511, 512, 521, 522)),
    8: ("Urbano e industrial",                 (111, 112, 121, 122, 123, 124, 131, 132, 133, 141, 142)),
}
GROUP_OF = {code: group for group, (_, codes) in GROUPS.items() for code in codes}
# Total unique codes covered by groups 1-8
ALL_CODES = set(GROUP_OF.keys())

# ── tiles para el envelope (4326) ───────────────────────────────────────────
# El servicio falla con 500 si el envelope es muy grande. Se divide en 4 tiles.
_LON_SW, _LAT_SW, _LON_NE, _LAT_NE = -7.6525, 43.3448, -6.9974, 43.7792
_TILES = [
    (-7.6525, 43.3448, -7.3250, 43.5620),
    (-7.3250, 43.3448, -6.9974, 43.5620),
    (-7.6525, 43.5620, -7.3250, 43.7792),
    (-7.3250, 43.5620, -6.9974, 43.7792),
]


def _download_features() -> list[dict]:
    """Descarga los polígonos CLC2018 de todos los tiles y los devuelve."""
    all_features: list[dict] = []
    for w, s, e, n in _TILES:
        url = (
            f"https://image.discomap.eea.europa.eu/arcgis/rest/services/"
            f"Corine/CLC2018_WM/MapServer/0/query"
            f"?geometry={w}%2C{s}%2C{e}%2C{n}"
            f"&geometryType=esriGeometryEnvelope"
            f"&inSR=4326&outSR=4326"
            f"&outFields=Code_18"
            f"&returnGeometry=true"
            f"&f=geojson"
        )
        print(f"  Descargando tile [{w:.4f},{s:.4f},{e:.4f},{n:.4f}] …")
        try:
            req = urllib.request.urlopen(url, timeout=60)
            data = json.loads(req.read())
            feats = data.get("features", [])
            print(f"    → {len(feats)} features")
            all_features.extend(feats)
        except Exception as exc:
            print(f"    → ERROR: {exc}")
    return all_features


def _filter_and_project(features: list[dict]) -> list[tuple[dict, int]]:
    """Filtra solo los Code_18 en GROUP_OF, reproyecta a 25829 y devuelve
    lista de (geom_as_dict, group_id) para rasterize()."""
    shapes: list[tuple[dict, int]] = []
    unmapped: dict[str, float] = {}  # code -> area km2
    clip = box(WEST, SOUTH, EAST, NORTH)

    for feat in features:
        code = feat["properties"].get("Code_18")
        if not code:
            continue
        group = GROUP_OF.get(int(code))
        if not group:
            geom = shape(feat["geometry"])
            area_km2 = geom.intersection(clip).area / 1e6
            unmapped[code] = unmapped.get(code, 0) + area_km2
            continue

        # Reproyectar de 4326 → 25829
        geom_4326 = shape(feat["geometry"])
        geom_25829 = shp_transform(Transformer_4326_to_25829.transform, geom_4326)
        clipped = geom_25829.intersection(clip)
        if clipped.is_empty:
            continue
        shapes.append((mapping(clipped), group))

    return shapes, unmapped


# ── helpers ────────────────────────────────────────────────────────────────
def sea_mask(heights: np.ndarray) -> np.ndarray:
    """Máscara de mar: cota <= 0.05 conectada al borde (flood-fill 4-conexo)."""
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
            nr, nc = row + drow, col + dcol
            if 0 <= nr < HEIGHT and 0 <= nc < WIDTH:
                push(nr, nc)
    return water


def check_pixel_control(grid: np.ndarray) -> dict:
    """Verifica los píxeles de control: Viveiro → grupo 8, Xistral → grupo 4.
    Usa coordenadas UTM (EPSG:25829) aproximadas para el servicio CLC.
    """
    # Convertir lon/lat a UTM29N (EPSG:25829, mismo que SATEPSAN1/ETRS89-UTM zone 29N)
    viveiro_lon, viveiro_lat = -7.595, 43.662
    xistral_lon, xistral_lat = -7.55, 43.40

    vx, vy = Transformer_4326_to_25829.transform(viveiro_lon, viveiro_lat)
    xx, xy = Transformer_4326_to_25829.transform(xistral_lon, xistral_lat)

    results = {
        "viveiro": {"lon_lat": (viveiro_lon, viveiro_lat), "utm": (vx, vy), "group": None},
        "xistral": {"lon_lat": (xistral_lon, xistral_lat), "utm": (xx, xy), "group": None},
    }

    # Calcular índice del raster
    def coord_to_idx(x, y):
        col = int((x - WEST) / RESOLUTION)
        row = int((NORTH - y) / RESOLUTION)
        return row, col

    for label, coords in results.items():
        cx, cy = coords["utm"]
        row, col = coord_to_idx(cx, cy)
        if 0 <= row < HEIGHT and 0 <= col < WIDTH:
            coords["row_col"] = (row, col)
            coords["group"] = int(grid[row, col])

    return results


# ── main ────────────────────────────────────────────────────────────────────
def main() -> None:
    print("=== Spike Lugo Land: CLC2018 Feature Layer ===")

    # 1. Descarga
    print("\n--- Paso 1: descarga de polígonos CLC2018 ---")
    all_features = _download_features()
    print(f"\n  Total features descargadas: {len(all_features)}")

    if not all_features:
        raise SystemExit("ERROR: no se descargaron features. Abortando.")

    # 2. Filtrar, reproyectar y rasterizar
    print("\n--- Paso 2: filtrado y reproyección a 25829 ---")
    shapes, unmapped = _filter_and_project(all_features)
    print(f"  Shapes después de filtrar y reproyectar: {len(shapes)}")
    print(f"  Códigos sin grupo (omitidos): {dict((k, round(v, 2)) for k, v in sorted(unmapped.items()))}")

    if not shapes:
        raise SystemExit("ERROR: no hay shapes para rasterizar. Abortando.")

    # Ordenar por grupo (como en spike_region_land.py)
    shapes.sort(key=lambda item: item[1])

    grid = rasterio.features.rasterize(
        shapes,
        out_shape=(HEIGHT, WIDTH),
        transform=dst_transform,
        fill=0,
        dtype="uint8",
        all_touched=False,
    )

    # 3. Máscara de mar (flood-fill sobre el DEM)
    print("\n--- Paso 3: máscara de mar (flood-fill) ---")
    heights = np.fromfile(
        "public/terrain/assets/lugo-dem.f32", dtype="<f4"
    ).reshape(HEIGHT, WIDTH)
    water = sea_mask(heights)
    land_mask = ~water

    # 4. Validaciones de corrección (sanciones)
    print("\n--- Paso 4: validaciones ---")

    # 4a. Concordancia mar DEM vs CORINE
    corine_has_water = (grid == 7)  # Agua continental
    corine_no_data = (grid == 0)

    dem_water_cells = int(water.sum())
    dem_water_misaligned = int((water & ~corine_no_data & ~corine_has_water).sum())
    dem_water_agreement = dem_water_cells - dem_water_misaligned

    concordance = (
        dem_water_agreement / dem_water_cells * 100
        if dem_water_cells > 0
        else 100.0
    )

    print(f"  Mar DEM: {dem_water_cells:,d} celdas")
    print(f"    Concordancia con CORINE (agua o sin dato): {concordance:.1f}%")
    if concordance < 90:
        print(f"  ⚠️  CONCORDANCIA BAJA ({concordance:.1f}% < 90%). Revisando orden de filas…")
        # Intentar con fila invertida: comprobar si al voltear horizontalmente mejora
        grid_flipped = np.flipud(grid)
        corine_f = (grid_flipped == 7)
        corine_n_f = (grid_flipped == 0)
        dem_w_m = int((water & ~corine_n_f & ~corine_f).sum())
        conc_f = (dem_water_cells - dem_w_m) / dem_water_cells * 100 if dem_water_cells > 0 else 100
        print(f"    Si volteamos (flipud): concordancia sería {conc_f:.1f}%")
        if conc_f > concordance + 5:
            print(f"    Volteamos el raster (flipud) para alinear norte/sur.")
            grid = grid_flipped
            grid[water] = 0
            concordance = conc_f
        else:
            grid[water] = 0
    else:
        grid[water] = 0

    print(f"  Concordancia final: {concordance:.1f}%")

    # 4b. Estadísticas por grupo
    land_cells = int(land_mask.sum())
    total_cells = HEIGHT * WIDTH
    print(f"\n  Celdas totales: {total_cells:,d}")
    print(f"  Mar: {dem_water_cells:,d} ({100 * dem_water_cells / total_cells:.1f}%)")
    print(f"  Tierra: {land_cells:,d} ({100 * land_cells / total_cells:.1f}%)")

    cells_by_group: dict[str, int] = {"0": int((grid == 0).sum())}
    for g in range(1, 9):
        cells_by_group[str(g)] = int((grid == g).sum())

    covered = int((grid > 0).sum())
    land_covered_pct = 100 * covered / max(land_cells, 1)
    print(f"  Tierra con uso: {covered:,d} ({land_covered_pct:.1f}%)")
    for g, (name, _) in GROUPS.items():
        c = cells_by_group[str(g)]
        if c:
            km2 = c * RESOLUTION ** 2 / 1e6
            pct_land = 100 * c / max(land_cells, 1)
            print(f"    {g:2d} {name:30s} {c:6,d} celdas · {km2:7.1f} km2 · {pct_land:5.1f}% tierra")

    # 4c. Sanción: grupo 8 (urbano) <= ~15% de tierra
    group8_pct = 100 * cells_by_group["8"] / max(land_cells, 1)
    print(f"\n  SANCIONES:")
    if group8_pct > 15:
        print(f"  ❌ GRUPO 8 (urbano) = {group8_pct:.1f}% de tierra > 15% → FALLO")
    else:
        print(f"  ✅ Grupo 8 (urbano) = {group8_pct:.1f}% de tierra ≤ 15%")

    # 4d. Sanción: grupo 4 (bosque) > 10% de tierra
    group4_pct = 100 * cells_by_group["4"] / max(land_cells, 1)
    if group4_pct <= 10:
        print(f"  ❌ GRUPO 4 (bosque) = {group4_pct:.1f}% de tierra ≤ 10% → FALLO")
    else:
        print(f"  ✅ Grupo 4 (bosque) = {group4_pct:.1f}% de tierra > 10%")

    # 4e. Píxeles de control
    check = check_pixel_control(grid)
    viveiro_group = check["viveiro"].get("group")
    xistral_group = check["xistral"].get("group")
    v_ok = viveiro_group == 8
    x_ok = xistral_group == 4

    print(f"  ✅ Viveiro ({check['viveiro']['lon_lat'][0]:.3f},{check['viveiro']['lon_lat'][1]:.3f})"
          f" → UTM({check['viveiro']['utm'][0]:.0f},{check['viveiro']['utm'][1]:.0f})"
          f" → grupo {viveiro_group}"
          f" {'✅' if v_ok else '❌ (esperado 8)'}")
    print(f"  ✅ Xistral ({check['xistral']['lon_lat'][0]:.3f},{check['xistral']['lon_lat'][1]:.3f})"
          f" → UTM({check['xistral']['utm'][0]:.0f},{check['xistral']['utm'][1]:.0f})"
          f" → grupo {xistral_group}"
          f" {'✅' if x_ok else '❌ (esperado 4)'}")

    if not v_ok or not x_ok:
        print("\n  ⚠️  Píxeles de control NO coinciden. Revisando…")

    # 4f. Concordancia mar
    print(f"  Concordancia mar DEM vs CORINE: {concordance:.1f}% {'✅' if concordance >= 90 else '❌'}")

    # SANCHIÓN: si alguna falla crítica, abortar sin escribir
    if group8_pct > 15:
        print("\n  FALLO CRÍTICO: urbano > 15%. Abortando sin escribir.")
        raise SystemExit("Sanction: grupo 8 supera el 15%")
    if group4_pct <= 10:
        print("\n  FALLO CRÍTICO: bosque ≤ 10%. Abortando sin escribir.")
        raise SystemExit("Sanction: grupo 4 no supera el 10%")
    if concordance < 90:
        print("\n  FALLO CRÍTICO: concordancia mar < 90%. Abortando sin escribir.")
        raise SystemExit("Sanction: concordancia mar demasiado baja")
    if not v_ok:
        print("\n  FALLO CRÍTICO: Viveiro no en grupo 8. Abortando.")
        raise SystemExit("Sanction: Viveiro pixel check failed")
    if not x_ok:
        print("\n  FALLO CRÍTICO: Xistral no en grupo 4. Abortando.")
        raise SystemExit("Sanction: Xistral pixel check failed")

    # 5. Escribir outputs
    print("\n=== Escribiendo outputs ===")

    grid.tofile("public/terrain/assets/lugo-land.u8")
    print(f"  written: public/terrain/assets/lugo-land.u8 ({grid.nbytes:,d} bytes)")

    metadata = {
        "source": [
            "Usos del suelo: CORINE Land Cover 2018 (Copernicus EEA, servicio DisCoMap "
            "image.discomap.eea.europa.eu, capa Corine/CLC2018_WM/MapServer/0), CC BY 4.0",
        ],
        "nomenclature": "CORINE Land Cover 2018 nivel 3 agrupado en 8 familias",
        "scopeNote": (
            "Escala 1:100k agrupada en 8 familias. Sin cauces propios; "
            "ríos y estuarios se ven a través de la clase 511/512 "
            "(grupo 7, agua continental)."
        ),
        "bounds": [WEST, SOUTH, EAST, NORTH],
        "webResolutionMeters": RESOLUTION,
        "width": WIDTH,
        "height": HEIGHT,
        "encoding": "uint8: 0 mar o sin dato, 1-8 grupo de uso",
        "groups": {
            str(g): {"name": name, "corine": list(codes)}
            for g, (name, codes) in GROUPS.items()
        },
        "cellsByGroup": cells_by_group,
        "assetBytes": int(grid.nbytes),
    }

    with open("public/metadata/lugo-land.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"  written: public/metadata/lugo-land.json")

    print("\n=== Resumen ===")
    print(f"  Features CLC descargadas: {len(all_features)}")
    print(f"  Shapes rasterizados: {len(shapes)}")
    print(f"  Celdas con uso: {covered:,d} / {land_cells:,d} ({land_covered_pct:.1f}%)")
    print(f"  Concordancia mar DEM vs CORINE: {concordance:.1f}%")
    print(f"  Viveiro → grupo {viveiro_group}, Xistral → grupo {xistral_group}")


if __name__ == "__main__":
    main()