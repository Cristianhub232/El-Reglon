#!/usr/bin/env python3
"""Transcripción manual (27/09/2026) de la Providencia SNAT/2025/000091 (24/11/2025), calendario de
Sujetos Pasivos Especiales y Agentes de Retención 2026. Fuente: GO N° 43.283 del 23/12/2025
(reimpresión por error material de la GO N° 43.273 del 09/12/2025), págs. 470.452–470.454.
La Gaceta es un escaneo: las tablas se leyeron visualmente a 300 dpi.

Uso: python3 transcripcion_spe_2026.py <dir_salida>  → obligacion.csv, vencimiento.csv (con validaciones)
"""
import csv, datetime as dt, sys
from pathlib import Path

M = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"]
G5 = ["0,8", "1,4", "2,3", "5,9", "6,7"]
T10 = [str(i) for i in range(10)]
TODOS = "0,1,2,3,4,5,6,7,8,9"

OBLIGACIONES = [  # codigo, literal/articulo, nombre oficial, periodo que se declara, aplica_a
 ("IVA_ANT_ISLR_IGTF_RET_IVA_P1", "art. 1 lit. a.1", "IVA, anticipos de ISLR, IGTF y retenciones de IVA",
  "operaciones entre los días 01 y 15 del mismo mes", "SPE (art. 5: salvo minería/hidrocarburos)"),
 ("IVA_ANT_ISLR_IGTF_RET_IVA_P2", "art. 1 lit. a.2", "IVA, anticipos de ISLR, IGTF y retenciones de IVA",
  "operaciones entre el día 16 y el último del MES ANTERIOR", "SPE (art. 5: salvo minería/hidrocarburos)"),
 ("ISLR_ESTIMADAS", "art. 1 lit. b", "Estimadas de ISLR (declaración y pago de porciones, ejercicios regulares e irregulares)", "", "SPE"),
 ("ISLR_RETENCIONES", "art. 1 lit. c", "Retenciones de ISLR", "", "SPE / agentes de retención"),
 ("JUEGOS_ENVITE_AZAR", "art. 1 lit. d", "Actividades de juegos de envite o azar", "", "SPE"),
 ("ISLR_RET_LOTERIA_P1", "art. 1 lit. e.1", "Retenciones de ISLR sobre premios de lotería", "practicadas entre los días 01 y 15", "SPE / agentes de retención"),
 ("ISLR_RET_LOTERIA_P2", "art. 1 lit. e.2", "Retenciones de ISLR sobre premios de lotería", "practicadas entre el día 16 y el último del MES ANTERIOR", "SPE / agentes de retención"),
 ("ISLR_ANUAL_2025", "art. 1 lit. f", "Autoliquidación anual de ISLR (ejercicio 01/01/2025 al 31/12/2025)", "ejercicio 2025", "SPE"),
 ("ISLR_IRREGULARES", "art. 1 lit. g", "Autoliquidación de ISLR ejercicios irregulares", "", "SPE"),
 ("GRANDES_PATRIMONIOS", "art. 1 lit. h", "Impuesto a los Grandes Patrimonios", "", "SPE"),
 ("APORTE_70", "art. 1 lit. i", "Aporte del 70 % de los ingresos de servicios desconcentrados, autónomos y entes descentralizados", "", "Entes públicos SPE"),
 ("IVA_MENSUAL_MINERIA_HIDROCARBUROS", "art. 2", "IVA mensual", "mes anterior", "SPE de minería/hidrocarburos no perceptores de regalías"),
 ("IVA_INFORMATIVA_TRIMESTRAL", "art. 3", "Declaración informativa trimestral de IVA", "trimestre", "SPE con actividades exclusivamente exentas o exoneradas (usa las fechas del art. 2)"),
]

def filas(tabla):  # {grupo: [12 días]}
    return tabla

A1 = {"0":"28 20 25 23 20 29 27 31 29 20 27 16","1":"19 23 20 27 18 26 21 25 18 28 26 29","2":"21 18 24 21 29 16 30 24 24 29 17 21",
      "3":"30 18 23 30 22 18 23 18 21 23 23 28","4":"23 25 26 20 21 19 28 19 30 22 20 22","5":"22 27 30 22 28 17 22 21 25 30 18 17",
      "6":"20 19 27 24 19 30 20 28 28 21 25 18","7":"27 24 18 17 26 22 31 20 22 27 19 18","8":"26 26 31 29 27 23 17 26 17 26 24 30",
      "9":"29 27 17 28 25 25 29 27 23 19 30 23"}
A2 = {"0":"15 09 06 01 06 12 08 14 14 05 13 03","1":"06 10 03 14 04 11 03 13 03 14 12 15","2":"08 05 09 08 14 03 14 12 10 15 02 04",
      "3":"16 12 04 16 07 10 07 05 02 07 09 11","4":"09 02 11 07 13 02 10 06 09 06 05 07","5":"05 13 12 09 15 08 06 03 15 08 04 10",
      "6":"13 04 10 13 05 15 09 04 11 02 11 08","7":"12 11 02 06 11 04 15 10 04 13 03 02","8":"07 03 13 10 12 05 02 07 08 09 06 09",
      "9":"14 06 05 15 08 09 13 11 07 01 10 14"}
B = {"0,8":"15 09 13 10 12 12 08 14 08 09 13 09","1,4":"09 10 11 14 13 11 10 13 09 14 12 15","2,3":"08 12 09 08 14 10 14 12 10 15 09 11",
     "5,9":"14 13 12 09 15 09 13 11 15 08 10 10","6,7":"13 11 10 13 11 15 09 10 11 13 11 08"}
C = {"0,8":"15 09 06 10 12 05 08 07 08 09 06 09","1,4":"09 10 11 07 13 11 10 06 09 06 05 07","2,3":"08 05 09 08 07 10 07 12 10 07 09 04",
     "5,9":"14 06 05 09 08 09 06 11 07 08 10 10","6,7":"13 11 10 06 11 04 09 10 04 13 11 08"}
D = {TODOS:"09 09 09 08 11 09 09 10 08 08 10 09"}
E1 = {TODOS:"20 18 17 21 19 17 17 20 17 19 17 17"}
E2 = {TODOS:"06 03 03 06 05 03 02 04 02 02 03 02"}
F = {"2,3":"2026-01-30","5,9":"2026-02-27","0,8":"2026-03-06","1,4":"2026-03-11","6,7":"2026-03-16"}
MG = ["ENE","FEB","ABR","MAY","JUN","JUL","AGO","SEP","OCT","NOV","DIC"]   # la tabla g) NO tiene marzo
G = {"0,8":"26 20 23 20 23 17 26 17 20 24 16","1,4":"23 23 27 21 19 21 25 18 22 20 22","2,3":"21 18 21 22 18 23 24 21 23 17 21",
     "5,9":"22 19 22 25 17 22 21 23 19 18 17","6,7":"27 24 24 19 22 20 20 22 21 19 18"}
H = {"0,8":("09","13"),"1,4":("14","12"),"2,3":("15","09"),"5,9":("08","10"),"6,7":("13","11")}

def main(salida):
    out = Path(salida); out.mkdir(parents=True, exist_ok=True)
    venc = []
    def add(cod, tabla, meses=M):
        for grupo, dias in tabla.items():
            for mes, dia in zip(meses, dias.split()):
                venc.append((cod, grupo, M.index(mes) + 1, int(dia)))
    add("IVA_ANT_ISLR_IGTF_RET_IVA_P1", A1); add("IVA_ANT_ISLR_IGTF_RET_IVA_P2", A2)
    add("ISLR_ESTIMADAS", B); add("ISLR_RETENCIONES", C); add("JUEGOS_ENVITE_AZAR", D)
    add("ISLR_RET_LOTERIA_P1", E1); add("ISLR_RET_LOTERIA_P2", E2)
    for g, f in F.items():
        d = dt.date.fromisoformat(f); venc.append(("ISLR_ANUAL_2025", g, d.month, d.day))
    add("ISLR_IRREGULARES", G, MG)
    for g, (o, n) in H.items():
        venc += [("GRANDES_PATRIMONIOS", g, 10, int(o)), ("GRANDES_PATRIMONIOS", g, 11, int(n))]
    add("APORTE_70", B); add("IVA_MENSUAL_MINERIA_HIDROCARBUROS", B); add("IVA_INFORMATIVA_TRIMESTRAL", B)
    errores = []
    filas_v = []
    for cod, grupo, mes, dia in venc:
        try:
            f = dt.date(2026, mes, dia)
        except ValueError:
            errores.append(f"fecha inexistente {cod} {grupo} {mes}/{dia}"); continue
        if f.weekday() >= 5: errores.append(f"fin de semana {cod} {grupo} {f}")
        if cod.endswith("_P1") and dia < 16: errores.append(f"P1 antes del 16: {cod} {grupo} {f}")
        if cod.endswith("_P2") and dia > 16: errores.append(f"P2 después del 16: {cod} {grupo} {f}")
        filas_v.append({"codigo": cod, "terminales_rif": grupo, "fecha": f.isoformat()})
    # cada tabla por terminales debe cubrir 0..9 exactamente una vez por mes
    from collections import Counter
    cob = Counter()
    for v in filas_v:
        for t in v["terminales_rif"].split(","):
            cob[(v["codigo"], v["fecha"][5:7], t)] += 1
    rep = [k for k, n in cob.items() if n > 1]
    if rep: errores.append(f"terminales repetidos: {rep[:5]}")
    if errores:
        print("ERRORES:", *errores, sep="\n  "); sys.exit(1)
    with open(out / "obligacion.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh); w.writerow(["codigo", "base_legal", "nombre", "periodo_declarado", "aplica_a"]); w.writerows(OBLIGACIONES)
    with open(out / "vencimiento.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["codigo", "terminales_rif", "fecha"]); w.writeheader()
        w.writerows(sorted(filas_v, key=lambda v: (v["fecha"], v["codigo"], v["terminales_rif"])))
    print(f"obligaciones={len(OBLIGACIONES)} vencimientos={len(filas_v)}; 0 fechas inexistentes, 0 en fin de semana")

if __name__ == "__main__":
    main(sys.argv[1])
