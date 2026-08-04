#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import fiona
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, box, mapping, shape
from shapely.ops import transform as shp_transform

DERA_LAYER = "T01_07_LineaCostaAndalucia"
IHM_CATEGORIES = {"COALNE", "ORILLA_ARENA", "ORILLA_PANTANOSA"}


def is_closed_ring(line) -> bool:
    if len(line.coords) < 3:
        return False
    first, last = line.coords[0], line.coords[-1]
    return abs(first[0] - last[0]) < 1 and abs(first[1] - last[1]) < 1


def main(source: Path, output: Path, bounds: tuple[float, float, float, float], name: str, epsg: int, ihm: bool) -> None:
    clip = box(*bounds)
    features = []
    with fiona.open(source, layer=None if ihm else DERA_LAYER) as collection:
        src_epsg = collection.crs.to_epsg()
        if src_epsg is None:
            raise SystemExit(f"CRS de costa desconocido: {collection.crs}")
        transformer = Transformer.from_crs(src_epsg, epsg, always_xy=True)
        back = Transformer.from_crs(epsg, src_epsg, always_xy=True)
        src_bbox = box(*back.transform_bounds(bounds[0], bounds[1], bounds[2], bounds[3]))
        count = 0
        for feature in collection.filter(bbox=(src_bbox.bounds)):
            if ihm:
                props = feature["properties"]
                if props.get("FEATURE") != "COALNE" or not props.get("PLEAMAR"):
                    continue
                if props.get("CATEGORIA") not in IHM_CATEGORIES:
                    continue
            geometry = shape(feature["geometry"])
            geometry = shp_transform(lambda x, y: transformer.transform(x, y), geometry)
            geometry = geometry.intersection(clip)
            if geometry.is_empty:
                continue
            if ihm:
                # Las islas y rocas llegan como anillos cerrados que rompen la
                # envolvente marina; los fragmentos minúsculos son ruido. Solo se
                # conserva la línea litoral abierta.
                parts = list(geometry.geoms) if geometry.geom_type.startswith("Multi") else [geometry]
                parts = [
                    part for part in parts
                    if part.geom_type == "LineString"
                    and not is_closed_ring(part)
                    and len(part.coords) >= 3
                    and part.length >= 12
                ]
                if not parts:
                    continue
                geometry = parts[0] if len(parts) == 1 else MultiLineString(parts)
            count += 1
            features.append({
                "type": "Feature",
                "properties": {
                    "source": "IHM" if ihm else "DERA/IECA",
                    **({"id_dera": feature["properties"].get("id_dera")} if not ihm else {}),
                },
                "geometry": mapping(geometry),
            })
    if not features:
        raise SystemExit("La línea de costa no intersecta el chunk")
    payload = {
        "type": "FeatureCollection",
        "name": f"{name}-coastline",
        "crs": {"type": "name", "properties": {"name": f"EPSG:{epsg}"}},
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
    parser.add_argument("--epsg", type=int, default=25830)
    parser.add_argument("--ihm", action="store_true", help="Filtra la capa COALNE/PLEAMAR de la Línea de costa IHM")
    args = parser.parse_args()
    main(args.source, args.output, tuple(args.bounds), args.name, args.epsg, args.ihm)
