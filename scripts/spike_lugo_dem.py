#!/usr/bin/env python3
"""Genera el DEM de la Mariña Lucense (EPSG:25829) a partir del tile GLO-30.

Tile Copernicus DEM GLO-30: N43_00_W008_00 (Lat 43-44, Lon -8/-7, 30 m, EPSG:4326).
Recorte UTM 29N (EPSG:25829): 609215, 4799988, 661153, 4849303.
Rejilla web 50 m → 1039 × 987 celdas.

Escrito a public/terrain/assets/lugo-dem.f32 y public/metadata/lugo-dem.json.
Preview → /tmp/lugo.pgm.
"""
import json
import glob

import numpy as np
import rasterio
from rasterio.warp import reproject
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from collections import deque

WEST, SOUTH, EAST, NORTH = 609215, 4799988, 661153, 4849303
RES = 50
WIDTH = int(np.ceil((EAST - WEST) / RES))     # 1039
HEIGHT = int(np.ceil((NORTH - SOUTH) / RES))   # 987

# Un tile GLO-30 cubre Lat 43-44, Lon -8/-7 → abarca el recorte Lugo.
src_ds = rasterio.open(glob.glob('data/source/dem-glo30-lugo/*.tif')[0])
dst = np.zeros((HEIGHT, WIDTH), dtype=np.float32)
reproject(
    src_ds.read(1),
    dst,
    src_crs='EPSG:4326',
    dst_crs='EPSG:25829',
    src_transform=src_ds.transform,
    dst_transform=from_origin(WEST, NORTH, RES, RES),
    resampling=Resampling.bilinear,
)
src_ds.close()

print(f'malla {WIDTH}x{HEIGHT} = {WIDTH*HEIGHT/1000:.0f}k vértices, {WIDTH*HEIGHT*4/1e6:.2f} MB')

# Mar: cota <= 0.05 conectada con el borde del recorte (BFS 4-conexo).
sea_like = dst <= 0.05
water = np.zeros_like(sea_like, dtype=bool)
q: deque[tuple[int, int]] = deque()

for r in range(HEIGHT):
    for c in (0, WIDTH - 1):
        if sea_like[r, c] and not water[r, c]:
            water[r, c] = True
            q.append((r, c))
for c in range(WIDTH):
    for r in (0, HEIGHT - 1):
        if sea_like[r, c] and not water[r, c]:
            water[r, c] = True
            q.append((r, c))

while q:
    r, c = q.popleft()
    for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < HEIGHT and 0 <= cc < WIDTH and sea_like[rr, cc] and not water[rr, cc]:
            water[rr, cc] = True
            q.append((rr, cc))

dst[water] = 0.0
print(f'mar por inundación: {int(water.sum())} celdas ({100 * water.mean():.1f}%)')

# Eliminar islotes: altura máxima por componente conectada de tierra.
ISLET_MAX_M = 1.5
labels = np.zeros(dst.shape, np.int32)
component = 0
mainland = (0, 0)
islets: list[tuple[int, np.ndarray, float]] = []

for r0 in range(HEIGHT):
    for c0 in range(WIDTH):
        if water[r0, c0] or labels[r0, c0]:
            continue
        component += 1
        stack = deque([(r0, c0)])
        labels[r0, c0] = component
        cells = []
        while stack:
            r, c = stack.popleft()
            cells.append((r, c))
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                rr, cc = r + dr, c + dc
                if 0 <= rr < HEIGHT and 0 <= cc < WIDTH and not water[rr, cc] and not labels[rr, cc]:
                    labels[rr, cc] = component
                    stack.append((rr, cc))
        cells = np.array(cells)
        if len(cells) > mainland[1]:
            mainland = (component, len(cells))
        peak = float(dst[cells[:, 0], cells[:, 1]].max())
        islets.append((component, cells, peak))

dropped = 0
for comp, cells, peak in islets:
    if comp == mainland[0] or peak >= ISLET_MAX_M:
        continue
    dst[cells[:, 0], cells[:, 1]] = 0.0
    dropped += len(cells)

islet_count = sum(1 for c, _, pk in islets if c != mainland[0] and pk < ISLET_MAX_M)
print(f'islotes descartados: {dropped} celdas en {islet_count} manchas')

# Mar a cota 0 y celdas negativas a 0.
dst[dst < 0] = 0

land = dst[dst > 0.5]
print(f'cota máx {dst.max():.1f} m · mediana tierra {np.median(land):.1f} m · tierra {100 * (dst > 0.5).mean():.1f}%')

# Escribir asset
dst.tofile('public/terrain/assets/lugo-dem.f32')
json.dump({
    'bounds': [WEST, SOUTH, EAST, NORTH],
    'webResolutionMeters': RES,
    'width': WIDTH,
    'height': HEIGHT,
    'maxElevation': float(dst.max()),
    'minElevation': 0.0,
    'seaCells': int(water.sum()),
    'isletCellsDropped': int(dropped),
    'isletMaxMetres': ISLET_MAX_M,
    'assetBytes': int(dst.nbytes),
}, open('public/metadata/lugo-dem.json', 'w'), indent=2)

# Preview PGM
n = (dst - dst.min()) / max(1e-6, dst.max() - dst.min())
prev = (n * 255).astype(np.uint8)
open('/tmp/lugo.pgm', 'wb').write(b'P5\n%d %d\n255\n' % (WIDTH, HEIGHT) + prev.tobytes())