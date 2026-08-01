import glob, json
import numpy as np, rasterio
from rasterio.merge import merge
from rasterio.enums import Resampling
from collections import deque

W,S,E,N = 557600,4060000,612000,4125000
RES = 100
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
land=h[h>0.5]
print(f'cota máx {h.max():.1f} m · mediana tierra {np.median(land):.1f} m · tierra {100*(h>0.5).mean():.1f}%')
h.tofile('/tmp/levante-dem.f32')
json.dump({'bounds':[W,S,E,N],'webResolutionMeters':RES,'width':int(Wd),'height':int(H),
           'maxElevation':float(h.max()),'minElevation':0.0,
           'seaCells':int(water.sum()),'assetBytes':int(h.nbytes)},
          open('/tmp/levante-dem.json','w'), indent=2)
n=(h-h.min())/max(1e-6,h.max()-h.min())
prev=(n*255).astype(np.uint8)
open('/tmp/levante.pgm','wb').write(b'P5\n%d %d\n255\n'%(Wd,H)+prev.tobytes())
