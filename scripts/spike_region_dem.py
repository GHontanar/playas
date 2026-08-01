import glob, json
import numpy as np, rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from collections import deque

W,S,E,N = 557600,4060000,612000,4125000
RES = 50
srcs=[rasterio.open(p) for p in sorted(glob.glob('data/source/mdt25/*.TIF'))]
mosaic, transform = merge(srcs, bounds=(W,S,E,N), res=RES, nodata=-32767,
                          resampling=Resampling.average)
for s in srcs: s.close()
h = mosaic[0].astype('<f4')
H, Wd = h.shape
missing = h <= -32000
print(f'malla {Wd}x{H} = {Wd*H/1000:.0f}k vértices, {Wd*H*4/1e6:.2f} MB')
print(f'nodata bruto: {missing.sum()} celdas ({100*missing.mean():.1f}%)')

# Mar: nodata o cota <= 0 conectado con el borde del recorte.
sea_like = missing | (h <= 0.05)
water = np.zeros_like(sea_like)
q = deque()
for r in range(H):
    for c in (0, Wd-1):
        if sea_like[r,c] and not water[r,c]: water[r,c]=True; q.append((r,c))
for c in range(Wd):
    for r in (0, H-1):
        if sea_like[r,c] and not water[r,c]: water[r,c]=True; q.append((r,c))
while q:
    r,c=q.popleft()
    for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)):
        rr,cc=r+dr,c+dc
        if 0<=rr<H and 0<=cc<Wd and sea_like[rr,cc] and not water[rr,cc]:
            water[rr,cc]=True; q.append((rr,cc))
h[water]=0.0
interior = h <= -32000
print(f'mar por inundación: {water.sum()} celdas ({100*water.mean():.1f}%)')
print(f'nodata interior sin resolver: {interior.sum()}')
if interior.any():
    rs,cs=np.where(interior)
    print('  bbox interior nodata: x[%.0f,%.0f] y[%.0f,%.0f]'%(
        W+cs.min()*RES, W+cs.max()*RES, N-rs.max()*RES, N-rs.min()*RES))
    h[interior]=0.0
h[h<0]=0

# El MDT deja sobre el mar celdas con cotas de pocos decímetros, sobre todo
# alrededor de Cabo de Gata, y el umbral de 0,05 m las clasifica como tierra:
# salen islotes donde solo hay agua. Se descartan por componente: una isla que
# no supera ISLET_MAX_M en un modelo derivado de 25 m es ruido de medida, no
# tierra. El corte deja fuera 244 manchas que no pasan de 0,8 m y conserva la
# Isla de San Andrés, frente a Carboneras, que llega a 6,8 m.
ISLET_MAX_M = 1.5
labels = np.zeros(h.shape, np.int32)
component = 0
mainland = (0, 0)
islets = []
for r0 in range(H):
    for c0 in range(Wd):
        if water[r0,c0] or labels[r0,c0]:
            continue
        component += 1
        stack = deque([(r0,c0)]); labels[r0,c0] = component; cells = []
        while stack:
            r,c = stack.popleft(); cells.append((r,c))
            for dr,dc in ((1,0),(-1,0),(0,1),(0,-1)):
                rr,cc = r+dr, c+dc
                if 0<=rr<H and 0<=cc<Wd and not water[rr,cc] and not labels[rr,cc]:
                    labels[rr,cc] = component; stack.append((rr,cc))
        cells = np.array(cells)
        if len(cells) > mainland[1]:
            mainland = (component, len(cells))
        islets.append((component, cells, float(h[cells[:,0], cells[:,1]].max())))
dropped = 0
for component, cells, peak in islets:
    if component == mainland[0] or peak >= ISLET_MAX_M:
        continue
    h[cells[:,0], cells[:,1]] = 0.0
    dropped += len(cells)
print(f'islotes descartados: {dropped} celdas en {sum(1 for c,_,pk in islets if c != mainland[0] and pk < ISLET_MAX_M)} manchas')

land=h[h>0.5]
print(f'cota máx {h.max():.1f} m · mediana tierra {np.median(land):.1f} m · tierra {100*(h>0.5).mean():.1f}%')
h.tofile('/tmp/levante-dem.f32')
json.dump({'bounds':[W,S,E,N],'webResolutionMeters':RES,'width':int(Wd),'height':int(H),
           'maxElevation':float(h.max()),'minElevation':0.0,
           'seaCells':int(water.sum()),'isletCellsDropped':int(dropped),'isletMaxMetres':ISLET_MAX_M,'assetBytes':int(h.nbytes)},
          open('/tmp/levante-dem.json','w'), indent=2)
n=(h-h.min())/max(1e-6,h.max()-h.min())
prev=(n*255).astype(np.uint8)
open('/tmp/levante.pgm','wb').write(b'P5\n%d %d\n255\n'%(Wd,H)+prev.tobytes())
