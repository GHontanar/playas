#!/usr/bin/env bash
set -euo pipefail

# Descarga de la batimetría GMRT GridServer para la costa de Lugo (Mariña Lucense).
# Reemplazo de EMODnet (WCS caído). Capa topo: GEBCO 2023 + multibeam.
# Fuente: marine-geo.org / GMRT GridServer.
# Bounding box WGS84 del bloque UTM 29N:
#   Lon -7.65 – -7.00 · Lat 43.20 – 43.80

output_dir="${1:-data/source}"
mkdir -p "$output_dir"

target="$output_dir/gmrt-lugo.asc"
if [[ -s "$target" ]]; then
  # Validación idempotente: primera línea debe ser "ncols" y tamaño > 500 kB
  first_line="$(head -n1 "$target")"
  file_size="$(stat -c%s "$target")"
  if [[ "$first_line" == ncols* ]] && (( file_size > 500000 )); then
    echo "Ya existe y es válido: $target ($file_size bytes)"
    exit 0
  fi
  echo "El fichero existe pero no es válido, se re-descargará"
fi

url="https://www.gmrt.org/services/GridServer?minlongitude=-7.65&maxlongitude=-7.0&minlatitude=43.2&maxlatitude=43.8&format=esriascii&layer=topo&resolution=max"
echo "Descargando GMRT GridServer (topo: GEBCO 2023 + multibeam) para Lugo …"
curl -fsS -o "$target" --max-time 300 "$url"

file_size="$(stat -c%s "$target")"
first_line="$(head -n1 "$target")"
if [[ "$first_line" != ncols* ]]; then
  echo "ERROR: la primera línea no empieza por 'ncols' (got: $first_line)" >&2
  exit 1
fi
if (( file_size <= 500000 )); then
  echo "ERROR: fichero demasiado pequeño ($file_size bytes, se esperaba > 500000)" >&2
  exit 1
fi

echo "Listo: $target ($file_size bytes, primera línea: $first_line)"