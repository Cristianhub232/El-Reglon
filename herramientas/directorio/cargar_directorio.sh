#!/usr/bin/env bash
# Carga el directorio de contribuyentes en PostgreSQL (contenedor "db"). Una transacción; si falla, no carga nada.
# Uso: herramientas/directorio/cargar_directorio.sh [dir_semilla]   (por defecto datos/directorio/semilla)
# La semilla se genera con herramientas/directorio/sanear_directorio.py y no está en el repositorio (docs/25).
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${1:-datos/directorio/semilla}"
[ -f "$DIR/manifiesto.json" ] || { echo "No está la semilla del directorio en $DIR (ver docs/25)"; exit 1; }
leer() { python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d=d[k]
print(d)' "$DIR/manifiesto.json" "$1"; }
set -a; [ -f .env ] && . ./.env; set +a
PSQL=(docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f /db/directorio/001_esquema.sql
sed "s#__DIR__#/$DIR#g" db/directorio/002_cargar_semilla.sql | "${PSQL[@]}" -1 -f - \
  -v esperado_contribuyentes="$(leer conteos.contribuyentes)" -v esperado_direcciones="$(leer conteos.direcciones)" \
  -v esperado_importadores="$(leer conteos.importadores)" -v esperado_software="$(leer conteos.software)"
