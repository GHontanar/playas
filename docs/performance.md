# Rendimiento

Medición de build en la máquina de desarrollo, 31-07-2026:

| Recurso | Sin comprimir | gzip aproximado |
|---|---:|---:|
| JavaScript Three.js + aplicación | ~694 KB | ~183 KB |
| DEM visible Float32 por playa | 140–424 KB | 78–161 KB |
| Caster/horizonte por playa | 76–146 KB | 49–101 KB |
| Costa GeoJSON | 1.316 B | 549 B |
| Edificios catastrales GeoJSON | 86.405 B | 14.990 B |
| Calles OSM GeoJSON | 13.597 B | 5.658 B |
| Normal map del agua WebP | 60.330 B | 60.390 B |
| CSS | 3.339 B | 1.440 B |
| Todos los derivados de las 7 playas | 4.679.467 B | no se cargan conjuntamente |

La playa seleccionada carga únicamente sus seis derivados; cambiarla navega a
otra URL y permite que el navegador libere la escena anterior. El mayor DEM
visible comprimido mide unos 161 KB y el mayor caster unos 101 KB.
Shadow map: 1536² en escritorio
(unos 9 MB para profundidad de 32 bits) y 1024² en móvil (unos 4 MB), más
recursos internos del driver. El
pixel ratio se limita a 1,75 y el antialias se desactiva por encima de 1,5 DPR.

Las partes de edificio de cada playa se fusionan en cinco mallas, una por color de la
paleta; las calles se fusionan en una sexta malla. Así la capa urbana añade seis
llamadas de dibujo principales, no una por edificio.

La variante ilustrada añade por playa tres mallas de cubiertas, un contorno
viario, cintas de arena húmeda, un borde de zócalo y una sombra de contacto.
Lance Nuevo y Venta del Bancal suman además una malla de espigón. No añade
descargas ni texturas nuevas. El cálculo de distancia a costa se realiza una
sola vez al crear el plano marino.

El cambio horario actualiza una luz y el shadow map; no cambia la geometría ni
genera peticiones. Los assets son estáticos y cacheables por Cloudflare.
El modo volumétrico desplaza el plano marino y calcula las
normales en el vertex shader; la espuma se deriva en el fragment shader. Cada
frame actualiza únicamente el tiempo. No recalcula geometría en CPU, no añade
draw calls y no genera peticiones. El modo anterior permanece disponible en
Depuración para comparación.

El overview municipal carga aproximadamente 755 KB de derivados sin comprimir:
281 KB de DEM, 70 KB de caster, 150 KB de masas catastrales generalizadas,
149 KB de viario simplificado y 37 KB de costa. No descarga los siete chunks
detallados. En el build, Three.js se comparte entre las entradas y el código
específico de `/coast/` añade unos 7 KB (3,2 KB gzip).

Se realizó un smoke test headless Chromium a 1280 × 900 y 390 × 844: carga,
WebGL, controles y layout sin errores de página. No se publica un dato de FPS
de ese test porque usa SwiftShader y no representa una GPU móvil.

Pendiente: medición de FPS y memoria GPU en un móvil físico de gama media. Si
fuera necesario, la configuración permite un derivado móvil a 40–50 m sin
cambiar lógica.
