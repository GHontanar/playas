#!/usr/bin/env bash
set -euo pipefail

# Usos del suelo DERA (volumen 6) para el nivel comarcal. No entra en
# `npm run data`: son 228 MB comprimidos que solo necesita el spike regional,
# y el pipeline por playa no los usa.

output_dir="${1:-data/source}"
mkdir -p "$output_dir/dera-usos-suelo"
target="$output_dir/DERA-6-usos-suelo-gpkg.zip"
url="https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/sites/default/files/datos/094-dera-6-usos-del-suelo-gpkg.zip"

if [[ ! -s "$target" ]]; then
  curl --fail --location --retry 3 "$url" --output "$target"
fi
unzip -o "$target" "6_UsosdelSuelo.gpkg" -d "$output_dir/dera-usos-suelo"
