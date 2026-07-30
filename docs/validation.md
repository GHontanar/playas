# Validación geográfica, solar y de sombra

## Automatizada

`npm run verify:assets` comprueba CRS, resolución original, dimensiones,
bytes, nodata, rango de elevación, caster, costa dentro del chunk, orientación
tierra-mar, presencia urbana y presupuesto de la textura. `npm test` cubre
zona horaria y DST, posición solar, Sol bajo el horizonte, conversión angular,
configuración, límites de exageración y orientación de las rompientes.

La costa DERA se contrastó contra el DEM remuestreado tomando 26 puntos:
mediana 0,65 m, rango 0–1,73 m y 100 % por debajo de 5 m. Esto detecta
inversión, desplazamiento de hoja y CRS erróneo. La cota máxima del chunk es
42,97 m en la pieza visible; el mar está al este. El caster invisible alcanza
329,95 m.

La regeneración completa desde los originales locales se ejecutó el 30-07-2026.
Los SHA-256 de DEM, caster, costa, edificios y calles coincidieron antes y
después: el pipeline produjo derivados deterministas.

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

El estado “potencialmente oculto” recorre el DEM desde el centro oficial de
Ventanicas en el azimut solar y compara elevación del Sol con el máximo ángulo
del perfil. La sombra visible procede del shadow map de Three.js, no de rotar
un hillshade.

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
- La estimación de horizonte usa el centro de playa a 1,5 m; distintos puntos
  de los 502 m de playa pueden perder el Sol en minutos diferentes.
- La atmósfera, nubosidad y refracción local no se modelan.
- La validación fotográfica o mediante observación local sigue pendiente.
