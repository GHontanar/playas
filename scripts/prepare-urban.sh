#!/usr/bin/env bash
set -euo pipefail

python_bin="${PYTHON_BIN:-.venv/bin/python}"
source_dir="${1:-data/source}"
output_dir="${2:-public/terrain/assets}"
mkdir -p "$output_dir"

"$python_bin" scripts/prepare_urban.py \
  "$source_dir/A.ES.SDGC.BU.04064.buildingpart.gml" \
  "$source_dir/ventanicas-osm-roads.json" \
  "$output_dir/ventanicas-buildings.geojson" \
  "$output_dir/ventanicas-roads.geojson"
