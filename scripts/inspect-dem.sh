#!/usr/bin/env bash
set -euo pipefail

python_bin="${PYTHON_BIN:-.venv/bin/python}"
if [[ "$#" -eq 0 ]]; then
  set -- data/source/MDT02-ETRS89-HU30-1031-2-COB2.TIF \
    data/source/MDT02-ETRS89-HU30-1032-1-COB2.TIF
fi

"$python_bin" scripts/inspect_dem.py "$@"
