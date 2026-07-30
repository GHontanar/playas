# Validación geográfica, solar y de sombra

## Automatizada

`npm run verify:assets` comprueba CRS, resolución original, dimensiones,
bytes, nodata y rango de elevación. `npm test` cubre zona horaria y DST,
posición solar, Sol bajo el horizonte, conversión angular, configuración y
límites de exageración.

La costa DERA se contrastó contra el DEM remuestreado tomando 26 puntos:
mediana 0,65 m, rango 0–1,73 m y 100 % por debajo de 5 m. Esto detecta
inversión, desplazamiento de hoja y CRS erróneo. La cota máxima del chunk es
42,79 m en la pieza visible; el mar está al este. El caster invisible alcanza
329,95 m.

## Comprobación manual recomendada

Usar el panel con estas fechas de 2026:

| Fecha | Casos |
|---|---|
| 21 junio | salida, 14:00 local, 30 min antes de puesta |
| 23 septiembre | salida, 14:00, tarde |
| 21 diciembre | salida, 13:00, tarde |

Para cada caso verificar azimut de salida al este, Sol meridional al mediodía
y giro al oeste por la tarde. Contrastar salida/puesta con el calendario solar
del Observatorio Astronómico Nacional o PVGIS. SunCalc calcula el centro del
disco con refracción estándar; no sustituye una efeméride de precisión.

El estado “potencialmente oculto” recorre el DEM desde el centro oficial de
Ventanicas en el azimut solar y compara elevación del Sol con el máximo ángulo
del perfil. La sombra visible procede del shadow map de Three.js, no de rotar
un hillshade.

## Límites

- MDT de 2 m remuestreado a 5 m en la pieza visible y 15 m en el caster:
  suficiente para costa, cerros y progresión general,
  no para microrelieve, bordes de acantilado o precisión parcelaria.
- La posición planimétrica de costa es BCA10 1:10.000 (2023); la línea de agua
  real cambia con oleaje, aportes y dinámica litoral.
- No hay edificios, vegetación, muros ni sombrillas.
- La estimación de horizonte usa el centro de playa a 1,5 m; distintos puntos
  de los 502 m de playa pueden perder el Sol en minutos diferentes.
- La atmósfera, nubosidad y refracción local no se modelan.
- Validación fotográfica/local y perfil independiente PVGIS quedan pendientes.
