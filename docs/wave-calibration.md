# Calibración visual del oleaje

## Fuente y alcance

La animación usa `wave_height`, `wave_period` y `wave_direction` de Open-Meteo
Marine. Las siete coordenadas de playa resuelven actualmente a la misma celda
de previsión marina (`37.125, -1.7916565`), por lo que se aplica una calibración
común. No se introducen factores de orientación ni exposición por playa.

Para fijar los umbrales se analizaron 43.824 valores horarios de Hs de
ERA5-Ocean entre 2021-01-01 y 2025-12-31 en la celda histórica seleccionada
(`37.0, -2.0`). En julio-agosto, la mediana fue 0,48 m, P75 0,64 m, P90 0,88 m
y P95 1,04 m. En el conjunto anual fueron 0,52 m, 0,78 m, 1,14 m y 1,38 m.

Fuentes de contraste:

- [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api)
- [Clima medio de la boya de Cabo de Gata](https://bancodatos.puertos.es/BD/informes/medios/MED_1_2_2548.pdf)

La boya está en aguas profundas y no representa directamente la rompiente de
Mojácar. Se conserva como contraste de orden de magnitud, no como entrada del
renderer.

## Estados

| Estado artístico | Altura significativa Hs |
|---|---:|
| `calm` | `< 0,45 m` |
| `moderate` | `0,45–0,89 m` |
| `rough` | `>= 0,90 m` |

No equivalen a la escala Douglas, a la bandera ni a un criterio de seguridad.
Hs selecciona el preset; el valor exacto ajusta amplitud y cresta dentro de un
rango acotado. El periodo ajusta longitud y velocidad visual. Los cambios se
interpolan en aproximadamente uno o dos segundos y no reconstruyen geometría.

## Comportamiento sin datos

Si no existe previsión para la fecha seleccionada se usa `moderate` como estado
visual de fallback y la tarjeta declara que no hay previsión. El selector de
depuración permite forzar cualquiera de los tres presets; `Automático` vuelve a
usar el modelo.

## Futuro

La dirección queda preservada en el contrato, pero todavía no modifica la
incidencia de las crestas. Una adaptación por playa deberá partir de orientación
costera, exposición y apantallamiento, y documentarse como derivación separada.
