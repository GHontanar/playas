#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import numpy as np
import rasterio


def inspect(path: Path) -> dict:
    with rasterio.open(path) as src:
        values = src.read(1, masked=True)
        return {
            "path": str(path),
            "driver": src.driver,
            "crs": str(src.crs),
            "bounds": list(src.bounds),
            "width": src.width,
            "height": src.height,
            "resolution": list(src.res),
            "nodata": src.nodata,
            "validCells": int(values.count()),
            "minElevation": float(np.min(values)),
            "maxElevation": float(np.max(values)),
        }


if __name__ == "__main__":
    print(json.dumps([inspect(Path(value)) for value in sys.argv[1:]], indent=2))
