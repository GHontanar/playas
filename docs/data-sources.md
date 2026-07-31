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
| Hojas | Mojácar: `1015-3`, `1031-2`, `1032-1`; Carboneras: `1031-4`, `1046-2`, `1046-4` |
| Ficheros | `MDT02-ETRS89-HU30-{1015-3,1031-2,1032-1}-COB2.TIF` |
| Tamaños descargados | 35.089.768 B, 108.911.204 B y 13.108.768 B |
| Identificadores CNIG | `11275463`, `11275511`, `11275514` |
| Descarga | Centro de Descargas CNIG; automatizada por `scripts/download-dem.sh` |

Las hojas adicionales de Carboneras son `1031-4`, `1046-2` y `1046-4`, con
identificadores CNIG `11275513`, `11275563` y `11275565` y tamaños
104.074.255 B, 67.717.991 B y 20.969.021 B respectivamente.

Las playas de cada municipio y sus casters cruzan tres hojas. La hoja `1015-3` completa el
extremo norte de Marina de la Torre; `1031-2` conserva los cerros occidentales
relevantes para el horizonte de tarde. En Carboneras, `1031-4` evita cortar
Ancón y Algarrobico al norte de 37°; las dos mitades orientales de `1046`
cubren el casco urbano, Los Muertos y el litoral meridional.

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

El Catálogo General de Playas de Andalucía, capa DERA `T05_10_Playa`, aporta
centro, extremos y longitud oficiales. Se usan para identificar y limitar las
rompientes de las siete playas; la línea tierra-mar sigue procediendo de
`T01_07_LineaCostaAndalucia`, no de una geometría dibujada a mano. `Lance
Nuevo` se corresponde con la entidad oficial `Playa Lance`.

La descarga KML del conjunto REDIAM 2011 devuelve actualmente 404. Por eso se
eligió la capa vectorial DERA reproducible y más reciente, en lugar de copiar
una geometría desde un visor o recurrir a OSM.

## Edificios

Se usa el servicio ATOM INSPIRE Buildings de la Dirección General del Catastro,
municipios `04064-MOJACAR` y `04032-CARBONERAS`. El fichero
`A.ES.SDGC.BU.04064.buildingpart.gml` contiene polígonos EPSG:25830 y
`numberOfFloorsAboveGround`. Cada recorte contiene únicamente las partes que
intersectan su chunk.

Descarga:
<https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/04064-MOJACAR/A.ES.SDGC.BU.04064.zip>.
Para Carboneras se usa
<https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/04032-CARBONERAS/A.ES.SDGC.BU.04032.zip>.
El servicio permite el uso gratuito mencionando a la Dirección General del
Catastro como autora y propietaria.

Las alturas son aproximaciones declaradas: `plantas × 3,1 m`. No se presentan
como alturas LiDAR ni arquitectónicas exactas.

## Calles

Los ejes proceden de OpenStreetMap mediante una consulta Overpass reproducible,
se filtran por `highway` y se convierten en polígonos simplificados durante el
pipeline. Datos © OpenStreetMap contributors, licencia ODbL 1.0:
<https://www.openstreetmap.org/copyright>.
