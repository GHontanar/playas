#!/usr/bin/env bash
set -euo pipefail

# Capas DERA que colorean el nivel comarcal: usos del suelo (volumen 6) y
# cauces (volumen 3). No entran en `npm run data`: son 328 MB comprimidos que
# solo necesita el spike regional, y el pipeline por playa no los usa.

output_dir="${1:-data/source}"
base="https://www.juntadeandalucia.es/institutodeestadisticaycartografia/dega/sites/default/files/datos"

fetch() {
  local slug="$1" archive="$2" member="$3" folder="$4"
  local target="$output_dir/$archive"
  mkdir -p "$output_dir/$folder"
  if [[ ! -s "$target" ]]; then
    curl --fail --location --retry 3 "$base/$slug" --output "$target"
  fi
  unzip -o "$target" "$member" -d "$output_dir/$folder"
}

fetch 094-dera-6-usos-del-suelo-gpkg.zip DERA-6-usos-suelo-gpkg.zip 6_UsosdelSuelo.gpkg dera-usos-suelo
fetch 094-dera-3-hidrografia-gpkg.zip DERA-3-hidrografia-gpkg.zip 3_Hidrografia.gpkg dera-hidrografia
