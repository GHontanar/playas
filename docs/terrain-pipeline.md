# Pipeline de terreno

Los GeoTIFF y el GeoPackage originales no se guardan en Git. Los derivados web
pequeños sí se versionan y permiten que el cliente funcione sin llamar al CNIG
ni a la Junta.

## Entorno

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-geo.txt
```

## Regeneración completa

```sh
scripts/download-dem.sh
scripts/download-coastline.sh
scripts/download-urban.sh
scripts/download-barreiros.sh
scripts/inspect-dem.sh
npm run data:beach -- all
npm run verify:assets
```

`download-dem.sh` usa los identificadores estables del Centro de Descargas y
`download-barreiros.sh` añade las hojas MDT02 de Galicia (huso 29) y la línea de
costa del Instituto Hidrográfico de la Marina. El huso lo declara cada config
(`projectedBounds.crs`); `prepare-all-beaches.ts` filtra las hojas MDT02 por
huso y pasa `--epsg` a los tres preparadores.
`prepare-all-beaches.ts` lee los cinco catálogos municipales y sus
configuraciones overview, y orquesta todos los derivados. `prepare_dem.py` comprueba
que el CRS de cada hoja pertenece al huso objetivo (25830 o 25829) y una
resolución de 2 m, une las hojas,
recorta el rectángulo métrico y remuestrea bilinealmente. Las hojas de Galicia
pueden llegar etiquetadas como EPSG:3041 (alias «N-E» de UTM 29N con píxeles
E-N); el script las normaliza antes del merge. El derivado visible
usa 2,5 m y una pasada de suavizado gaussiano 3×3; el caster usa 15 m sin
suavizado. Si la alineación de rejillas deja una costura, se rellena dentro de
un radio máximo de cuatro celdas y se rechaza el resultado si queda algún
nodata. Produce:

- `<id>-dem.f32`: matriz Float32 little-endian, filas de norte a sur;
- `<id>-dem.json`: trazabilidad, transformada, dimensiones y min/max;
- `<id>-dem-preview.pgm`: inspección 2D sin depender de QGIS.

Los cinco recortes `<municipio>-coast` son panorámicas a 20 m. Su capa urbana usa
`urbanDetail: overview`: agrega las huellas de Catastro en masas simplificadas
y conserva solo las clases viarias legibles a escala municipal. Se regenera
con `npm run data:beach -- <municipio>-coast`.

`prepare_coastline.py` abre la fuente de costa del municipio —la línea DERA de
Andalucía (capa `T01_07_LineaCostaAndalucia`) o la línea del Instituto
Hidrográfico de la Marina para Barreiros—, comprueba el CRS,
la reproyecta al huso objetivo, filtra las geometrías relevantes
(COALNE/PLEAMAR en IHM, descartando anillos cerrados e islotes) y escribe
GeoJSON EPSG:25829/25830.

`prepare_urban.py` recorta las partes de edificio INSPIRE de Catastro, conserva
el número de plantas y deriva una altura visual de 3,1 m por planta. Los ejes
OSM se reproyectan al huso objetivo, se filtran por clase y se convierten offline
en cintas de 2,5–8 m de ancho. El navegador solo recibe los GeoJSON derivados.

## Extensión de los chunks

Cada `src/beaches/<id>.json` declara bounds EPSG:25830, resolución, dimensiones,
cámara, tramo oficial de playa y un caster mayor. Los visibles priorizan agua,
arena y una franja corta tras la playa: usan 2,5–4 m según longitud y oscilan
entre 25.920 y 71.760 muestras.

La física usa además `<id>-horizon.f32`, un caster invisible de 15 m. Conserva
los cerros capaces de ocultar el Sol sin obligar a mostrarlos dentro de la
maqueta litoral.

Para cambiar extensión o resolución solo se modifica la configuración de la
playa y se ejecuta `npm run data:beach -- <id>`. `npm run verify:assets`
detecta desajustes de bounds, resolución, dimensiones y nodata.

GDAL es compatible con el flujo, pero el script Python usa Rasterio (basado en
GDAL) para que la unión de hojas, las comprobaciones y la salida binaria sean
una sola operación reproducible.
