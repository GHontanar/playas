#!/usr/bin/env bash
set -euo pipefail

# Barreiros (Lugo): descarga de las fuentes oficiales del huso 29.
# MDT02 HU29, línea de costa IHM, edificios Catastro 27005 y calles OSM.
output_dir="${1:-data/source}"
mkdir -p "$output_dir"

base="https://centrodescargas.cnig.es/CentroDescargas"

download() {
  local sequential="$1"
  local filename="$2"
  local target="$output_dir/$filename"
  if [[ -s "$target" ]]; then
    echo "Ya existe: $target"
    return
  fi
  curl --fail --location --retry 3 \
    --request POST "$base/descargaDir" \
    --data "secDescDirLA=$sequential&secuencial=$sequential&codSerie=MDT02" \
    --output "$target"
}

# Hojas MDT02 HU29 (ETRS89 / UTM 29N) que cubren la costa de Barreiros:
# hoja 0009 (cuadrantes NE y SE) y hoja 0010 (cuadrante SO).
download 10323904 "MDT02-ETRS89-HU29-0009-2-COB2.TIF"
download 10323909 "MDT02-ETRS89-HU29-0009-4-COB2.TIF"
download 10323726 "MDT02-ETRS89-HU29-0010-3-COB2.TIF"

# Línea de costa del Instituto Hidrográfico de la Marina (toda España,
# incluye pleamar y bajamar). El zip se extrae con las hojas DERA ya presentes.
coast_zip="$output_dir/IHM-linea-costa.zip"
if [[ ! -s "$coast_zip" ]]; then
  curl --fail --location --retry 3 \
    --request POST "$base/descargaDir" \
    --data "secDescDirLA=9000006&secuencial=9000006&codSerie=LICOS" \
    --output "$coast_zip"
fi
mkdir -p "$output_dir/ihm-linea-costa"
unzip -o "$coast_zip" "COSTA/*" -d "$output_dir/ihm-linea-costa"

cadastre_zip="$output_dir/CATASTRO-BU-27005-BARREIROS.zip"
if [[ ! -s "$cadastre_zip" ]]; then
  curl --fail --location --retry 3 \
    "https://www.catastro.hacienda.gob.es/INSPIRE/Buildings/27/27005-BARREIROS/A.ES.SDGC.BU.27005.zip" \
    --output "$cadastre_zip"
fi
mkdir -p "$output_dir/barreiros-buildings"
unzip -o "$cadastre_zip" "A.ES.SDGC.BU.27005.buildingpart.gml" -d "$output_dir/barreiros-buildings"

roads="$output_dir/barreiros-osm-roads.json"
if [[ ! -s "$roads" ]]; then
  query='[out:json][timeout:120];way["highway"](43.52,-7.28,43.60,-7.13);out geom;'
  curl --fail --retry 3 --get "https://overpass-api.de/api/interpreter" \
    --data-urlencode "data=$query" --output "$roads"
fi
