#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-data/source}"
mkdir -p "$output_dir"

cadastre_zip="$output_dir/CATASTRO-BU-04064-MOJACAR.zip"
cadastre_url="https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/04064-MOJACAR/A.ES.SDGC.BU.04064.zip"
if [[ ! -s "$cadastre_zip" ]]; then
  curl --fail --location --retry 3 "$cadastre_url" --output "$cadastre_zip"
fi
unzip -o "$cadastre_zip" "A.ES.SDGC.BU.04064.buildingpart.gml" -d "$output_dir"

roads_json="$output_dir/mojacar-osm-roads.json"
if [[ ! -s "$roads_json" ]]; then
  query='[out:json][timeout:90];way["highway"](37.0925,-1.8665,37.1795,-1.8155);out geom;'
  curl --fail --retry 3 --get "https://overpass-api.de/api/interpreter" \
    --data-urlencode "data=$query" --output "$roads_json"
fi
