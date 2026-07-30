#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import fiona
from shapely.geometry import box, mapping, shape

BOUNDS = (602600, 4107200, 603050, 4108050)
LAYER = "T01_07_LineaCostaAndalucia"


def main(source: Path, output: Path) -> None:
    clip = box(*BOUNDS)
    features = []
    with fiona.open(source, layer=LAYER) as collection:
        if collection.crs.to_epsg() != 25830:
            raise SystemExit(f"CRS de costa inesperado: {collection.crs}")
        for feature in collection.filter(bbox=BOUNDS):
            geometry = shape(feature["geometry"]).intersection(clip)
            if not geometry.is_empty:
                features.append({
                    "type": "Feature",
                    "properties": {
                        "source": "DERA/IECA",
                        "id_dera": feature["properties"].get("id_dera"),
                    },
                    "geometry": mapping(geometry),
                })
    if not features:
        raise SystemExit("La línea de costa no intersecta el chunk")
    payload = {
        "type": "FeatureCollection",
        "name": "ventanicas-coastline",
        "crs": {"type": "name", "properties": {"name": "EPSG:25830"}},
        "features": features,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(features)} geometrías → {output}")


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(sys.argv[2]))
