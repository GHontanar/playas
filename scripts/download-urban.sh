#!/usr/bin/env bash
set -euo pipefail

output_dir="${1:-data/source}"
mkdir -p "$output_dir"

cadastre_zip="$output_dir/CATASTRO-BU-04064-MOJACAR.zip"
cadastre_url="https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/04064-MOJACAR/A.ES.SDGC.BU.04064.zip"
if [[ ! -s "$cadastre_zip" ]]; then
  curl --fail --location --retry 3 "$cadastre_url" --output "$cadastre_zip"
fi

download_municipality() {
  local code="$1"
  local slug="$2"
  local uppercase="$3"
  local south="$4"
  local west="$5"
  local north="$6"
  local east="$7"
  local archive="$output_dir/${slug}-buildings.zip"
  local directory="$output_dir/${slug}-buildings"
  if [[ ! -s "$archive" ]]; then
    curl --fail --location --retry 3 \
      "https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/${code}-${uppercase}/A.ES.SDGC.BU.${code}.zip" \
      --output "$archive"
  fi
  mkdir -p "$directory"
  unzip -o "$archive" "A.ES.SDGC.BU.${code}.buildingpart.gml" -d "$directory"
  local roads="$output_dir/${slug}-osm-roads.json"
  if [[ ! -s "$roads" ]]; then
    local query="[out:json][timeout:120];way[\"highway\"](${south},${west},${north},${east});out geom;"
    curl --fail --retry 3 --get "https://overpass-api.de/api/interpreter" \
      --data-urlencode "data=$query" --output "$roads"
  fi
}

download_municipality "04049" "garrucha" "GARRUCHA" "37.145" "-1.86" "37.205" "-1.79"
download_municipality "04100" "vera" "VERA" "37.18" "-1.9" "37.235" "-1.79"
unzip -o "$cadastre_zip" "A.ES.SDGC.BU.04064.buildingpart.gml" -d "$output_dir"

roads_json="$output_dir/mojacar-osm-roads.json"
if [[ ! -s "$roads_json" ]]; then
  query='[out:json][timeout:90];way["highway"](37.0925,-1.8665,37.1795,-1.8155);out geom;'
  curl --fail --retry 3 --get "https://overpass-api.de/api/interpreter" \
    --data-urlencode "data=$query" --output "$roads_json"
fi

carboneras_zip="$output_dir/CATASTRO-BU-04032-CARBONERAS.zip"
carboneras_url="https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/04/04032-CARBONERAS/A.ES.SDGC.BU.04032.zip"
if [[ ! -s "$carboneras_zip" ]]; then
  curl --fail --location --retry 3 "$carboneras_url" --output "$carboneras_zip"
fi
mkdir -p "$output_dir/carboneras-buildings"
unzip -o "$carboneras_zip" "A.ES.SDGC.BU.04032.buildingpart.gml" -d "$output_dir/carboneras-buildings"

carboneras_roads="$output_dir/carboneras-osm-roads.json"
if [[ ! -s "$carboneras_roads" ]]; then
  query='[out:json][timeout:120];way["highway"](36.915,-1.925,37.04,-1.855);out geom;'
  curl --fail --retry 3 --get "https://overpass-api.de/api/interpreter" \
    --data-urlencode "data=$query" --output "$carboneras_roads"
fi
