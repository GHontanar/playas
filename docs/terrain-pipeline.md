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
scripts/inspect-dem.sh
scripts/prepare-dem.sh
scripts/prepare-coastline.sh
npm run verify:assets
```

`download-dem.sh` usa los identificadores estables del Centro de Descargas.
`prepare_dem.py` comprueba EPSG:25830 y resolución 2 m, une las dos hojas,
recorta el rectángulo métrico y remuestrea bilinealmente a 15 m. La distinta
alineación de las dos rejillas deja una costura de una celda (127 muestras),
rellenada por vecino próximo dentro de un radio máximo de cuatro celdas; el
resultado se rechaza si queda algún nodata. Produce:

- `ventanicas-dem.f32`: matriz Float32 little-endian, filas de norte a sur;
- `ventanicas-dem.json`: trazabilidad, transformada, dimensiones y min/max;
- `ventanicas-dem-preview.pgm`: inspección 2D sin depender de QGIS.

`prepare_coastline.py` abre `T01_07_LineaCostaAndalucia`, comprueba el CRS,
intersecta geometrías reales con el chunk y escribe GeoJSON EPSG:25830.

## Extensión del chunk

El chunk visible usa EPSG:25830: oeste 602600, sur 4107200, este 603050,
norte 4108050. Son **450 × 850 m**, con los 502 m de Ventanicas, mar y una
franja corta tras la arena. La resolución web de 5 m da 90 × 170 muestras.

La física usa además `ventanicas-horizon.f32`, un caster invisible de
2,1 × 1,9 km y 15 m de resolución. Conserva los cerros capaces de ocultar el
Sol sin obligar a mostrarlos dentro de la maqueta litoral.

Para cambiar extensión o resolución hay que modificar los argumentos de
`prepare-dem.sh`, `BOUNDS` en `prepare_coastline.py` y la configuración de la
playa. `npm run verify:assets` detecta desajustes de dimensiones.

GDAL es compatible con el flujo, pero el script Python usa Rasterio (basado en
GDAL) para que la unión de hojas, las comprobaciones y la salida binaria sean
una sola operación reproducible.
