#!/usr/bin/env bash
# Carga una semilla del Arancel en PostgreSQL (contenedor "db" de docker-compose).
# Uso: herramientas/arancel/cargar_arancel.sh [dir_semilla]   (por defecto datos/arancel/vigente; también datos/arancel/base_2024)
# Todo corre en una sola transacción: si alguna validación falla, no se carga nada.
set -euo pipefail
cd "$(dirname "$0")/../.."
SEMILLA="${1:-datos/arancel/vigente}"
MANIFIESTO="$SEMILLA/manifiesto.json"
leer() {  # leer conteos.secciones  → valor del manifiesto
  python3 -c 'import json,sys
d=json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."): d=d[k]
print(d)' "$MANIFIESTO" "$1"; }
set -a; [ -f .env ] && . ./.env; set +a
PSQL=(docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1)
"${PSQL[@]}" -f /db/arancel/001_esquema.sql
# \copy no expande variables de psql: se sustituye el marcador __DIR__ antes de enviar el script
sed "s#__DIR__#/$SEMILLA#g" db/arancel/002_cargar_semilla.sql | "${PSQL[@]}" -1 -f - \
  -v esperado_secciones="$(leer conteos.secciones)" \
  -v esperado_capitulos="$(leer conteos.capitulos)" \
  -v esperado_partidas="$(leer conteos.partidas)" \
  -v esperado_subpartidas="$(leer conteos.subpartidas)" \
  -v esperado_terminales="$(leer conteos.terminales)"
