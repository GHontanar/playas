#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-data/source}"
mkdir -p "$output_dir"
target="$output_dir/DERA-1-relieve-gpkg.zip"
url="https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/sites/default/files/datos/094-dera-1-relieve-gpkg.zip"

if [[ ! -s "$target" ]]; then
  curl --fail --location --retry 3 "$url" --output "$target"
fi
unzip -o "$target" "1_Relieve.gpkg" -d "$output_dir"

marine_target="$output_dir/DERA-5-medio-marino-gpkg.zip"
marine_url="https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/sites/default/files/datos/094-dera-5-medio-marino-gpkg.zip"
if [[ ! -s "$marine_target" ]]; then
  curl --fail --location --retry 3 "$marine_url" --output "$marine_target"
fi
mkdir -p "$output_dir/dera-medio-marino"
unzip -o "$marine_target" "5_Medio_Marino.gpkg" -d "$output_dir/dera-medio-marino"
