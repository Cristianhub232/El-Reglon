#!/usr/bin/env bash
# Crea (o actualiza) los roles y la base interna de Metabase en el PostgreSQL del docker-compose.
# Uso: herramientas/instalar_metabase.sh      (después de herramientas/instalar_bd.sh)
# Requiere en .env: METABASE_DB_PASSWORD, METABASE_LECTURA_PASSWORD y MB_ENCRYPTION_SECRET_KEY.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
for v in METABASE_DB_PASSWORD METABASE_LECTURA_PASSWORD MB_ENCRYPTION_SECRET_KEY; do
  [ -n "${!v:-}" ] || { echo "✘ Defina $v en .env (genérela con: openssl rand -hex 32)"; exit 1; }
done
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q \
  -v clave_metabase="$METABASE_DB_PASSWORD" -v clave_lectura="$METABASE_LECTURA_PASSWORD" \
  -v bd="${POSTGRES_DB:-elrenglon}" -v dueno="${POSTGRES_USER:-elrenglon}" -f /db/metabase/001_roles.sql
echo "✔ Metabase: roles metabase y metabase_lectura y base metabase listos"
echo "  Siguiente: docker compose --profile metabase up -d  y complete la configuración inicial ANTES de publicarlo (docs/19)"
