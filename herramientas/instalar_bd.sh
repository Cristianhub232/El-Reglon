#!/usr/bin/env bash
# Crea todos los esquemas y carga todas las semillas en la base del docker-compose (servicio "db").
# Uso: herramientas/instalar_bd.sh      (requiere: docker compose up -d db, Node 22.18+ y poppler-utils)
# Si cualquier carga falla, se detiene y muestra el error (cada módulo carga en una sola transacción).
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; [ -f .env ] && . ./.env; set +a
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/001_esquema.sql
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/002_usuarios.sql
# Analítica del sitio público: visitas (cookie propia) y RIF consultados, 12 meses (docs/23)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/003_analitica.sql
# Avisos push: suscripciones, RIF seguidos y envíos (docs/24)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/core/004_avisos.sql
# Noticiero: esquema, fuentes y permiso "noticias" (los titulares los trae noticias-programador); 002 retira el Pulso oficial
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/noticias/001_esquema.sql
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/noticias/002_pulso.sql
# Tasa de mercado USDT/VES (Binance P2P vía CriptoYa), referencia no oficial junto al BCV (docs/28)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/mercado/001_esquema.sql
# Comparador de precios: tiendas, sucursales, productos, historial de precios y permiso "comparador" (docs/22)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/comparador/001_esquema.sql
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/comparador/002_indice.sql
# Prospección comercial por correo: prospectos, bajas, envíos y ajustes (docs/26)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/prospeccion/001_esquema.sql
# Contacto: mensajes del botón flotante y cursor de los buzones (docs/27)
docker compose exec -T db psql -U "${POSTGRES_USER:-elrenglon}" -d "${POSTGRES_DB:-elrenglon}" -v ON_ERROR_STOP=1 -q -f /db/contacto/001_esquema.sql
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
# Directorio de contribuyentes (docs/25): su semilla tiene datos de contacto y no está en el repositorio; se copia aparte
if [ -f datos/directorio/semilla/manifiesto.json ]; then cargar "Directorio" herramientas/directorio/cargar_directorio.sh
else echo "· Directorio: sin semilla en datos/directorio/semilla, se omite (docs/25)"; fi
