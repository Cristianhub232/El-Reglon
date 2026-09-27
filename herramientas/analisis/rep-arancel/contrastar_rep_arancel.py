#!/usr/bin/env python3
"""Contrasta el AEC de la semilla de El Renglón con las tarifas de Rep-Arancel (dml_08 y dml_12).

Uso:
    python3 extraer_semilla.py <ruta Rep-Arancel> <dir_csv_rep>
    python3 contrastar_rep_arancel.py <dir_csv_rep> <dir_semilla>

Escribe <dir_semilla>/contraste_rep_arancel.csv con cada diferencia, para revisión humana.
Rep-Arancel es solo verificación cruzada: la fuente de verdad es la Gaceta Oficial.
"""
import csv
import sys
from pathlib import Path

ARCHIVOS = ("dml_08_subpartida_final.sql", "dml_12_tarifas_corregidas.sql")


def numero(x):
    x = (x or "").replace(",", ".").replace("BIT", "").replace("BK", "")
    try:
        return float(x)
    except ValueError:
        return None


def main(dir_rep, dir_sem):
    dir_rep, dir_sem = Path(dir_rep), Path(dir_sem)
    nuestro = {r["codigo"]: r for r in csv.DictReader(open(dir_sem / "subpartida.csv", encoding="utf-8"))
               if r["es_terminal"] == "true"}
    ids = {r["id_subpartida"]: r["codigo_10digitos"].replace(".", "")
           for r in csv.DictReader(open(dir_rep / "subpartida.csv", encoding="utf-8"))
           if r["archivo"] == "dml_08_subpartida_final.sql"}
    difs, resumen = [], {}
    for r in csv.DictReader(open(dir_rep / "tarifa_ad_valorem.csv", encoding="utf-8")):
        if r["archivo"] not in ARCHIVOS:
            continue
        c = ids.get(r["fk_subpartida"])
        if c not in nuestro:
            continue
        s = resumen.setdefault(r["archivo"], [0, 0])
        s[0] += 1
        if numero(r["codigo_aec"]) == numero(nuestro[c]["aec"]):
            s[1] += 1
        else:
            difs.append({"codigo": c, "archivo_rep_arancel": r["archivo"], "aec_rep_arancel": r["codigo_aec"],
                         "aec_el_renglon": nuestro[c]["aec"] + nuestro[c]["marca_aec"],
                         "pagina_gaceta": nuestro[c]["pagina"], "descripcion": nuestro[c]["descripcion"]})
    with open(dir_sem / "contraste_rep_arancel.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["codigo", "archivo_rep_arancel", "aec_rep_arancel", "aec_el_renglon",
                                           "pagina_gaceta", "descripcion"])
        w.writeheader(); w.writerows(sorted(difs, key=lambda d: d["codigo"]))
    for arch, (n, ok) in resumen.items():
        print(f"{arch}: {ok}/{n} coinciden ({100 * ok / n:.2f} %), {n - ok} diferencias")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
