#!/usr/bin/env bash
set -euo pipefail

exec npx tsx scripts/prepare-all-beaches.ts "${BEACH_ID:-ventanicas}"
