# Validación geográfica, solar y de sombra

## Automatizada

`npm run verify:assets` comprueba CRS, resolución original, dimensiones,
bytes, nodata, rango de elevación, caster, costa dentro del chunk, orientación
tierra-mar, presencia urbana y presupuesto de la textura. `npm test` cubre
zona horaria y DST, posición solar, Sol bajo el horizonte, conversión angular,
configuración, límites de exageración y orientación de las rompientes.

En Ventanicas, la costa DERA se contrastó contra el DEM remuestreado tomando 26 puntos:
mediana 0,65 m, rango 0–1,73 m y 100 % por debajo de 5 m. Esto detecta
inversión, desplazamiento de hoja y CRS erróneo. La cota máxima del chunk es
42,97 m en la pieza visible; el mar está al este. El caster invisible alcanza
329,95 m.

La regeneración de los siete recortes desde los originales locales se ejecutó
el 30-07-2026 y los tres casters ampliados se regeneraron el 31-07-2026.
Resumen automatizado:

| Playa | DEM visible máx. | Caster máx. | Edificios |
|---|---:|---:|---:|
| Marina de la Torre | 21,45 m | 157,85 m | 193 |
| Descargador | 22,78 m | 749,55 m | 845 |
| Piedra Villazar | 20,56 m | 207,65 m | 324 |
| El Cantal | 28,82 m | 703,22 m | 484 |
| Lance Nuevo | 47,84 m | 750,30 m | 222 |
| Ventanicas | 42,97 m | 329,95 m | 160 |
| Venta del Bancal | 60,02 m | 426,73 m | 340 |

Se inspeccionaron las siete escenas a 900 × 700 y los recortes largos en móvil
a 390 px. Marina de la Torre exigió separar la costa usada por la máscara del
tramo oficial usado por la espuma, para no convertir el puerto en rompiente.

## Validación específica de Lance Nuevo

Se contrastó Lance Nuevo contra el WMS oficial PNOA Máxima Actualidad. La
ortofoto consultada corresponde a julio de 2022 y tiene 0,25 m de resolución.
La geometría DERA `10125300000520` sigue los dos laterales y el extremo del
espigón visible en la imagen; su trazado mide 176,44 m y queda íntegramente
dentro del chunk. El extremo más próximo conserva 43 m de margen hasta el borde
sur del recorte.

El muestreo cada 2 m sobre el MDT02 original dio 0,22 m de mínimo, 0,61 m de
mediana, 0,82 m de media y 1,65 m de máximo. Solo el 38 % de las muestras
supera 1 m. Esto confirmó que una superficie marina visual a 1,5 m ocultaba
gran parte de la estructura aun cuando su planimetría era correcta.

Los puntos Inicio/Centro/Fin de `T05_10_Playa` están respectivamente a 42,26,
61,58 y 17,33 m de la costa DERA. Se consideran referencias del ámbito de
playa, no vértices de la línea de agua.

Para este chunk se usa por ello una máscara poligonal construida con la
topología completa de DERA, un nivel marino base de 0,15 m y una malla
simplificada del espigón. La malla toma la elevación del MDT y aplica solo
0,35 m de separación visual, con un mínimo de 0,18 m sobre el plano marino
para evitar z-fighting; esa separación no se presenta como altura medida. Las
rompientes excluyen la geometría del espigón y se generan por separado en los
dos tramos de costa.

La auditoría detectó además una inversión de handedness: usar simultáneamente
`X+=este`, `Y+=arriba` y `Z+=norte` en el sistema dextrógiro de Three.js
reflejaba la geografía. Las siete playas usan ahora `Z+=sur` mediante
`worldAxes: south-positive`; la misma transformación se aplica al terreno,
costa, capas urbanas, caster y mar, y el vector solar invierte su componente Z.

Las siete cámaras mantienen `roll = 0`, para que el suelo siga siendo
horizontal, y giran alrededor del eje vertical Y mediante un bearing visual de
45°. No se usa el roll para orientar la geografía. La rotación antihoraria de
90° respecto al encuadre anterior deja oeste arriba-izquierda, norte
arriba-derecha, sur abajo-izquierda y este abajo-derecha, conservando el orden
N-E-S-O.

En Venta del Bancal se verificó asimismo la entidad DERA
`10125300000519`. Su trazado estrecho sale de la costa, gira en cabeza y
regresa, con unos 103 m de alcance norte-sur dentro del recorte. Se declara
como `breakwater`, por lo que comparte con Lance Nuevo la máscara marina
poligonal, la representación mineral y la exclusión de las rompientes.

## Contraste solar y de horizonte

Usar el panel con estas fechas de 2026:

| Fecha | Casos |
|---|---|
| 21 junio | salida, 14:00 local, 30 min antes de puesta |
| 23 septiembre | salida, 14:00, tarde |
| 21 diciembre | salida, 13:00, tarde |

La definición de orto/ocaso se contrastó con el
[Observatorio Astronómico Nacional](https://astronomia.ign.es/hora-salidas-y-puestas-de-sol):
sus tablas también usan horizonte astronómico y advierten que el relieve puede
retrasar la salida o adelantar la puesta observada.

El perfil del caster se comparó el 30-07-2026 con
[PVGIS 5.3 `printhorizon`](https://re.jrc.ec.europa.eu/api/v5_3/printhorizon?lat=37.109198&lon=-1.843914&outputformat=json).
PVGIS usa un DEM de unos 90 m, por lo que actúa como contraste independiente,
no como verdad de mayor resolución:

| Azimut norte horario | MDT02 local | PVGIS |
|---:|---:|---:|
| 0° N | 3,7° | 3,1° |
| 45° NE | 0,0° | 0,0° |
| 90° E | 0,0° | 0,0° |
| 135° SE | 0,0° | 0,0° |
| 180° S | 0,0° | 0,0° |
| 225° SO | 9,2° | 8,8° |
| 270° O | 13,1° | 12,6° |
| 315° NO | 8,8° | 11,8° |

La coincidencia es buena en las direcciones solares críticas del oeste. La
diferencia de 3° al NO es compatible con resolución, punto de observación y
extensión distintos. En los solsticios, SunCalc dio 76,2° y 29,4° de elevación
cerca del mediodía; PVGIS dio 76,3° y 29,4°.

### Contraste de las siete playas

El 31-07-2026 se repitió el contraste para los siete centros configurados. Se
muestreó el perfil MDT02 local cada 7,5° y se comparó con el perfil de PVGIS en
la misma posición. La columna occidental cubre 225–315° en azimut norte
horario, que contiene las direcciones solares relevantes antes de la puesta.

| Playa | Error medio oeste | Error medio 360° | Diferencia máxima | Resultado |
|---|---:|---:|---:|---|
| Marina de la Torre | 0,6° | 0,5° | 2,7° | conforme |
| Descargador | 0,4° | 0,2° | 1,1° | conforme |
| Piedra Villazar | 2,1° | 0,7° | 4,4° | conforme |
| El Cantal | 0,6° | 0,3° | 2,4° | conforme |
| Lance Nuevo | 0,5° | 0,4° | 2,3° | conforme |
| Ventanicas | 1,1° | 0,6° | 3,0° | conforme |
| Venta del Bancal | 2,1° | 0,7° | 4,7° | conforme |

Como comprobación de impacto se calculó el último minuto con el Sol por encima
del perfil el 21 de junio, 23 de septiembre y 21 de diciembre de 2026. Se
muestra `MDT02/PVGIS`, en hora local `Europe/Madrid`:

| Playa | 21 junio | 23 septiembre | 21 diciembre |
|---|---:|---:|---:|
| Marina de la Torre | 21:02/21:02 | 19:34/19:32 | 17:13/17:20 |
| Descargador | 21:00/21:06 | 19:32/19:31 | 17:06/17:10 |
| Piedra Villazar | 21:06/21:04 | 19:36/19:20 | 17:33/17:12 |
| El Cantal | 20:41/20:46 | 19:07/19:08 | 17:30/17:15 |
| Lance Nuevo | 20:28/20:27 | 19:07/19:11 | 17:17/17:13 |
| Ventanicas | 20:22/20:16 | 18:58/19:05 | 16:48/16:50 |
| Venta del Bancal | 19:54/19:48 | 18:32/18:45 | 16:54/17:06 |

La tabla anterior expresa el último minuto de Sol directo. La interfaz muestra
como inicio aproximado de sombra el minuto siguiente. Tras ampliar los casters,
los resultados mostrados por el producto son:

| Playa | 21 junio | 23 septiembre | 21 diciembre |
|---|---:|---:|---:|
| Marina de la Torre | 21:03 · 28 min | 19:35 · 30 min | 17:14 · 40 min |
| Descargador | 21:01 · 30 min | 19:33 · 32 min | 17:07 · 47 min |
| Piedra Villazar | 21:07 · 24 min | 19:37 · 28 min | 17:34 · 20 min |
| El Cantal | 20:42 · 49 min | 19:08 · 57 min | 17:31 · 23 min |
| Lance Nuevo | 20:29 · 62 min | 19:08 · 57 min | 17:18 · 36 min |
| Ventanicas | 20:23 · 68 min | 18:59 · 66 min | 16:49 · 65 min |
| Venta del Bancal | 19:55 · 96 min | 18:33 · 92 min | 16:55 · 59 min |

Cada celda contiene `inicio de sombra · adelanto respecto a puesta`. El cálculo
recorre hacia atrás desde la puesta estándar de SunCalc hasta encontrar el
último minuto cuya elevación supera el perfil MDT02 en el azimut correspondiente.
Se cachea por fecha y no depende del estado del deslizador horario.

La diferencia absoluta máxima es 21 minutos. Es coherente con la diferencia de
resolución entre MDT02 y el DEM de unos 90 m de PVGIS, y con la sensibilidad
del cruce solar cuando el perfil tiene varias crestas próximas. Estos valores
validan el orden de magnitud y la progresión norte-sur; no deben publicarse aún
como una hora garantizada para toda la extensión de una playa.

También se midió la distancia entre el obstáculo que determina el perfil y el
borde del caster. Los recortes de Descargador, El Cantal y Lance Nuevo se
ampliaron y regeneraron hasta dejar respectivamente 960, 555 y 765 m después
del obstáculo crítico. Descargador cubre el corredor occidental completo de
6 km empleado por el algoritmo porque su horizonte invernal depende de una
cresta continua de Sierra Cabrera situada a unos 5 km. En el conjunto de las
siete playas el margen mínimo es 465 m en Piedra Villazar.

La validación de cobertura queda aprobada para las siete playas. La ampliación
redujo además el error medio occidental de Descargador, El Cantal y Lance Nuevo
a 0,4–0,6° frente a PVGIS. No se detectan inversiones, orientaciones
incorrectas ni máximos truncados por los nuevos bordes.

El estado “potencialmente oculto” recorre el caster desde el centro configurado
de cada playa en el azimut solar y compara elevación del Sol con el máximo
ángulo del perfil. La sombra visible procede del shadow map de Three.js, no de
rotar un hillshade.

## Validación de la variante artística

La variante `mediterranean-illustrated` se comprobó primero de forma aislada en
Lance Nuevo a mediodía, con Sol bajo, de noche y a 390 px de ancho. Tras
extenderla, se revisaron las siete playas en escritorio y Venta del Bancal a
390 px como caso móvil adicional. La
geometría geográfica, el vector solar y el shadow map no cambian: el tratamiento
artístico afecta a materiales, paleta, luz de relleno, atmósfera, agua y
acabado del pedestal.

El gradiente y el brillo del agua, la arena húmeda, las cubiertas coloreadas,
los trazos del viario y los estratos laterales son recursos visuales. No
representan batimetría, humedad medida, materiales constructivos ni geología
clasificada. Las rompientes continúan ligadas a la costa derivada y excluyen
el espigón; su escala y cadencia están exageradas intencionadamente.

## Límites

- MDT de 2 m remuestreado a 2,5 m con una pasada de suavizado visual, y 15 m
  sin suavizado en el caster:
  suficiente para costa, cerros y progresión general,
  no para microrelieve, bordes de acantilado o precisión parcelaria.
- La posición planimétrica de costa es BCA10 1:10.000 (2023); la línea de agua
  real cambia con oleaje, aportes y dinámica litoral.
- Los edificios son prismas de partes catastrales. Su altura usa plantas ×
  3,1 m; no reproduce cubiertas, balcones ni alturas medidas. No hay vegetación,
  muros ni sombrillas.
- La estimación de horizonte usa el centro de cada playa a 1,5 m; distintos
  puntos de una playa pueden perder el Sol en minutos diferentes.
- El contraste PVGIS y la cobertura del caster se han validado en las siete
  playas. El menor margen después de un obstáculo crítico es 465 m.
- La atmósfera, nubosidad y refracción local no se modelan.
- La validación fotográfica o mediante observación local sigue pendiente.
