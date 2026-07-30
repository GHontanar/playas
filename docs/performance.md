# Rendimiento

Medición de build en la máquina de desarrollo, 30-07-2026:

| Recurso | Sin comprimir | gzip aproximado |
|---|---:|---:|
| JavaScript Three.js + aplicación | 615.747 B | 159.000 B |
| DEM visible Float32 | 61.200 B | 20.470 B |
| Caster/horizonte Float32 | 71.120 B | 48.841 B |
| Costa GeoJSON | 1.316 B | 548 B |
| CSS | 3.222 B | 1.370 B |
| Build completo | ~755 KB | < 250 KB transferibles |

Geometría visible: 15.300 vértices, 30.082 triángulos; caster invisible:
17.780 vértices y 35.028 triángulos. Shadow map: 1536² en escritorio
(unos 9 MB para profundidad de 32 bits) y 1024² en móvil (unos 4 MB), más
recursos internos del driver. El
pixel ratio se limita a 1,75 y el antialias se desactiva por encima de 1,5 DPR.

El cambio horario actualiza una luz y el shadow map; no cambia la geometría ni
genera peticiones. Los assets son estáticos y cacheables por Cloudflare.

Se realizó un smoke test headless Chromium a 1280 × 900 y 390 × 844: carga,
WebGL, controles y layout sin errores de página. No se publica un dato de FPS
de ese test porque usa SwiftShader y no representa una GPU móvil.

Pendiente: medición de FPS y memoria GPU en un móvil físico de gama media. Si
fuera necesario, la configuración permite un derivado móvil a 40–50 m sin
cambiar lógica.
