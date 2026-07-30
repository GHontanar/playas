#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-data/source}"
mkdir -p "$output_dir"
base="https://centrodedescargas.cnig.es/CentroDescargas"

# El chunk cruza el límite entre MTN25 1031-2 y 1032-1.
download() {
  local sequential="$1"
  local filename="$2"
  local target="$output_dir/$filename"
  if [[ -s "$target" ]]; then
    echo "Ya existe: $target"
    return
  fi
  curl --fail --location --retry 3 \
    --request POST "$base/descargaDir" \
    --data "secDescDirLA=$sequential&secuencial=$sequential&codSerie=MDT02" \
    --output "$target"
}

download 11275511 "MDT02-ETRS89-HU30-1031-2-COB2.TIF"
download 11275514 "MDT02-ETRS89-HU30-1032-1-COB2.TIF"
