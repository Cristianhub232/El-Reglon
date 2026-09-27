#!/usr/bin/env python3
"""Extrae el histórico oficial de tipos de cambio del BCV desde los archivos trimestrales
"2_1_2<t><aa>_smc.xls" (Tipo de Cambio de Referencia, Sistema de Mercado Cambiario) y lo
homologa con la estructura del módulo BCV de El Renglón.

Uso:
    python3 extraer_historico_bcv.py <dir_con_xls> <dir_salida>

Requiere: xlrd 2.x (ver herramientas/requirements.txt).

Estructura de cada hoja (una por día de operación):
    fila 0   "BANCO CENTRAL DE VENEZUELA" | "dd/mm/aaaa hh:mm AM/PM"  (hora de publicación)
    fila 4   "Fecha Operacion: dd/mm/aaaa" | "Fecha Valor: dd/mm/aaaa"
    fila 8   encabezado: Moneda/País | Compra (BID) | Venta (ASK) | Compra (BID) | Venta (ASK)
    fila 10+ código | país | cotización M.E./US$ (compra, venta) | Bs./M.E. (compra, venta)
             (el EUR se cotiza en US$ por EUR; nota "(a)" de la hoja)

La TASA OFICIAL es "Venta (ASK)" en Bs./M.E.: coincide con la publicada en la portada del BCV
(verificado el 27/09/2026 para la fecha valor 28/09/2026: USD 857,0058 y EUR 976,90091142).

Salida: fuente.csv, moneda.csv, publicacion.csv, tasa.csv, observacion.csv, manifiesto.json
Aborta (código 1) ante cualquier inconsistencia estructural; registra las de contenido.
"""
import csv
import hashlib
import json
import re
import sys
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path

import xlrd

RE_ARCHIVO = re.compile(r"^2_1_2([a-d])(\d{2})_smc\.xls$")
RE_FECHA = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
RE_PUBLICADO = re.compile(r"^(\d{2})/(\d{2})/(\d{4}) (\d{2}):(\d{2}) ([AP]M)$")
# Códigos que el BCV publica y que no coinciden con ISO 4217 vigente
ISO = {"MXP": ("MXN", "El BCV usa 'MXP' (código anterior a 1993); el ISO 4217 vigente es MXN"),
       "CUC": ("CUC", "Peso cubano convertible; retirado por Cuba en 2021, el BCV lo sigue publicando")}
COTIZA_EN_USD_POR_UNIDAD = {"EUR"}   # nota "(a)" de la hoja
TOLERANCIA_CRUZADA = Decimal("0.0005")  # 0,05 % entre Bs./M.E. y Bs./US$ ÷ cotización
SALTO_DIARIO = Decimal("0.05")           # 5 % de variación diaria del USD se registra para revisión


class ErrorEstructura(Exception):
    pass


def fecha(texto):
    m = RE_FECHA.search(texto)
    if not m:
        raise ErrorEstructura(f"fecha no reconocida: {texto!r}")
    d, mth, y = map(int, m.groups())
    return date(y, mth, d)


def decimal(valor):
    d = Decimal(repr(float(valor)))
    if d.as_tuple().exponent < -8:
        d = d.quantize(Decimal("0.00000001"))
    return d


def leer_hoja(sh, archivo):
    celdas = lambda r: [sh.cell(r, c).value for c in range(sh.ncols)]  # noqa: E731
    cab = [v for v in celdas(0) if v]
    fechas = [str(v) for v in celdas(4) if v]
    fo = next((fecha(v) for v in fechas if v.startswith("Fecha Operacion")), None)
    fv = next((fecha(v) for v in fechas if v.startswith("Fecha Valor")), None)
    if not fo or not fv:
        raise ErrorEstructura(f"{archivo}#{sh.name}: faltan fechas de operación o valor")
    if sh.name != fo.strftime("%d%m%Y"):
        raise ErrorEstructura(f"{archivo}#{sh.name}: el nombre de la hoja no coincide con la fecha de operación {fo}")
    # las columnas se ubican a partir del encabezado "Moneda/País" (código a su izquierda, 4 valores a su derecha)
    enc = [str(v).strip() for v in celdas(8)]
    if "Moneda/País" not in enc:
        raise ErrorEstructura(f"{archivo}#{sh.name}: no se encontró el encabezado 'Moneda/País' en la fila 8")
    c_mp = enc.index("Moneda/País")
    if enc[c_mp + 1:c_mp + 5] != ["Compra (BID)", "Venta (ASK)", "Compra (BID)", "Venta (ASK)"]:
        raise ErrorEstructura(f"{archivo}#{sh.name}: encabezado de columnas inesperado {enc}")
    publicado = None
    m = RE_PUBLICADO.match(str(cab[1]).strip()) if len(cab) > 1 else None
    if m:
        d, mth, y, hh, mm, ap = m.groups()
        h = int(hh) % 12 + (12 if ap == "PM" else 0)
        publicado = f"{y}-{mth}-{d}T{h:02d}:{mm}:00-04:00"
    tasas = []
    for r in range(10, sh.nrows):
        v = celdas(r)
        cod = str(v[c_mp - 1]).strip()
        if not re.fullmatch(r"[A-Z]{3}", cod):
            if tasas:
                break
            continue
        nums = v[c_mp + 1:c_mp + 5]
        if not all(isinstance(x, float) for x in nums):
            raise ErrorEstructura(f"{archivo}#{sh.name}: fila {cod} con valores no numéricos {nums}")
        cc, cv, bc, bv = map(decimal, nums)
        tasas.append({"moneda": cod, "pais": str(v[c_mp]).strip(), "cotizacion_compra": cc, "cotizacion_venta": cv,
                      "compra_bs": bc, "venta_bs": bv})
    return {"fecha_operacion": fo, "fecha_valor": fv, "publicado_en": publicado, "tasas": tasas}


def main(dir_xls, dir_sal):
    dir_xls, dir_sal = Path(dir_xls), Path(dir_sal)
    dir_sal.mkdir(parents=True, exist_ok=True)
    archivos = sorted(p for p in dir_xls.iterdir() if RE_ARCHIVO.match(p.name))
    if not archivos:
        raise SystemExit(f"No hay archivos 2_1_2*_smc.xls en {dir_xls}")
    fuentes, publicaciones, tasas, monedas, obs = [], {}, [], {}, []
    errores = []
    for arch in archivos:
        trim, anio = RE_ARCHIVO.match(arch.name).groups()
        libro = xlrd.open_workbook(str(arch))
        fuentes.append({"archivo": arch.name, "sha256": hashlib.sha256(arch.read_bytes()).hexdigest(),
                        "periodo": f"20{anio}-T{'abcd'.index(trim) + 1}", "hojas": libro.nsheets})
        for sh in libro.sheets():
            try:
                p = leer_hoja(sh, arch.name)
            except ErrorEstructura as e:
                errores.append(str(e))
                continue
            # --- validaciones por publicación
            if not (p["fecha_operacion"] < p["fecha_valor"] <= p["fecha_operacion"] + timedelta(days=6)):
                errores.append(f"{arch.name}#{sh.name}: fecha valor {p['fecha_valor']} fuera de rango")
            cods = [t["moneda"] for t in p["tasas"]]
            if "USD" not in cods or "EUR" not in cods or len(cods) != len(set(cods)):
                errores.append(f"{arch.name}#{sh.name}: monedas incompletas o repetidas {cods}")
                continue
            usd = next(t for t in p["tasas"] if t["moneda"] == "USD")
            if usd["cotizacion_compra"] != 1 or usd["cotizacion_venta"] != 1:
                errores.append(f"{arch.name}#{sh.name}: la cotización del USD no es 1")
            for t in p["tasas"]:
                if not (0 < t["compra_bs"] <= t["venta_bs"]) or not (0 < t["cotizacion_compra"] <= t["cotizacion_venta"]):
                    errores.append(f"{arch.name}#{sh.name}: {t['moneda']} con compra > venta o valores no positivos")
                # coherencia cruzada: Bs./M.E. = Bs./US$ × (US$/M.E.)
                esperado = (usd["venta_bs"] * t["cotizacion_venta"] if t["moneda"] in COTIZA_EN_USD_POR_UNIDAD
                            else usd["venta_bs"] / t["cotizacion_compra"])
                desv = abs(t["venta_bs"] - esperado) / t["venta_bs"]
                if desv > TOLERANCIA_CRUZADA:
                    obs.append({"tipo": "incoherencia_cruzada", "fecha_valor": p["fecha_valor"], "moneda": t["moneda"],
                                "detalle": f"venta Bs {t['venta_bs']} vs derivada del USD {esperado:.8f} (desvío {desv:.4%})"})
                monedas.setdefault(t["moneda"], t["pais"])
            clave = p["fecha_valor"]
            fila_pub = {"fecha_valor": p["fecha_valor"], "fecha_operacion": p["fecha_operacion"],
                        "publicado_en": p["publicado_en"] or "", "fuente_archivo": arch.name, "hoja": sh.name}
            if clave in publicaciones:
                previa = publicaciones[clave]
                if previa["tasas"] != p["tasas"]:
                    errores.append(f"fecha valor {clave} publicada dos veces con valores distintos "
                                   f"({previa['pub']['fuente_archivo']}#{previa['pub']['hoja']} y {arch.name}#{sh.name})")
                else:
                    obs.append({"tipo": "publicacion_duplicada", "fecha_valor": clave, "moneda": "",
                                "detalle": f"idéntica en {previa['pub']['fuente_archivo']}#{previa['pub']['hoja']} y {arch.name}#{sh.name}"})
                continue
            publicaciones[clave] = {"pub": fila_pub, "tasas": p["tasas"]}
            if not p["publicado_en"]:
                obs.append({"tipo": "sin_hora_publicacion", "fecha_valor": clave, "moneda": "", "detalle": f"{arch.name}#{sh.name}"})

    if errores:
        print("ERRORES DE ESTRUCTURA O CONTENIDO:", *errores[:30], sep="\n  ", file=sys.stderr)
        sys.exit(1)

    # --- series ordenadas, continuidad y cobertura
    fechas = sorted(publicaciones)
    previo = None
    for fv in fechas:
        for t in publicaciones[fv]["tasas"]:
            tasas.append({"fecha_valor": fv, "moneda": t["moneda"], "compra_bs": t["compra_bs"], "venta_bs": t["venta_bs"],
                          "cotizacion_compra": t["cotizacion_compra"], "cotizacion_venta": t["cotizacion_venta"]})
        usd = next(t["venta_bs"] for t in publicaciones[fv]["tasas"] if t["moneda"] == "USD")
        if previo is not None and abs(usd - previo[1]) / previo[1] > SALTO_DIARIO:
            obs.append({"tipo": "variacion_diaria_mayor_5pct", "fecha_valor": fv, "moneda": "USD",
                        "detalle": f"{previo[1]} ({previo[0]}) -> {usd}"})
        previo = (fv, usd)
    d = fechas[0]
    while d <= fechas[-1]:
        if d.weekday() < 5 and d not in publicaciones:
            obs.append({"tipo": "dia_habil_sin_fecha_valor", "fecha_valor": d, "moneda": "",
                        "detalle": "feriado bancario probable; la tasa aplicable es la del siguiente día hábil (art. 25 Ley IVA)"})
        d += timedelta(days=1)

    def escribir(nombre, filas, campos):
        with open(dir_sal / nombre, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=campos)
            w.writeheader()
            for f in filas:
                w.writerow({k: (str(v) if v is not None else "") for k, v in f.items()})

    escribir("fuente.csv", fuentes, ["archivo", "sha256", "periodo", "hojas"])
    escribir("moneda.csv", [{"codigo": c, "pais": p, "codigo_iso": ISO.get(c, (c, ""))[0], "nota": ISO.get(c, (c, ""))[1]}
                            for c, p in sorted(monedas.items())], ["codigo", "pais", "codigo_iso", "nota"])
    escribir("publicacion.csv", [publicaciones[f]["pub"] for f in fechas],
             ["fecha_valor", "fecha_operacion", "publicado_en", "fuente_archivo", "hoja"])
    escribir("tasa.csv", tasas, ["fecha_valor", "moneda", "compra_bs", "venta_bs", "cotizacion_compra", "cotizacion_venta"])
    escribir("observacion.csv", sorted(obs, key=lambda o: (str(o["fecha_valor"]), o["tipo"], o["moneda"])),
             ["tipo", "fecha_valor", "moneda", "detalle"])
    ult = publicaciones[fechas[-1]]
    manifiesto = {
        "descripcion": "Histórico oficial del BCV: Tipo de Cambio de Referencia (Sistema de Mercado Cambiario)",
        "tasa_oficial": "venta_bs (Venta ASK en Bs./M.E.), igual a la publicada en la portada del BCV",
        "base_legal": "Convenio Cambiario N° 1, art. 9, parágrafo primero; Resolución N° 19-05-01 (nota al pie de cada hoja)",
        "generado": datetime.now().date().isoformat(),
        "rango_fecha_valor": [fechas[0].isoformat(), fechas[-1].isoformat()],
        "ultima": {"fecha_valor": fechas[-1].isoformat(),
                   **{t["moneda"]: str(t["venta_bs"]) for t in ult["tasas"] if t["moneda"] in ("USD", "EUR")}},
        "conteos": {"archivos": len(fuentes), "publicaciones": len(fechas), "tasas": len(tasas), "monedas": len(monedas),
                    "observaciones": len(obs)},
    }
    (dir_sal / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifiesto, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
