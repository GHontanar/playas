#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.fill import fillnodata
from rasterio.merge import merge
from rasterio.vrt import WarpedVRT

ALLOWED_EPSG = {25830, 25829, 3041}


def main() -> None:
    parser = argparse.ArgumentParser(description="Recorta y remuestrea el MDT02 para web.")
    parser.add_argument("sources", nargs="+")
    parser.add_argument("--west", type=float, required=True)
    parser.add_argument("--south", type=float, required=True)
    parser.add_argument("--east", type=float, required=True)
    parser.add_argument("--north", type=float, required=True)
    parser.add_argument("--resolution", type=float, required=True)
    parser.add_argument("--epsg", type=int, default=25830)
    parser.add_argument("--smooth-passes", type=int, default=0)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--metadata", type=Path, required=True)
    parser.add_argument("--preview", type=Path, required=True)
    args = parser.parse_args()
    if args.epsg not in ALLOWED_EPSG:
        raise SystemExit(f"CRS destino inesperado: EPSG:{args.epsg}")
    target = CRS.from_epsg(args.epsg)

    datasets = []
    try:
        for path in args.sources:
            src = rasterio.open(path)
            epsg = src.crs.to_epsg()
            if epsg not in ALLOWED_EPSG:
                raise SystemExit(f"CRS inesperado en {path}: {src.crs}")
            # 3041 es el alias «N-E» de ETRS89/UTM 29N, pero el GeoTIFF ya guarda
            # la transformación en E-N: se trata como 25829 sin reproyectar.
            normalized = 25829 if epsg == 3041 else epsg
            if abs(src.res[0] - 2) > 0.01 or abs(src.res[1] - 2) > 0.01:
                raise SystemExit(f"Resolución fuente inesperada en {path}: {src.res}")
            if normalized == args.epsg and epsg == args.epsg:
                datasets.append(src)
            else:
                # WarpedVRT con CRS normalizado (identidad para 3041→25829):
                # deja el merge con CRS homogéneo y compara igual en merge().
                datasets.append(WarpedVRT(
                    src,
                    src_crs=CRS.from_epsg(normalized),
                    dst_crs=target,
                    nodata=-32767,
                    resampling=rasterio.enums.Resampling.bilinear,
                ))
        mosaic, transform = merge(
            datasets,
            bounds=(args.west, args.south, args.east, args.north),
            res=args.resolution,
            nodata=-32767,
            resampling=rasterio.enums.Resampling.bilinear,
        )
    finally:
        for dataset in datasets:
            dataset.close()

    heights = mosaic[0].astype("<f4")
    nodata_count = int(np.count_nonzero(heights <= -32000))
    filled_nodata_count = nodata_count
    if nodata_count:
        # Las hojas tienen rejillas desplazadas y el merge remuestreado puede
        # dejar una costura de una celda. Solo se rellena esa costura interior.
        valid_mask = heights > -32000
        heights = fillnodata(heights, mask=valid_mask, max_search_distance=4).astype("<f4")
        remaining_nodata = int(np.count_nonzero(heights <= -32000))
        if remaining_nodata:
            raise SystemExit(f"El recorte contiene {remaining_nodata} celdas nodata sin corregir")
        nodata_count = 0
    # El MDT interpola el agua alrededor de cero; para la maqueta se fija a nivel del mar.
    heights[heights < 0] = 0
    for _ in range(args.smooth_passes):
        padded = np.pad(heights, 1, mode="edge")
        heights = (
            padded[:-2, :-2] + 2 * padded[:-2, 1:-1] + padded[:-2, 2:] +
            2 * padded[1:-1, :-2] + 4 * padded[1:-1, 1:-1] + 2 * padded[1:-1, 2:] +
            padded[2:, :-2] + 2 * padded[2:, 1:-1] + padded[2:, 2:]
        ).astype("<f4") / 16
    args.output.parent.mkdir(parents=True, exist_ok=True)
    heights.tofile(args.output)

    land = heights[heights > 0.5]
    metadata = {
        "sourceProduct": "MDT02 - 2ª cobertura (2015-2021)",
        "sourceFiles": [Path(path).name for path in args.sources],
        "sourceCRS": f"EPSG:{args.epsg}",
        "sourceResolutionMeters": 2,
        "bounds": [args.west, args.south, args.east, args.north],
        "webResolutionMeters": args.resolution,
        "smoothingPasses": args.smooth_passes,
        "width": int(heights.shape[1]),
        "height": int(heights.shape[0]),
        "nodataCells": nodata_count,
        "filledSeamCells": filled_nodata_count,
        "minElevation": float(heights.min()),
        "maxElevation": float(heights.max()),
        "minLandElevation": float(land.min()),
        "byteOrder": "little-endian",
        "dataType": "float32",
        "assetBytes": args.output.stat().st_size,
        "transform": list(transform)[:6],
    }
    args.metadata.parent.mkdir(parents=True, exist_ok=True)
    args.metadata.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")

    normalised = np.clip((heights - heights.min()) / max(1, heights.max() - heights.min()) * 255, 0, 255)
    preview = normalised.astype(np.uint8)
    with args.preview.open("wb") as stream:
        stream.write(f"P5\n{preview.shape[1]} {preview.shape[0]}\n255\n".encode())
        stream.write(preview.tobytes())
    print(json.dumps(metadata, indent=2))


if __name__ == "__main__":
    main()
