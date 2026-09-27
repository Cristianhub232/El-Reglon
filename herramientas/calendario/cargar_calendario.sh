#!/usr/bin/env bash
# Carga los módulos RIF y Calendario en PostgreSQL (contenedor "db"). Una transacción; si falla, no carga nada.
# Uso: herramientas/calendario/cargar_calendario.sh [dir_semilla]   (por defecto datos/calendario/semilla)
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${1:-datos/calendario/semilla}"
leer() { python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d=d[k]
print(d)' "$DIR/manifiesto.json" "$1"; }
set -a; [ -f .env ] && . ./.env; set +a
PSQL=(docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -q -f /db/rif/001_esquema.sql
"${PSQL[@]}" -q -f /db/calendario/001_esquema.sql
sed "s#__DIR__#/$DIR#g" db/calendario/002_cargar_semilla.sql | "${PSQL[@]}" -1 -f - \
  -v esperado_obligaciones="$(leer conteos.obligaciones)" -v esperado_vencimientos="$(leer conteos.vencimientos)"
