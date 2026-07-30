# Rendimiento

Medición de build en la máquina de desarrollo, 30-07-2026:

| Recurso | Sin comprimir | gzip aproximado |
|---|---:|---:|
| JavaScript Three.js + aplicación | 672.350 B | 176.940 B |
| DEM visible Float32 | 244.800 B | 80.530 B |
| Caster/horizonte Float32 | 71.120 B | 48.943 B |
| Costa GeoJSON | 1.316 B | 549 B |
| Edificios catastrales GeoJSON | 86.405 B | 14.990 B |
| Calles OSM GeoJSON | 13.597 B | 5.658 B |
| Normal map del agua WebP | 60.330 B | 60.390 B |
| CSS | 3.339 B | 1.440 B |
| Build y assets principales | ~1,16 MB | ~390 KB transferibles |

Geometría visible: 61.200 vértices, 121.362 triángulos; caster invisible:
17.780 vértices y 35.028 triángulos. Shadow map: 1536² en escritorio
(unos 9 MB para profundidad de 32 bits) y 1024² en móvil (unos 4 MB), más
recursos internos del driver. El
pixel ratio se limita a 1,75 y el antialias se desactiva por encima de 1,5 DPR.

Las 160 partes de edificio se fusionan en cinco mallas, una por color de la
paleta; las calles se fusionan en una sexta malla. Así la capa urbana añade seis
llamadas de dibujo principales, no una por edificio.

El cambio horario actualiza una luz y el shadow map; no cambia la geometría ni
genera peticiones. Los assets son estáticos y cacheables por Cloudflare.
El oleaje usa un plano subdividido de 17.557 vértices deformado en el vertex
shader y cuatro cintas costeras pequeñas. Cada frame actualiza cuatro uniforms y
las posiciones de las cintas; seleccionar otro estado no crea geometría ni
peticiones.

Se realizó un smoke test headless Chromium a 1280 × 900 y 390 × 844: carga,
WebGL, controles y layout sin errores de página. No se publica un dato de FPS
de ese test porque usa SwiftShader y no representa una GPU móvil.

Pendiente: medición de FPS y memoria GPU en un móvil físico de gama media. Si
fuera necesario, la configuración permite un derivado móvil a 40–50 m sin
cambiar lógica.
