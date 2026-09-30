#!/usr/bin/env bash
# Crea todos los esquemas y carga todas las semillas en la base del docker-compose (servicio "db").
# Uso: herramientas/instalar_bd.sh      (requiere: docker compose up -d db, Node 22.18+ y poppler-utils)
# Si cualquier carga falla, se detiene y muestra el error (cada módulo carga en una sola transacción).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/001_esquema.sql
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/002_usuarios.sql
# Noticiero y Pulso oficial: esquemas, fuentes, cuentas y permiso "noticias" (los datos los trae noticias-programador)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/noticias/001_esquema.sql
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/noticias/002_pulso.sql
cargar() {
  local nombre="$1" salida
  if ! salida="$("${@:2}" 2>&1)"; then
    echo "✘ $nombre: la carga falló"; echo "$salida" | grep -E "ERROR|CONTEXT" || echo "$salida" | tail -20; exit 1
  fi
  echo "✔ $nombre: $(echo "$salida" | grep -o 'Validaciones [^ ]* superadas' | tail -1)"
}
cargar "Arancel" herramientas/arancel/cargar_arancel.sh
# Detección arancelaria (Node): diccionario de nombres comerciales e índice de búsqueda; va después del arancel
cargar "Detección arancelaria" node scripts/arancel-cargar-sinonimos.ts
cargar "BCV" herramientas/bcv/cargar_bcv.sh
cargar "Calendario y RIF" herramientas/calendario/cargar_calendario.sh
# IVA: el cargador (Node) valida el catálogo, comprueba los textos legales contra las Gacetas (pdftotext)
# y los prefijos contra el arancel ya cargado. Sin pdftotext: IVA_SIN_PDF=1 (los textos quedan sin verificar).
cargar "IVA" node scripts/iva-cargar-catalogo.ts ${IVA_SIN_PDF:+--sin-pdf}
