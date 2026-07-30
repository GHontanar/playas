#!/usr/bin/env bash
set -euo pipefail

python_bin="${PYTHON_BIN:-.venv/bin/python}"
source_dir="${1:-data/source}"
output_dir="${2:-public/terrain/assets}"
mkdir -p "$output_dir" public/metadata

"$python_bin" scripts/prepare_dem.py \
  --west 602600 --south 4107200 --east 603050 --north 4108050 \
  --resolution 5 \
  --output "$output_dir/ventanicas-dem.f32" \
  --metadata public/metadata/ventanicas-dem.json \
  --preview "$output_dir/ventanicas-dem-preview.pgm" \
  "$source_dir/MDT02-ETRS89-HU30-1031-2-COB2.TIF" \
  "$source_dir/MDT02-ETRS89-HU30-1032-1-COB2.TIF"
