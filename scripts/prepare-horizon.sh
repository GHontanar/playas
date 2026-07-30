#!/usr/bin/env bash
set -euo pipefail

python_bin="${PYTHON_BIN:-.venv/bin/python}"
source_dir="${1:-data/source}"
output_dir="${2:-public/terrain/assets}"
mkdir -p "$output_dir" public/metadata

"$python_bin" scripts/prepare_dem.py \
  --west 601250 --south 4106650 --east 603350 --north 4108550 \
  --resolution 15 \
  --output "$output_dir/ventanicas-horizon.f32" \
  --metadata public/metadata/ventanicas-horizon.json \
  --preview "$output_dir/ventanicas-horizon-preview.pgm" \
  "$source_dir/MDT02-ETRS89-HU30-1031-2-COB2.TIF" \
  "$source_dir/MDT02-ETRS89-HU30-1032-1-COB2.TIF"
