# Rendimiento

Medición de build en la máquina de desarrollo, 31-07-2026:

| Recurso | Sin comprimir | gzip aproximado |
|---|---:|---:|
| JavaScript Three.js + aplicación | ~694 KB | ~183 KB |
| DEM visible Float32 por playa | 140–424 KB | 78–161 KB |
| Caster/horizonte por playa | 69–884 KB | depende del recorte |
| Costa GeoJSON | 1.316 B | 549 B |
| Edificios catastrales GeoJSON | 86.405 B | 14.990 B |
| Calles OSM GeoJSON | 13.597 B | 5.658 B |
| Normal map del agua WebP | 60.330 B | 60.390 B |
| CSS | 3.339 B | 1.440 B |
| Todos los derivados de las 7 playas | 5.474.864 B | no se cargan conjuntamente |

La playa seleccionada carga únicamente sus seis derivados; cambiarla navega a
otra URL y permite que el navegador libere la escena anterior. El mayor DEM
visible comprimido mide unos 161 KB. El caster excepcional de Descargador
ocupa 884 KB sin comprimir porque conserva el corredor orográfico completo de
6 km; solo se carga al abrir esa playa.
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

### Medición del despliegue

El 31-07-2026 se midió una carga fría contra Cloudflare Pages con compresión
HTTP activa. La portada transfiere aproximadamente 730.011 B (0,70 MiB) y la
ficha de Ventanicas 603.149 B (0,58 MiB). La medición incluye HTML, CSS,
JavaScript compartido, DEM, caster, costa, edificios, calles, textura de agua y
respuesta de estado. No incluye fuentes de Google ni la respuesta de Open-Meteo,
que dependen de caché y red externa.

El HTML de producción respondió desde Madrid con unos 64–68 ms hasta completar
la respuesta en una conexión caliente de desarrollo. Este valor solo comprueba
CDN y servidor; no representa una red móvil.

Los DEM, casters, bundles con hash y la textura WebP se sirven con
`max-age=31536000, immutable`. El HTML y la API revalidan correctamente; la API
usa 30 s en navegador y 60 s en caché compartida. La textura mide 512 × 512 y
60 KB transferidos.

La portada inicia en paralelo DEM, caster, costa, ciudad y textura, pero su
primera pintura solo espera terreno visible, costa y mar. El indicador de carga
se retira antes de triangular las masas urbanas y preparar el caster; estas
capas se incorporan después sin cambiar la cámara. La costa se descarga y
parsea una sola vez aunque la compartan mar, borde y zonas de playa.

El caster dispone de una ruta específica sin colores, UV, normales visuales ni
material toon. En una medición Node orientativa del caster del overview, su
construcción bajó de 31–111 ms a 6–12 ms tras calentar cachés. La construcción
urbana del overview costó unos 203 ms en esa misma CPU y ahora se ejecuta
después de la primera pintura. Son comparaciones de CPU de desarrollo, no
métricas atribuibles a un teléfono.

La portada registra `coast-time-to-model` y
`coast-time-to-complete-scene` mediante User Timing para que una sesión remota
en móvil pueda medir por separado primera maqueta y escena completa.

La portada crea 70.125 vértices visibles y 17.384 en el caster; Ventanicas,
61.200 y 17.780 respectivamente. En móvil se mantiene el shadow map de 1024²,
equivalente a unos 4 MiB solo para su textura de profundidad, se limita el DPR y
se desactiva antialiasing en pantallas de alta densidad.

### Validación en dispositivos físicos

La navegación, animación e interacción se validaron manualmente en un Nothing
Phone 3 y un Redmi 14 sin fallos funcionales. En ambos, la incomodidad observada
fue el tiempo hasta la primera costa; el render progresivo descrito arriba se
introdujo específicamente para reducirlo. No había una sesión de depuración
remota conectada, por lo que no se atribuyen FPS, memoria GPU o consumo térmico
a esa observación. Para obtener cifras se repetirá este protocolo:

1. Chrome actualizado, caché vacía y ahorro de batería desactivado.
2. Abrir `/`, recorrer los cuatro keyframes dos veces y registrar 20 s en el
   panel Performance de DevTools remoto.
3. Abrir Ventanicas, mantener el mar animado 30 s y cambiar la hora cinco veces
   mientras se registra otro tramo de 20 s.
4. Anotar FPS mediano y percentil 5, memoria JS, memoria GPU si el dispositivo
   la expone, tiempo hasta primera maqueta y frames largos superiores a 50 ms.
5. Repetir con el teléfono caliente después de cinco minutos.

Criterio provisional: al menos 30 FPS sostenidos, interacción horaria sin
pausas visibles mayores de 100 ms y ausencia de crecimiento continuado de
memoria entre dos recorridos. Si no se cumple, la configuración permite un DEM
de portada a 40–50 m, shadow map de 768² y DPR máximo de 1,25 sin cambiar la
lógica.
