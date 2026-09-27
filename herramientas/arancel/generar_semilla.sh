#!/usr/bin/env bash
# Genera las semillas del módulo Arancel desde los PDF oficiales (fuentes/arancel/).
#
#   1. Extrae la tabla del art. 37 del Decreto N° 4.944 (GO Ext. 6.804)      -> datos/arancel/extraccion/
#   2. Construye la semilla base 2024                                         -> datos/arancel/base_2024/
#   3. Extrae cada reforma listada en reformas.json                           -> datos/arancel/reformas_extraidas/
#   4. Aplica las reformas en orden y valida                                  -> datos/arancel/vigente/
#
# Requisitos: python3 y pdftotext (poppler-utils). Opcional: REP_ARANCEL_CSV=<dir> para el contraste
# con Rep-Arancel (salida de extraer_semilla.py).
set -euo pipefail
cd "$(dirname "$0")"
RAIZ=../..
FUENTES=$RAIZ/fuentes/arancel
DATOS=$RAIZ/datos/arancel

python3 extraer_arancel.py "$FUENTES/GOE-6804_Decreto-4944.pdf" "$DATOS/extraccion"
rm -rf "$DATOS/base_2024"
python3 construir_semilla.py "$FUENTES/GOE-6804_Decreto-4944.pdf" "$DATOS/extraccion" "$DATOS/base_2024"
if [ -n "${REP_ARANCEL_CSV:-}" ]; then
  python3 ../analisis/rep-arancel/contrastar_rep_arancel.py "$REP_ARANCEL_CSV" "$DATOS/base_2024"
fi

mkdir -p "$DATOS/reformas_extraidas"
python3 - "$FUENTES" "$DATOS/reformas_extraidas" <<'EOF'
import json, re, subprocess, sys
fuentes, salida = sys.argv[1], sys.argv[2]
for r in json.load(open("reformas.json", encoding="utf-8"))["reformas"]:
    num = re.search(r"(\d)\.(\d{3})", r["instrumento"]).group(0).replace(".", "")
    args = ["python3", "extraer_reforma.py", f"{fuentes}/{r['archivo']}", str(r["paginas"][0]), str(r["paginas"][1]),
            f"{salida}/r{num}.csv"]
    if "dos_columnas" in r:
        args.append(json.dumps(r["dos_columnas"]))
    subprocess.run(args, check=True)
EOF

rm -rf "$DATOS/vigente"
python3 aplicar_reformas.py "$DATOS/base_2024" reformas.json "$DATOS/reformas_extraidas" "$FUENTES" "$DATOS/vigente"
echo "Semillas generadas en $DATOS/base_2024 y $DATOS/vigente"
