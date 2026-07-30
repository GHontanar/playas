# Fuentes geográficas

Fecha de comprobación: 30 de julio de 2026.

## Elevación

Se usa **MDT02, 2.ª cobertura PNOA (2015–2021)** del IGN/CNIG: modelo de
terreno desnudo interpolado a partir de puntos LiDAR clasificados como suelo.

| Campo | Valor |
|---|---|
| Paso de malla | 2 m |
| Cobertura local | vuelo/derivado de 2020 |
| Formato original | COG GeoTIFF, Float32 |
| CRS | ETRS89 / UTM 30N (EPSG:25830), alturas ortométricas |
| Hojas | `1031-2` y `1032-1` |
| Ficheros | `MDT02-ETRS89-HU30-1031-2-COB2.TIF`, `MDT02-ETRS89-HU30-1032-1-COB2.TIF` |
| Tamaños descargados | 108.911.204 B y 13.108.768 B |
| Identificadores CNIG | `11275511`, `11275514` |
| Descarga | Centro de Descargas CNIG; automatizada por `scripts/download-dem.sh` |

La playa cruza el borde de dos hojas. Usar solo `1032-1` dejaría menos de
un kilómetro de terreno al oeste y eliminaría cerros relevantes para el
horizonte de tarde.

Página oficial:
<https://centrodedescargas.cnig.es/CentroDescargas/catalogo.do?Serie=MDT02>.
El CNIG indica que las láminas de agua son interpoladas y su cota tiene baja
fiabilidad. El pipeline fija a cero únicamente los valores negativos del agua.

Licencia compatible con **CC BY 4.0** conforme a la Orden FOM/2807/2015.
Fórmula aplicada al derivado:

> Obra derivada de MDT02-cob2 2015-2021 CC-BY 4.0 scne.es

## Costa

Se usa `T01_07_LineaCostaAndalucia` de **Datos Espaciales de Referencia de
Andalucía (DERA), IECA**, procedente de la Base Cartográfica de Andalucía
BCA10 a escala 1:10.000 y restituida de vuelos PNOA.

| Campo | Valor |
|---|---|
| Publicación/actualización de la capa | 30-01-2023 |
| Formato original | GeoPackage dentro de ZIP (150 MB comprimidos) |
| CRS | EPSG:25830 |
| Descarga | `094-dera-1-relieve-gpkg.zip` |
| Licencia | CC BY 4.0 |
| Derivado web | GeoJSON recortado, 1.316 B |

Página oficial:
<https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/datos-espaciales-de-referencia-de-andalucia-dera/descarga-de-informacion>.

El Catálogo General de Playas de Andalucía aporta los extremos oficiales de
Ventanicas (ID 351): `(602620,3, 4107374,0)` y
`(602817,0, 4107849,0)`, ETRS89/UTM 30N, y 502 m de longitud:
<https://www.juntadeandalucia.es/boja/2021/94/56>.
Se usan para centro e identificación, no para inventar la costa.

La descarga KML del conjunto REDIAM 2011 devuelve actualmente 404. Por eso se
eligió la capa vectorial DERA reproducible y más reciente, en lugar de copiar
una geometría desde un visor o recurrir a OSM.
