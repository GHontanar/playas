#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import fiona
from shapely.geometry import box, mapping, shape

LAYER = "T01_07_LineaCostaAndalucia"


def main(source: Path, output: Path, bounds: tuple[float, float, float, float], name: str) -> None:
    clip = box(*bounds)
    features = []
    with fiona.open(source, layer=LAYER) as collection:
        if collection.crs.to_epsg() != 25830:
            raise SystemExit(f"CRS de costa inesperado: {collection.crs}")
        for feature in collection.filter(bbox=bounds):
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
        "name": f"{name}-coastline",
        "crs": {"type": "name", "properties": {"name": "EPSG:25830"}},
        "features": features,
    }
    output.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(features)} geometrías → {output}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--bounds", nargs=4, required=True, type=float, metavar=("W", "S", "E", "N"))
    args = parser.parse_args()
    main(args.source, args.output, tuple(args.bounds), args.name)
