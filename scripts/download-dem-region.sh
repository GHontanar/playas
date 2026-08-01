#!/usr/bin/env bash
set -euo pipefail

# Hojas MDT25 (2.ª cobertura, un fichero por cuadrante MTN25) que cubren el
# recorte regional Levante + Cabo de Gata: x 557600-612000, y 4060000-4125000
# en ETRS89 / UTM 30N. Los `secuencial` salen del Centro de Descargas del CNIG
# filtrando la serie T25C2 por la provincia 04; son opacos y hay que refrescarlos
# si el CNIG reordena el catálogo.

output_dir="${1:-data/source/mdt25}"
mkdir -p "$output_dir"
base="https://centrodedescargas.cnig.es/CentroDescargas"

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
    --data "secDescDirLA=$sequential&secuencial=$sequential&codSerie=T25C2" \
    --output "$target"
}

download 11783434 "MDT25-1013-2.TIF"
download 11783436 "MDT25-1013-4.TIF"
download 11783437 "MDT25-1014-1.TIF"
download 11783438 "MDT25-1014-2.TIF"
download 11783439 "MDT25-1014-3.TIF"
download 11783440 "MDT25-1014-4.TIF"
download 11783441 "MDT25-1015-1.TIF"
download 11783442 "MDT25-1015-3.TIF"
download 11783488 "MDT25-1030-2.TIF"
download 11783490 "MDT25-1030-4.TIF"
download 11783491 "MDT25-1031-1.TIF"
download 11783492 "MDT25-1031-2.TIF"
download 11783493 "MDT25-1031-3.TIF"
download 11783494 "MDT25-1031-4.TIF"
download 11783495 "MDT25-1032-1.TIF"
download 11783496 "MDT25-1032-3.TIF"
download 11783542 "MDT25-1045-2.TIF"
download 11783544 "MDT25-1045-4.TIF"
download 11783545 "MDT25-1046-1.TIF"
download 11783546 "MDT25-1046-2.TIF"
download 11783547 "MDT25-1046-3.TIF"
download 11783548 "MDT25-1046-4.TIF"
download 11783594 "MDT25-1059-2.TIF"
download 11783595 "MDT25-1059-4.TIF"
download 11783596 "MDT25-1060-1.TIF"
download 11783598 "MDT25-1060-3.TIF"
