#!/usr/bin/env python3
"""Construye la semilla del módulo Calendario tributario 2026 (CSV para PostgreSQL).

Uso:
    python3 construir_calendario.py <dir_spe> <dia_inhabil.csv> <pdf_providencia> <dir_salida>

  <dir_spe>  salida de transcripcion_spe_2026.py (obligacion.csv, vencimiento.csv)

Reglas:
  * Contribuyentes ESPECIALES: fechas transcritas de la Providencia SNAT/2025/000091 (GO 43.283).
    Se expanden a una fila por terminal del RIF (0..9).
  * Contribuyentes ORDINARIOS (IVA): art. 60 del Reglamento General de la Ley de IVA: período mensual,
    declaración y pago dentro de los 15 días continuos siguientes al período. Si el día 15 es inhábil
    (sábado, domingo, feriado nacional o día bancario no laborable), se prorroga al primer día hábil
    siguiente (COT art. 10, num. 3 y parágrafo único).
  * ESPECIALES: si la fecha oficial cae en un día inhábil (en 2026 solo ocurre con días bancarios),
    se calcula además la fecha prorrogada por el mismo art. 10 COT. Se publican ambas.
  * El período declarado solo se informa cuando la norma lo define: quincenas (a.1, a.2, e.1, e.2),
    ejercicio 2025 (f) e IVA mensual de ordinarios.
"""
import calendar
import csv
import datetime as dt
import hashlib
import json
import sys
from pathlib import Path

PROVIDENCIA = "PROV_SNAT_2025_000091"
REGLAMENTO = "REGLAMENTO_IVA_1999"

INSTRUMENTOS = [
    {"codigo": PROVIDENCIA, "nombre": "Providencia Administrativa SNAT/2025/000091 (24/11/2025): Calendario de Sujetos Pasivos Especiales y Agentes de Retención 2026",
     "gaceta": "GO N° 43.283 (reimpresión por error material de la GO N° 43.273 del 09/12/2025)", "fecha_publicacion": "2025-12-23"},
    {"codigo": REGLAMENTO, "nombre": "Reglamento General de la Ley que establece el IVA (Decreto N° 206), art. 60",
     "gaceta": "GO Ext. N° 5.363", "fecha_publicacion": "1999-07-12"},
    {"codigo": "COT_2020", "nombre": "Código Orgánico Tributario (Decreto Constituyente), art. 10: cómputo de plazos y días inhábiles",
     "gaceta": "GO Ext. N° 6.507", "fecha_publicacion": "2020-01-29"},
]

# requiere: condición que el contribuyente debe declarar para que aplique; excluye: condición que la descarta
CONDICIONES = {
    "IVA_ANT_ISLR_IGTF_RET_IVA_P1": ("", "MINERIA_HIDROCARBUROS"),   # art. 5
    "IVA_ANT_ISLR_IGTF_RET_IVA_P2": ("", "MINERIA_HIDROCARBUROS"),
    "ISLR_ESTIMADAS": ("", ""),
    "ISLR_RETENCIONES": ("", ""),
    "JUEGOS_ENVITE_AZAR": ("JUEGOS_AZAR", ""),
    "ISLR_RET_LOTERIA_P1": ("LOTERIA", ""),
    "ISLR_RET_LOTERIA_P2": ("LOTERIA", ""),
    "ISLR_ANUAL_2025": ("", "EJERCICIO_IRREGULAR"),
    "ISLR_IRREGULARES": ("EJERCICIO_IRREGULAR", ""),
    "GRANDES_PATRIMONIOS": ("GRANDES_PATRIMONIOS", ""),
    "APORTE_70": ("ENTE_PUBLICO", ""),
    "IVA_MENSUAL_MINERIA_HIDROCARBUROS": ("MINERIA_HIDROCARBUROS", ""),
    "IVA_INFORMATIVA_TRIMESTRAL": ("SOLO_EXENTO_EXONERADO", ""),
}
NOTAS = {
    "IVA_INFORMATIVA_TRIMESTRAL": "El art. 3 remite a las fechas del art. 2 sin indicar qué meses corresponden a cada trimestre: se publican las 12 fechas; confirmar con el asesor (B21).",
    "IVA_ANT_ISLR_IGTF_RET_IVA_P2": "La columna de cada mes corresponde a las operaciones del 16 al último día del MES ANTERIOR.",
    "ISLR_RET_LOTERIA_P2": "La columna de cada mes corresponde a las retenciones del 16 al último día del MES ANTERIOR.",
    "ISLR_IRREGULARES": "La tabla oficial no tiene columna de marzo.",
}


def fin_de_mes(d):
    return d.replace(day=calendar.monthrange(d.year, d.month)[1])


def periodo(codigo, fecha):
    if codigo.endswith("_P1"):
        return fecha.replace(day=1), fecha.replace(day=15)
    if codigo.endswith("_P2"):
        fin = fecha.replace(day=1) - dt.timedelta(days=1)
        return fin.replace(day=16), fin
    if codigo == "ISLR_ANUAL_2025":
        return dt.date(2025, 1, 1), dt.date(2025, 12, 31)
    if codigo == "IVA_MENSUAL_ORDINARIO":
        fin = fecha.replace(day=1) - dt.timedelta(days=1)
        return fin.replace(day=1), fin
    return None, None


def main(dir_spe, feriados_csv, pdf, dir_sal):
    dir_spe, dir_sal = Path(dir_spe), Path(dir_sal)
    dir_sal.mkdir(parents=True, exist_ok=True)
    feriados = {r["fecha"]: r for r in csv.DictReader(open(feriados_csv, encoding="utf-8"))}

    def habil(d):
        return d.weekday() < 5 and d.isoformat() not in feriados

    def siguiente_habil(d):
        while not habil(d):
            d += dt.timedelta(days=1)
        return d
    INSTRUMENTOS[0]["fuente_archivo"] = Path(pdf).name
    INSTRUMENTOS[0]["fuente_sha256"] = hashlib.sha256(Path(pdf).read_bytes()).hexdigest()
    INSTRUMENTOS[1]["fuente_archivo"] = INSTRUMENTOS[1]["fuente_sha256"] = ""
    INSTRUMENTOS[2]["fuente_archivo"] = "GOE-6507_Codigo-Organico-Tributario.pdf"
    INSTRUMENTOS[2]["fuente_sha256"] = hashlib.sha256((Path(pdf).parents[1] / "cot" / INSTRUMENTOS[2]["fuente_archivo"]).read_bytes()).hexdigest()

    obligaciones, vencimientos = [], []
    for o in csv.DictReader(open(dir_spe / "obligacion.csv", encoding="utf-8")):
        req, exc = CONDICIONES[o["codigo"]]
        obligaciones.append({"codigo": o["codigo"], "instrumento": PROVIDENCIA, "tipo_contribuyente": "ESPECIAL",
                             "base_legal": o["base_legal"], "nombre": o["nombre"], "aplica_a": o["aplica_a"],
                             "requiere": req, "excluye": exc, "nota": NOTAS.get(o["codigo"], "")})
    for v in csv.DictReader(open(dir_spe / "vencimiento.csv", encoding="utf-8")):
        f = dt.date.fromisoformat(v["fecha"])
        desde, hasta = periodo(v["codigo"], f)
        prorroga = "" if habil(f) else siguiente_habil(f).isoformat()
        for t in v["terminales_rif"].split(","):
            vencimientos.append({"obligacion": v["codigo"], "terminal": t, "fecha": f.isoformat(), "fecha_prorrogada": prorroga,
                                 "periodo_desde": desde or "", "periodo_hasta": hasta or ""})

    # ---- ordinarios: IVA mensual (art. 60 Reglamento IVA + art. 10 COT)
    obligaciones.append({"codigo": "IVA_MENSUAL_ORDINARIO", "instrumento": REGLAMENTO, "tipo_contribuyente": "ORDINARIO",
                         "base_legal": "Reglamento General Ley IVA art. 60; COT art. 10",
                         "nombre": "Declaración y pago mensual del IVA", "aplica_a": "Contribuyentes ordinarios (no especiales), cualquier terminal del RIF",
                         "requiere": "", "excluye": "",
                         "nota": "Vence el día 15 del mes siguiente al período; si es inhábil (fin de semana, feriado nacional o día bancario no laborable), el primer día hábil siguiente (COT art. 10). No incluye días no laborables decretados después de generar la semilla."})
    prorrogas = []
    for mes in range(1, 13 + 1):          # períodos dic-2025 .. dic-2026 (vencen ene-2026 .. ene-2027)
        anio, m = (2026, mes) if mes <= 12 else (2027, 1)
        f = siguiente_habil(dt.date(anio, m, 15))
        if f.day != 15:
            prorrogas.append(f"{anio}-{m:02d}-15 → {f.isoformat()}")
        desde, hasta = periodo("IVA_MENSUAL_ORDINARIO", dt.date(anio, m, 15))
        for t in range(10):
            vencimientos.append({"obligacion": "IVA_MENSUAL_ORDINARIO", "terminal": str(t), "fecha": f.isoformat(), "fecha_prorrogada": "",
                                 "periodo_desde": desde, "periodo_hasta": hasta})

    def escribir(nombre, filas, campos):
        with open(dir_sal / nombre, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=campos); w.writeheader(); w.writerows(filas)
    escribir("instrumento.csv", INSTRUMENTOS, ["codigo", "nombre", "gaceta", "fecha_publicacion", "fuente_archivo", "fuente_sha256"])
    escribir("obligacion.csv", obligaciones, ["codigo", "instrumento", "tipo_contribuyente", "base_legal", "nombre", "aplica_a", "requiere", "excluye", "nota"])
    vencimientos.sort(key=lambda v: (v["fecha"], v["obligacion"], int(v["terminal"])))
    escribir("vencimiento.csv", vencimientos, ["obligacion", "terminal", "fecha", "fecha_prorrogada", "periodo_desde", "periodo_hasta"])
    escribir("dia_inhabil.csv", list(feriados.values()), ["fecha", "descripcion", "tipo", "base_legal"])
    manifiesto = {"generado": dt.date.today().isoformat(), "conteos": {
        "instrumentos": len(INSTRUMENTOS), "obligaciones": len(obligaciones), "vencimientos": len(vencimientos),
        "dias_inhabiles": len(feriados)}, "prorrogas_ordinarios": prorrogas,
        "prorrogas_especiales": sorted({f"{v['fecha']} → {v['fecha_prorrogada']}" for v in vencimientos if v["fecha_prorrogada"]})}
    (dir_sal / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifiesto, ensure_ascii=False))


if __name__ == "__main__":
    main(*sys.argv[1:5])
