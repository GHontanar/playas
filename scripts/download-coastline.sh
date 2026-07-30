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
