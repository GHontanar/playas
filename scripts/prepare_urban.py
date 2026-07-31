#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import fiona
from pyproj import Transformer
from shapely.geometry import LineString, box, mapping, shape
from shapely.ops import unary_union

ROAD_WIDTHS = {
    "tertiary": 8,
    "secondary": 8,
    "residential": 5,
    "living_street": 4,
    "service": 3,
    "pedestrian": 3,
    "unclassified": 4,
    "track": 2.5,
    "footway": 2,
    "path": 1.5,
    "cycleway": 2.5,
}


def feature_collection(name: str, features: list[dict], source: str) -> dict:
    return {
        "type": "FeatureCollection",
        "name": name,
        "crs": {"type": "name", "properties": {"name": "EPSG:25830"}},
        "source": source,
        "features": features,
    }


def buildings(source: Path, bounds: tuple[float, float, float, float], name: str) -> dict:
    clip = box(*bounds)
    features = []
    with fiona.open(source, layer="BuildingPart") as collection:
        if collection.crs.to_epsg() != 25830:
            raise SystemExit(f"CRS catastral inesperado: {collection.crs}")
        for raw in collection.filter(bbox=bounds):
            geometry = shape(raw["geometry"]).intersection(clip)
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
        f"{name}-buildings",
        features,
        "Dirección General del Catastro, INSPIRE BU, municipio 04064",
    )


def roads(source: Path, bounds: tuple[float, float, float, float], name: str) -> dict:
    clip = box(*bounds)
    payload = json.loads(source.read_text(encoding="utf-8"))
    transformer = Transformer.from_crs(4326, 25830, always_xy=True)
    buffered_by_class: dict[str, list] = {}
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
        polygon = line.buffer(width / 2, cap_style="flat", join_style="round").intersection(clip)
        if not polygon.is_empty:
            buffered_by_class.setdefault(road_class, []).append(polygon)
    features = []
    for road_class, geometries in sorted(buffered_by_class.items()):
        merged = unary_union(geometries)
        if merged.is_empty:
            continue
        features.append({
            "type": "Feature",
            "properties": {
                "class": road_class,
                "widthMeters": ROAD_WIDTHS[road_class],
            },
            "geometry": mapping(merged),
        })
    return feature_collection(f"{name}-roads", features, "© OpenStreetMap contributors, ODbL 1.0")


def write(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(payload['features'])} elementos → {path}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("buildings_source", type=Path)
    parser.add_argument("roads_source", type=Path)
    parser.add_argument("buildings_output", type=Path)
    parser.add_argument("roads_output", type=Path)
    parser.add_argument("--name", required=True)
    parser.add_argument("--bounds", nargs=4, required=True, type=float, metavar=("W", "S", "E", "N"))
    args = parser.parse_args()
    bounds = tuple(args.bounds)
    write(args.buildings_output, buildings(args.buildings_source, bounds, args.name))
    write(args.roads_output, roads(args.roads_source, bounds, args.name))
