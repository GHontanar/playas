#!/usr/bin/env python3
import json
import sys
from pathlib import Path

import fiona
from pyproj import Transformer
from shapely.geometry import LineString, box, mapping, shape
from shapely.ops import unary_union

BOUNDS = (602600, 4107200, 603050, 4108050)
CLIP = box(*BOUNDS)
ROAD_WIDTHS = {
    "tertiary": 8,
    "secondary": 8,
    "residential": 5,
    "living_street": 4,
    "service": 3,
    "pedestrian": 3,
    "unclassified": 4,
    "track": 2.5,
}


def feature_collection(name: str, features: list[dict], source: str) -> dict:
    return {
        "type": "FeatureCollection",
        "name": name,
        "crs": {"type": "name", "properties": {"name": "EPSG:25830"}},
        "source": source,
        "features": features,
    }


def buildings(source: Path) -> dict:
    features = []
    with fiona.open(source, layer="BuildingPart") as collection:
        if collection.crs.to_epsg() != 25830:
            raise SystemExit(f"CRS catastral inesperado: {collection.crs}")
        for raw in collection.filter(bbox=BOUNDS):
            geometry = shape(raw["geometry"]).intersection(CLIP)
            if geometry.is_empty or geometry.area < 2:
                continue
            floors = max(1, int(raw["properties"].get("numberOfFloorsAboveGround") or 1))
            features.append({
                "type": "Feature",
                "properties": {
                    "id": raw["properties"]["localId"],
                    "floors": floors,
                    "height": round(floors * 3.1, 2),
                    "heightSource": "Catastro:numberOfFloorsAboveGround",
                },
                "geometry": mapping(geometry),
            })
    return feature_collection(
        "ventanicas-buildings",
        features,
        "Dirección General del Catastro, INSPIRE BU, municipio 04064",
    )


def roads(source: Path) -> dict:
    payload = json.loads(source.read_text(encoding="utf-8"))
    transformer = Transformer.from_crs(4326, 25830, always_xy=True)
    buffered = []
    classes = []
    for element in payload.get("elements", []):
        road_class = element.get("tags", {}).get("highway")
        width = ROAD_WIDTHS.get(road_class)
        coordinates = element.get("geometry", [])
        if not width or len(coordinates) < 2:
            continue
        line = LineString([
            transformer.transform(point["lon"], point["lat"])
            for point in coordinates
        ])
        polygon = line.buffer(width / 2, cap_style="flat", join_style="round").intersection(CLIP)
        if not polygon.is_empty:
            buffered.append(polygon)
            classes.append(road_class)
    merged = unary_union(buffered)
    features = [{
        "type": "Feature",
        "properties": {"classes": sorted(set(classes))},
        "geometry": mapping(merged),
    }] if not merged.is_empty else []
    return feature_collection("ventanicas-roads", features, "© OpenStreetMap contributors, ODbL 1.0")


def write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(payload['features'])} elementos → {path}")


if __name__ == "__main__":
    write(Path(sys.argv[3]), buildings(Path(sys.argv[1])))
    write(Path(sys.argv[4]), roads(Path(sys.argv[2])))
