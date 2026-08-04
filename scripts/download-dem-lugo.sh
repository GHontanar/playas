#!/usr/bin/env bash
set -euo pipefail

# Descarga del DEM GLO-30 para la costa de Lugo (Mariña Lucense).
# Tile N43_00_W008_00: cubre Lat 43-44, Lon -8 a -7, que abarca el recorte
# UTM 29N (EPSG:25829): WEST=609215, SOUTH=4799988, EAST=661153, NORTH=4849303.
# Fuente: Copernicus DEM GLO-30, 30 m, EPSG:4326, altura en metros (mar=0).
#
# URL directa a S3 de Copernicus (idempotente).

output_dir="${1:-data/source/dem-glo30-lugo}"
mkdir -p "$output_dir"

target="$output_dir/Copernicus_DSM_COG_10_N43_00_W008_00_DEM.tif"
if [[ -s "$target" ]]; then
  echo "Ya existe: $target (no redescarga)"
  exit 0
fi

echo "Descargando Copernicus GLO-30 tile N43_00_W008_00 …"
curl --fail --location --retry 3 \
  "https://epic.ngs.noaa.gov/drive/projects/Copernicus/DATA/COG_10/N43/N43_00/W008_00/Copernicus_DSM_COG_10_N43_00_W008_00_DEM.tif" \
  --output "$target"

echo "Listo: $target ($(stat -c%s "$target") bytes)"