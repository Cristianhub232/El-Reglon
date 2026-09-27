#!/usr/bin/env bash
# Carga (incremental e idempotente) el histórico de tasas BCV en PostgreSQL (contenedor "db").
# Uso: herramientas/bcv/cargar_bcv.sh [dir_csv]   (por defecto datos/bcv/historico)
# Una sola transacción: si una validación falla, no se carga nada.
set -euo pipefail
cd "$(dirname "$0")/../.."
DIR="${1:-datos/bcv/historico}"
MANIFIESTO="$DIR/manifiesto.json"
leer() {
  python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d=d[k]
print(d)' "$MANIFIESTO" "$1"; }
set -a; [ -f .env ] && . ./.env; set +a
PSQL=(docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f /db/bcv/001_esquema.sql
sed "s#__DIR__#/$DIR#g" db/bcv/002_cargar_historico.sql | "${PSQL[@]}" -1 -f - \
  -v esperado_publicaciones="$(leer conteos.publicaciones)" \
  -v esperado_tasas="$(leer conteos.tasas)" \
  -v ultima_fecha="$(leer ultima.fecha_valor)" \
  -v ultima_usd="$(leer ultima.USD)"
