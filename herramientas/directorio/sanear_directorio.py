#!/usr/bin/env python3
"""Directorio de contribuyentes (docs/25): sanea las fuentes y genera la semilla, sin duplicados.

Fuentes (no van al repositorio: tienen correos, teléfonos y direcciones):
  fuentes/privadas/directorio/Importadores.xlsx            importadores con su CIF (una fila por nombre declarado)
  fuentes/privadas/directorio/proveesores SOftware.csv     sistemas de facturación (una fila por sistema y dirección)
  fuentes/privadas/directorio/Mejores PAgadores Terminal Deberes.csv
                                                           monto pagado por contribuyente y región (una fila por RIF y región)

Salida en datos/directorio/semilla/: contribuyente.csv, direccion.csv, importador.csv, software.csv, pagador.csv, pago_region.csv,
manifiesto.json (conteos que la carga verifica) e informe.json (qué se limpió).

Reglas:
  - RIF: J123456789 → J-12345678-9. Una fila por RIF en contribuyente e importador.
  - Importadores con el mismo RIF y el nombre escrito distinto ("ZONA TECH, C.A." / "ZONA TECH , C.A") se unen:
    se suma el CIF y se guardan los nombres declarados.
  - Software: una fila por ID de la fuente; las filas repetidas por cada dirección de la empresa se separan en direccion.
  - Pagadores: un RIF aparece una vez por cada región donde pagó (Capital, Contribuyentes Especiales…). Se deja una fila
    por RIF con el total y el desglose por región aparte. "Digito Verif" es el último dígito del RIF (el terminal): se omite.
    La exportación viene cortada en el límite de filas de Excel/Metabase (1.048.575), ordenada de mayor a menor monto.
  - Direcciones: sin repetir por RIF (misma vialidad, sector, edificación, local y teléfonos).
  - "NO INDICA", "NO APLICA", "-", "0000-0000000" y similares → vacío. Correos en minúscula y validados.
    Teléfonos como 0212-1234567. El campo "Pdf Data" ("[B@103488ef") no es el PDF y se descarta.

Uso: python3 herramientas/directorio/sanear_directorio.py [dir_fuentes] [dir_salida]   (solo biblioteca estándar)
"""
import collections
import csv
import hashlib
import json
import re
import sys
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from datetime import date
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
FUENTES = Path(sys.argv[1]) if len(sys.argv) > 1 else RAIZ / "fuentes/privadas/directorio"
SALIDA = Path(sys.argv[2]) if len(sys.argv) > 2 else RAIZ / "datos/directorio/semilla"
XLSX = FUENTES / "Importadores.xlsx"
SOFTWARE = FUENTES / "proveesores SOftware.csv"
PAGADORES = FUENTES / "Mejores PAgadores Terminal Deberes.csv"

informe = collections.Counter()

# --- Lectura del .xlsx sin dependencias -------------------------------------------------------------------------
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def leer_xlsx(ruta: Path) -> list[dict]:
    z = zipfile.ZipFile(ruta)
    compartidas = []
    if "xl/sharedStrings.xml" in z.namelist():
        for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(f"{NS}si"):
            compartidas.append("".join(t.text or "" for t in si.iter(f"{NS}t")))
    filas = []
    for row in ET.fromstring(z.read("xl/worksheets/sheet1.xml")).iter(f"{NS}row"):
        f = {}
        for c in row.iter(f"{NS}c"):
            col = re.match(r"[A-Z]+", c.get("r")).group()
            v = c.find(f"{NS}v")
            if c.get("t") == "s" and v is not None:
                f[col] = compartidas[int(v.text)]
            elif c.get("t") == "inlineStr":
                f[col] = "".join(t.text or "" for t in c.iter(f"{NS}t"))
            else:
                f[col] = v.text if v is not None else ""
        filas.append(f)
    columnas = sorted({k for f in filas for k in f}, key=lambda c: (len(c), c))
    cabecera = [filas[0].get(c, "").strip() for c in columnas]
    return [dict(zip(cabecera, (f.get(c, "") for c in columnas))) for f in filas[1:]]


# --- Normalización -----------------------------------------------------------------------------------------------
VACIOS = {"", "-", ".", "0", "0-", "N/A", "NA", "S/I", "NO INDICA", "NO IND", "NO APLICA", "NINGUNO", "NULL", "NONE"}


def texto(v: str | None) -> str:
    """Espacios colapsados, sin espacio antes de coma o punto; marcadores de "sin dato" → vacío."""
    v = re.sub(r"\s+", " ", (v or "").replace("\xa0", " ")).strip()
    v = re.sub(r"\s+([,.])", r"\1", v)
    if v.upper() in VACIOS:
        informe["textos_sin_dato_vaciados"] += 1 if v else 0
        return ""
    return v


def rif(v: str) -> str:
    v = re.sub(r"[^A-Z0-9]", "", (v or "").upper())
    if not re.fullmatch(r"[VEJPGC]\d{9}", v):
        raise ValueError(f"RIF con formato inesperado: {v!r}")
    return f"{v[0]}-{v[1:9]}-{v[9]}"


CORREO = re.compile(r"^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$")


def correo(v: str) -> str:
    v = texto(v).lower().replace(" ", "")
    if not v:
        return ""
    if not CORREO.match(v):
        informe["correos_invalidos_descartados"] += 1
        return ""
    return v


def telefono(v: str) -> str:
    d = re.sub(r"\D", "", texto(v))
    if len(d) == 10 and not d.startswith("0"):
        d = "0" + d
    if len(d) != 11 or not d.startswith("0") or int(d[4:]) == 0 or int(d[1:4]) == 0:
        if d:
            informe["telefonos_invalidos_descartados"] += 1
        return ""
    return f"{d[:4]}-{d[4:]}"


def web(v: str) -> str:
    v = texto(v).lower()
    if not v or "@" in v or "." not in v or " " in v:
        if v:
            informe["webs_invalidas_descartadas"] += 1
        return ""
    return v


def monto(v: str) -> str:
    """"$184.930.383,23" o "91.100.362.826,17" → "184930383.23"."""
    v = re.sub(r"[^\d,.\-]", "", v or "")
    if not v:
        return ""
    return f"{float(v.replace('.', '').replace(',', '.')):.2f}"


def periodo(v: str) -> str:
    v = texto(v)
    return v if re.fullmatch(r"(19|20)\d{2}(0[1-9]|1[0-2])", v) else ""


def fecha_iso(v: str) -> str:
    m = re.match(r"(\d{4}-\d{2}-\d{2})", texto(v))
    return m.group(1) if m else ""


MESES = {m: i for i, m in enumerate(["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
                                     "septiembre", "octubre", "noviembre", "diciembre"], 1)}


def fecha_larga(v: str) -> str:
    """"febrero 27, 2026, 12:00 a. m." → 2026-02-27."""
    m = re.match(r"([a-záéíóú]+)\s+(\d{1,2}),\s*(\d{4})", texto(v).lower())
    return date(int(m.group(3)), MESES[m.group(1)], int(m.group(2))).isoformat() if m and m.group(1) in MESES else ""


def clave(*partes: str) -> str:
    """Clave de comparación: sin acentos, mayúsculas, solo letras y números."""
    s = unicodedata.normalize("NFKD", " ".join(partes)).encode("ascii", "ignore").decode().upper()
    return re.sub(r"[^A-Z0-9]", "", s)


REGIONES = {"REGIONCAPITAL": "Región Capital", "REGIONCENTRAL": "Región Central", "REGIONLIBERTADOR": "Región Libertador",
            "REGIONLOSANDES": "Región Los Andes", "REGIONNORORIENTAL": "Región Nor Oriental",
            "REGIONCENTROOCCIDENTAL": "Región Centro Occidental", "REGIONZULIANA": "Región Zuliana", "REGIONGUAYANA": "Región Guayana",
            "REGIONINSULAR": "Región Insular", "REGIONLOSLLANOS": "Región Los Llanos", "REGIONFALCON": "Región Falcón",
            "REGIONDECONTRIBUYENTESESPECIALES": "Región de Contribuyentes Especiales", "NIVELNORMATIVO": "Nivel Normativo",
            "INFORMACIONNODISPONIBLE": "", "": ""}


def pagadores() -> tuple[list[dict], list[dict]]:
    """Una fila por RIF (total) y el desglose por región, sin repetir."""
    total: dict[str, dict] = {}
    region: dict[tuple, float] = collections.defaultdict(float)
    anterior = None
    with open(PAGADORES, encoding="utf-8-sig", newline="") as fh:
        for f in csv.DictReader(fh):
            informe["pagadores_filas_fuente"] += 1
            r = rif(f["Rif Contribuyente"])
            m = float(f["Suma Monto Total Pago"].replace(",", ""))
            if anterior is not None and m > anterior + 1e-9:
                raise ValueError("La exportación de pagadores no viene ordenada de mayor a menor")
            anterior = m
            k = clave(f["Region Nombre"])
            if k not in REGIONES:
                raise ValueError(f"Región desconocida: {f['Region Nombre']!r}")
            nombre, id_fuente = texto(f["Apellido Contribuyente"]), re.sub(r"\D", "", f["ID Contribuyente Pago"])
            p = total.setdefault(r, {"rif": r, "nombre": nombre, "id_fuente": id_fuente, "monto": 0.0, "regiones": 0})
            if p["id_fuente"] != id_fuente:
                raise ValueError(f"El RIF {r} tiene dos ID de la fuente")
            p["nombre"] = p["nombre"] or nombre
            p["monto"] += m
            if (r, REGIONES[k]) in region:
                informe["pagadores_region_repetida_sumada"] += 1
            else:
                p["regiones"] += 1
            region[(r, REGIONES[k])] += m
    informe["pagadores_rif_en_varias_regiones"] = sum(1 for p in total.values() if p["regiones"] > 1)
    informe["pagadores_monto_minimo_exportado"] = round(anterior or 0, 2)
    ps = sorted(total.values(), key=lambda p: p["rif"])
    for p in ps:
        p["monto"] = f"{p['monto']:.2f}"
    rs = [{"rif": r, "region": g, "monto": f"{m:.2f}"} for (r, g), m in sorted(region.items())]
    return ps, rs


MEDIOS = {"FORMALIBRE": "Forma libre", "IMPRENTADIGITAL": "Imprenta digital", "MAQUINAFISCAL": "Máquina fiscal"}

# --- Construcción ------------------------------------------------------------------------------------------------
contribuyentes: dict[str, dict] = {}
direcciones: dict[tuple, dict] = {}
importadores: dict[str, dict] = {}
software: dict[int, dict] = {}


def agregar_contribuyente(r: str, fila: dict, pre: str, fuente: str):
    c = contribuyentes.setdefault(r, {"rif": r, "razon_social": "", "correo": "", "ult_periodo_islr": "", "ult_periodo_iva": "",
                                      "venc_certificado": "", "fuentes": set()})
    nuevo = {"razon_social": texto(fila[pre + "Razon Social"]), "correo": correo(fila[pre + "Email"]),
             "ult_periodo_islr": periodo(fila[pre + "Ult Periodo Islr"]), "ult_periodo_iva": periodo(fila[pre + "Ult Periodo Iva"]),
             "venc_certificado": fecha_iso(fila[pre + "Fecha Venc Cert"])}
    for k, v in nuevo.items():
        if v and not c[k]:
            c[k] = v
        elif v and c[k] != v:
            informe[f"contribuyente_{k}_distinto_entre_fuentes"] += 1
            if k.startswith("ult_periodo") or k == "venc_certificado":
                c[k] = max(c[k], v)                                       # el más reciente
    c["fuentes"].add(fuente)
    d = {"rif": r, "vialidad": texto(fila[pre + "Vialidad"]), "sector": texto(fila[pre + "Sector"]),
         "edificacion": texto(fila[pre + "Edificacion"]), "local": texto(fila[pre + "Local Dir"]),
         "telefono": telefono(fila[pre + "Telefono"]), "telefono_2": telefono(fila[pre + "Telefono 2"]),
         "correo": correo(fila[pre + "Email Direccion"]), "web": web(fila[pre + "Web"])}
    if d["telefono_2"] == d["telefono"]:
        d["telefono_2"] = ""
    if d["correo"] == c["correo"]:
        d["correo"] = ""                                                  # ya está en el contribuyente
    k = (r, clave(d["vialidad"], d["sector"], d["edificacion"], d["local"]), d["telefono"], d["telefono_2"])
    if not any(d[x] for x in ("vialidad", "sector", "edificacion", "local", "telefono", "telefono_2", "correo", "web")):
        return
    if k in direcciones:
        informe["direcciones_repetidas_unidas"] += 1
        previa = direcciones[k]
        for x in ("correo", "web"):
            previa[x] = previa[x] or d[x]
    else:
        direcciones[k] = d


def main():
    filas = leer_xlsx(XLSX)
    informe["importadores_filas_fuente"] = len(filas)
    for f in filas:
        r = rif(f["Rif Consignatario"])
        agregar_contribuyente(r, f, "", "importadores")
        i = importadores.setdefault(r, {"rif": r, "nombres": [], "cif_usd": 0.0, "cif_bs": 0.0, "registros": 0})
        nombre = texto(f["Nombre Consignatario"])
        if nombre and clave(nombre) not in {clave(n) for n in i["nombres"]}:
            i["nombres"].append(nombre)
        i["cif_usd"] += float(monto(f["Cif Dolar"]) or 0)
        i["cif_bs"] += float(monto(f["Cif Bolivares"]) or 0)
        i["registros"] += 1
    informe["importadores_rif_repetidos_unidos"] = sum(1 for i in importadores.values() if i["registros"] > 1)

    filas = list(csv.DictReader(open(SOFTWARE, encoding="utf-8-sig", newline="")))
    informe["software_filas_fuente"] = len(filas)
    pre = "Contactos - Rif → "
    for f in filas:
        r = rif(f["Rif"])
        if f[pre + "Rif"] and rif(f[pre + "Rif"]) != r:
            raise ValueError(f"El contacto no corresponde al RIF {r}")
        agregar_contribuyente(r, f, pre, "software")
        sid = int(f["ID"])
        medios = sorted({MEDIOS[clave(m)] for m in texto(f["Medio De Emision"]).split(",") if clave(m) in MEDIOS})
        s = {"id": sid, "rif": r, "empresa": texto(f["Empresa"]), "sistema": texto(f["Sistema"]), "version": texto(f["Version"]),
             "medios": "{" + ",".join(f'"{m}"' for m in medios) + "}", "categoria": texto(f["Categoria"]),
             "descripcion": texto(f["Descripcion"]), "fecha_lanzamiento": fecha_larga(f["Fecha Lanzamiento"]),
             "modalidad": texto(f["Modalidad"]).lower(), "pdf_archivo": texto(f["Pdf Filename"])}
        if s["modalidad"] not in ("exclusivo", "distribuido"):
            raise ValueError(f"Modalidad inesperada: {s['modalidad']!r}")
        if sid in software:
            if software[sid] != s:
                raise ValueError(f"El sistema {sid} aparece con datos distintos")
            informe["software_filas_repetidas_por_direccion"] += 1
        else:
            software[sid] = s
    # Mismo RIF, sistema y versión con otro ID: se conserva el primero
    vistos = {}
    for sid in sorted(software):
        k = (software[sid]["rif"], clave(software[sid]["sistema"]), clave(software[sid]["version"]))
        if k in vistos:
            informe["software_mismo_sistema_otro_id"] += 1
            del software[sid]
        else:
            vistos[k] = sid

    pg, pr = pagadores()

    SALIDA.mkdir(parents=True, exist_ok=True)

    def escribir(nombre: str, filas: list[dict], columnas: list[str]):
        with open(SALIDA / nombre, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, columnas, extrasaction="ignore")
            w.writeheader()
            w.writerows(filas)
        return hashlib.sha256((SALIDA / nombre).read_bytes()).hexdigest()

    cs = sorted(contribuyentes.values(), key=lambda c: c["rif"])
    for c in cs:
        c["fuentes"] = "{" + ",".join(sorted(c["fuentes"])) + "}"
    ds = sorted(direcciones.values(), key=lambda d: (d["rif"], d["vialidad"], d["sector"], d["edificacion"], d["local"], d["telefono"]))
    im = sorted(importadores.values(), key=lambda i: i["rif"])
    for i in im:
        i["nombres"] = "{" + ",".join('"' + n.replace("\\", "\\\\").replace('"', '\\"') + '"' for n in i["nombres"]) + "}"
        i["cif_usd"] = f"{i['cif_usd']:.2f}"
        i["cif_bs"] = f"{i['cif_bs']:.2f}"
    sw = [software[k] for k in sorted(software)]
    sumas = {
        "contribuyente.csv": escribir("contribuyente.csv", cs, ["rif", "razon_social", "correo", "ult_periodo_islr", "ult_periodo_iva", "venc_certificado", "fuentes"]),
        "direccion.csv": escribir("direccion.csv", ds, ["rif", "vialidad", "sector", "edificacion", "local", "telefono", "telefono_2", "correo", "web"]),
        "importador.csv": escribir("importador.csv", im, ["rif", "nombres", "cif_usd", "cif_bs", "registros"]),
        "software.csv": escribir("software.csv", sw, ["id", "rif", "empresa", "sistema", "version", "medios", "categoria", "descripcion", "fecha_lanzamiento", "modalidad", "pdf_archivo"]),
        "pagador.csv": escribir("pagador.csv", pg, ["rif", "nombre", "id_fuente", "monto", "regiones"]),
        "pago_region.csv": escribir("pago_region.csv", pr, ["rif", "region", "monto"]),
    }
    conteos = {"contribuyentes": len(cs), "direcciones": len(ds), "importadores": len(im), "software": len(sw),
               "pagadores": len(pg), "pagos_region": len(pr)}
    fuentes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in (XLSX, SOFTWARE, PAGADORES)}
    json.dump({"generado": date.today().isoformat(), "conteos": conteos, "sha256": sumas, "fuentes_sha256": fuentes},
              open(SALIDA / "manifiesto.json", "w"), indent=2, ensure_ascii=False)
    json.dump(dict(sorted(informe.items())), open(SALIDA / "informe.json", "w"), indent=2, ensure_ascii=False)
    print(json.dumps({"conteos": conteos, "informe": dict(sorted(informe.items()))}, indent=2, ensure_ascii=False))


main()
