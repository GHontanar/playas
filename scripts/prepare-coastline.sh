#!/usr/bin/env bash
set -euo pipefail

python_bin="${PYTHON_BIN:-.venv/bin/python}"
source_gpkg="${1:-data/source/1_Relieve.gpkg}"
output="${2:-public/terrain/assets/ventanicas-coastline.geojson}"
mkdir -p "$(dirname "$output")"

"$python_bin" scripts/prepare_coastline.py "$source_gpkg" "$output"
