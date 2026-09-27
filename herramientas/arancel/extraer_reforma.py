#!/usr/bin/env python3
"""Extrae los cambios de una reforma del Arancel de Aduanas (Decreto N° 4.944) a CSV.

Uso:
    python3 extraer_reforma.py <pdf> <pag_desde> <pag_hasta> <salida.csv> ['{"paginas":[3,4],"x_division":330}']

Lee el texto con maquetación (`pdftotext -layout`) y ubica las columnas de cada tabla por la
posición de los marcadores de columna "(1)".."(7)" de su encabezado. Reconoce:

  * Listas "N° | Código | valor" repetidas en 2 o 3 grupos por línea:
      - marcador (4)        -> cambio de Ex.AEC                       (tipo = exaec)
      - marcadores (5)[(6)] -> cambio de régimen legal imp. [y exp.]  (tipo = regimen)
  * Tablas completas de 7 columnas (una o dos lado a lado):
      - bajo "DONDE DICE:"  -> texto anterior                          (tipo = dice)
      - bajo "DEBE DECIR:"  -> texto nuevo                             (tipo = debe)
      - en un artículo que "incorpora" partidas o subcapítulos         (tipo = incorpora)

No interpreta ni aplica nada: solo transcribe. La aplicación y sus validaciones están en
aplicar_reformas.py.
"""
import csv
import io
import json
import re
import subprocess
import sys

from extraer_arancel import normalizar_filas, palabras_por_pagina, procesar_paginas

RE_MARCA = re.compile(r"\((\d)\)")
RE_COD = r"\d{2}\.\d{2}|\d{4}(?:\.\d{1,2}){0,3}"
RE_ARTICULO = re.compile(r"Art[ií]culo\s+(\d+)°?\.\s+Se\s+(modifica|incorpora|elimina|suprime|deroga)", re.I)
RE_AEC = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)(BK|BIT)?$")
RE_EXAEC = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)?(E|A)?$")
UNIDADES = {"Kg": "kg", "KG": "kg", "ℓ": "l", "Lt": "l", "U": "u"}
# Encabezados y pies de página que se repiten dentro de las tablas.
# Líneas que se saltan completas (no traen datos):
MUEBLE_LINEA = re.compile(r"Descripción de las Mercancías|Tarifa Ad|Régimen\s+Legal|Importación\s+Exportación|"
                          r"DESPACHO DEL PRESIDENTE|GACETA OFICIAL|REPÚBLICA BOLIVARIANA|"
                          r"^\s*(AEC|Ex\.AEC|Física|Unidad)\b|^\s*\d{1,3}\s*$")
# Fragmentos que se borran (se reemplazan por espacios para no mover columnas):
MUEBLE_TEXTO = re.compile(r"Decreto\s+N°\s*5\.\d{3}\s+Pág\.?(\s*\d{1,3}(?=\s|$))?")
FIN = re.compile(r"Art[ií]culo\s+\d+°?\.|DEBE DECIR|DONDE DICE|Dado en Caracas|Cúmplase")


def _texto(pdf, desde, hasta, recorte=None):
    cmd = ["pdftotext", "-layout", "-f", str(desde), "-l", str(hasta)]
    if recorte:
        x, w = recorte
        cmd += ["-x", str(x), "-y", "0", "-W", str(w), "-H", "2000"]
    return subprocess.run(cmd + [str(pdf), "-"], capture_output=True, text=True, check=True).stdout


def filas_dos_columnas(pdf, cfg):
    """Páginas con dos tablas completas lado a lado: se leen por coordenadas (mismo método que la
    tabla base), primero la mitad izquierda y luego la derecha de cada página. Una fila partida
    entre columnas se imprime dos veces con el mismo código: se unen."""
    x = cfg["x_division"]
    mitades = []
    for num, pal in palabras_por_pagina(pdf):
        if num in cfg["paginas"]:
            mitades.append((num, [w for w in pal if (w[0] + w[2]) / 2 < x]))
            mitades.append((num, [w for w in pal if (w[0] + w[2]) / 2 >= x]))
    log = io.StringIO()
    crudas, _ = procesar_paginas(mitades, log)
    nodos, _ = normalizar_filas(crudas, log)
    unidas = []
    for n in nodos:
        if unidas and unidas[-1]["codigo"] == n["codigo"]:
            prev = unidas[-1]
            if len(n["descripcion"]) > len(prev["descripcion"]):
                prev["descripcion"] = n["descripcion"]
            for k in ("aec", "marca_aec", "exaec", "marca_exaec", "regimen_importacion", "regimen_exportacion", "unidad"):
                prev[k] = prev[k] or n[k]
            continue
        unidas.append(n)
    return unidas, log.getvalue()


def paginas(pdf, desde, hasta, omitir=()):
    txt = _limpiar(_texto(pdf, desde, hasta))
    return [(desde + k, pg.splitlines()) for k, pg in enumerate(txt.split("\f")) if desde + k not in omitir]
    txt = _limpiar(_texto(pdf, desde, hasta))
    return [(desde + k, pg.splitlines()) for k, pg in enumerate(txt.split("\f"))]


def _limpiar(txt):
    # la copia de la GO 6.918 trae la marca de agua "www.aduaneros.net" incrustada en el texto
    return txt.replace("www.aduaneros.net", " " * len("www.aduaneros.net"))


def clasificar(intro):
    t = re.sub(r"\s+", " ", intro).lower()
    if "nomenclatura" in t:
        return "nomenclatura"
    if "incorpora" in t and ("subcapítulo" in t or "subpartida" in t or "partida" in t):
        return "incorpora"
    if "columna cuatro (4)" in t:
        return "exaec"
    if "columna cinco (5)" in t or "columnas cinco (5)" in t:
        return "regimen"
    return "texto"


def grupos_de_encabezado(lineas, i):
    """Marcadores de la línea i (más la siguiente si solo trae marcadores sueltos)."""
    marcas = [(int(m.group(1)), (m.start() + m.end() - 1) / 2) for m in RE_MARCA.finditer(lineas[i])]
    if i + 1 < len(lineas):
        extra = [(int(m.group(1)), (m.start() + m.end() - 1) / 2) for m in RE_MARCA.finditer(lineas[i + 1])]
        if extra and not any(n == 1 for n, _ in extra):
            marcas += extra
    marcas.sort(key=lambda m: m[1])
    grupos = []
    for n, pos in marcas:
        if n == 1 or not grupos:
            grupos.append({})
        grupos[-1][n] = pos
    validos = []
    for g in grupos:
        if 1 not in g:
            continue
        completa = all(k in g for k in (2, 3, 7))
        if completa or any(k in g for k in (4, 5)):
            validos.append({"cols": g, "tipo": "completa" if completa else "lista"})
    for k, g in enumerate(validos):
        margen = 10 if g["tipo"] == "completa" else 15
        g["ini"] = max(0, int(g["cols"][1] - margen))
        g["fin"] = None
        if k > 0:
            validos[k - 1]["fin"] = g["ini"]
    return validos


def segmento(linea, g):
    return linea[g["ini"]:g["fin"]] if g["fin"] else linea[g["ini"]:]


def valores_por_columna(texto, offset, g, desde_col=3):
    """Asigna cada token (con su posición en la línea) a la columna de marcador más cercana."""
    res = {}
    for m in re.finditer(r"\S+", texto):
        if RE_MARCA.fullmatch(m.group(0)):
            continue
        centro = offset + (m.start() + m.end() - 1) / 2
        col = min(((abs(centro - p), n) for n, p in g["cols"].items() if n >= desde_col), default=(0, None))[1]
        if col:
            res.setdefault(col, []).append(m.group(0))
    return res


def normalizar_valores(v):
    out = {"aec": "", "marca_aec": "", "exaec": "", "marca_exaec": "", "regimen_importacion": "",
           "regimen_exportacion": "", "unidad": "", "aviso": ""}
    c3 = "".join(v.get(3, []))
    if c3:
        m = RE_AEC.match(c3)
        if m:
            out["aec"], out["marca_aec"] = m.group(1).replace(",", "."), m.group(2) or ""
        else:
            out["aviso"] += f"AEC ilegible {c3!r}; "
    c4 = "".join(v.get(4, []))
    if "±DV" in c4:
        c4 = c4.replace("±DV", "").strip(",")
        out["marca_exaec"] = "±DV"
    if c4:
        partes = [p for p in c4.split(",") if p]
        buenos = [RE_EXAEC.match(p) for p in partes if RE_EXAEC.match(p)]
        if len(buenos) != len(partes):
            out["aviso"] += f"Ex.AEC ilegible {c4!r}; "
        nums = [b.group(1) for b in buenos if b.group(1)]
        marcas = list(dict.fromkeys(b.group(2) for b in buenos if b.group(2)))
        out["exaec"] = nums[0].replace(",", ".") if nums else ""
        out["marca_exaec"] = ",".join([x for x in [out["marca_exaec"]] + marcas if x])
    out["regimen_importacion"] = "".join(v.get(5, [])).strip(",")
    out["regimen_exportacion"] = "".join(v.get(6, [])).strip(",")
    u = " ".join(v.get(7, []))
    out["unidad"] = UNIDADES.get(u, u)
    return out


def main(pdf, desde, hasta, salida, dos_columnas=None):
    desde, hasta = int(desde), int(hasta)
    if isinstance(dos_columnas, str):
        dos_columnas = json.loads(dos_columnas)
    filas = []
    articulo, modo, dice_debe = None, "texto", None
    activos, abiertas = [], {}   # grupos de la última cabecera y fila completa abierta por grupo
    omitir = set(dos_columnas["paginas"]) if dos_columnas else set()
    for pag, lineas in paginas(pdf, desde, hasta, omitir):
        # (activos y abiertas se conservan entre páginas: una fila puede seguir en la siguiente)
        i = 0
        while i < len(lineas):
            ln = lineas[i]
            m = RE_ARTICULO.search(ln)
            if m:
                articulo = int(m.group(1))
                intro = ln[m.start():] + " " + " ".join(lineas[i + 1:i + 9])
                modo, dice_debe, activos, abiertas = clasificar(intro), None, [], {}
            if "DONDE DICE" in ln:
                dice_debe, activos, abiertas = "dice", [], {}
            if "DEBE DECIR" in ln:
                dice_debe, activos, abiertas = "debe", [], {}
            if RE_MARCA.search(ln) and "(1)" in ln:
                g = grupos_de_encabezado(lineas, i)
                if g:
                    # encabezado repetido (salto de página): una fila abierta puede continuar debajo
                    mismo = [x["tipo"] for x in g] == [x["tipo"] for x in activos]
                    activos, abiertas = g, (abiertas if mismo else {})
                    i += 1
                    continue
            listas = [g for g in activos if g["tipo"] == "lista"]
            if listas:
                # cada par "N° código" abre una celda; su valor llega hasta el siguiente par o el fin de línea
                pares = list(re.finditer(r"(?<!\S)(\d{1,4})\s+(\d{4}\.\d{2}\.\d{2}\.\d{2})(?!\S)", ln))
                for k2, mm in enumerate(pares):
                    fin = pares[k2 + 1].start() if k2 + 1 < len(pares) else len(ln)
                    centro_cod = (mm.start(2) + mm.end(2)) / 2
                    g = min(listas, key=lambda gg: abs(gg["cols"][1] - centro_cod))
                    v = valores_por_columna(ln[mm.end():fin], mm.end(), g, desde_col=4)
                    if 4 in g["cols"]:
                        val = "".join(v.get(4, [])).replace(" ", "")
                        n = normalizar_valores({4: [val.replace("±DV", "")]})
                        marca = ",".join(x for x in (["±DV"] if "±DV" in val else []) + [n["marca_exaec"]] if x)
                        filas.append({"tipo": "exaec", "articulo": articulo, "pagina": pag, "codigo": mm.group(2),
                                      "numero": mm.group(1), "exaec": n["exaec"], "marca_exaec": marca,
                                      "aviso": n["aviso"] or ("" if (n["exaec"] or marca) else f"Ex.AEC vacío {val!r}")})
                    else:
                        imp = "".join(v.get(5, [])).replace(" ", "").strip(",")
                        exp = "".join(v.get(6, [])).replace(" ", "").strip(",")
                        filas.append({"tipo": "regimen", "articulo": articulo, "pagina": pag, "codigo": mm.group(2),
                                      "numero": mm.group(1), "regimen_importacion": imp, "regimen_exportacion": exp,
                                      "columnas": "5,6" if 6 in g["cols"] else "5",
                                      "aviso": "" if re.fullmatch(r"(\d{1,2}(,\d{1,2})*)?", imp) else f"régimen ilegible {imp!r}"})
            if MUEBLE_LINEA.search(ln) or re.fullmatch(r"(\s*\(\d\))+\s*", ln):  # marcadores sueltos
                i += 1
                continue
            ln = MUEBLE_TEXTO.sub(lambda m: " " * len(m.group(0)), ln)
            for gi, g in enumerate(activos):
                seg = segmento(ln, g)
                if not seg.strip():
                    continue
                if g["tipo"] == "lista":
                    continue
                if False:
                    mm = re.match(r"^\s*(\d{1,4})\s+(\d{4}\.\d{2}\.\d{2}\.\d{2})\b(.*)$", seg)
                    if not mm:
                        continue
                    resto_off = g["ini"] + mm.start(3)
                    v = valores_por_columna(mm.group(3), resto_off, g, desde_col=4)
                    if 4 in g["cols"]:
                        val = "".join(v.get(4, [])).replace(" ", "")
                        n = normalizar_valores({4: [val.replace("±DV", "")]})
                        marca = ",".join(x for x in (["±DV"] if "±DV" in val else []) + [n["marca_exaec"]] if x)
                        filas.append({"tipo": "exaec", "articulo": articulo, "pagina": pag, "codigo": mm.group(2),
                                      "numero": mm.group(1), "exaec": n["exaec"], "marca_exaec": marca,
                                      "aviso": n["aviso"] or ("" if (n["exaec"] or marca) else f"Ex.AEC vacío {val!r}")})
                    else:
                        imp = "".join(v.get(5, [])).replace(" ", "").strip(",")
                        exp = "".join(v.get(6, [])).replace(" ", "").strip(",")
                        filas.append({"tipo": "regimen", "articulo": articulo, "pagina": pag, "codigo": mm.group(2),
                                      "numero": mm.group(1),
                                      "regimen_importacion": imp, "regimen_exportacion": exp,
                                      "columnas": "5,6" if 6 in g["cols"] else "5",
                                      "aviso": "" if re.fullmatch(r"(\d{1,2}(,\d{1,2})*)?", imp) else f"régimen ilegible {imp!r}"})
                    continue
                # --- tabla completa
                if FIN.search(seg):
                    abiertas.pop(gi, None)
                    continue
                x_desc_fin = g["cols"][3] - (g["cols"][4] - g["cols"][3]) / 2 - g["ini"]
                mc = re.match(rf"^\s*({RE_COD})(\s+|$)", seg)
                izquierda = seg[:int(x_desc_fin)]
                derecha = seg[int(x_desc_fin):]
                if mc and mc.start(1) < 12:
                    tipo = dice_debe or ("incorpora" if modo == "incorpora" else "desconocido")
                    fila = {"tipo": tipo, "articulo": articulo, "pagina": pag, "codigo": mc.group(1),
                            "desc": [izquierda[mc.end():]], "vals": {}, "x_desc": mc.end()}
                    filas.append(fila)
                    abiertas[gi] = fila
                elif gi in abiertas:
                    fila = abiertas[gi]
                    # en la columna del código de una línea de continuación solo puede haber ruido
                    izq = izquierda[max(0, fila["x_desc"] - 3):]
                    if izq.strip():
                        fila["desc"].append(izq)
                else:
                    continue
                v = valores_por_columna(derecha, g["ini"] + int(x_desc_fin), g)
                for col, toks in v.items():
                    fila["vals"].setdefault(col, []).extend(toks)
            i += 1

    if dos_columnas:
        nodos, log2 = filas_dos_columnas(pdf, dos_columnas)
        tipo = dice_debe or ("incorpora" if modo == "incorpora" else "desconocido")
        for n in nodos:
            filas.append({"tipo": tipo, "articulo": articulo, "pagina": n["pagina"], "codigo": n["codigo"],
                          "nivel": n["nivel"], "descripcion": n["descripcion"],
                          **{k: n[k] for k in ("aec", "marca_aec", "exaec", "marca_exaec", "regimen_importacion",
                                               "regimen_exportacion", "unidad")},
                          "aviso": "; ".join(l for l in log2.splitlines() if n["codigo"] in l)})

    # Una fila partida entre columnas o páginas se imprime dos veces con el mismo código (inicio
    # truncado y fila completa). Se unen: valores de la que los tenga, descripción más larga.
    unidas = []
    for f in filas:
        prev = unidas[-1] if unidas else None
        if prev and "desc" in f and "desc" in prev and prev["codigo"] == f["codigo"] and prev["tipo"] == f["tipo"]:  # noqa
            d_prev, d_f = " ".join(prev["desc"]), " ".join(f["desc"])
            if len(d_f.split()) > len(d_prev.split()):
                prev["desc"] = f["desc"]
            for col, toks in f["vals"].items():
                if not prev["vals"].get(col):
                    prev["vals"][col] = toks
            continue
        unidas.append(f)
    filas = unidas
    for f in filas:
        f.pop("x_desc", None)

    campos = ["tipo", "articulo", "pagina", "numero", "codigo", "nivel", "descripcion", "aec", "marca_aec", "exaec",
              "marca_exaec", "regimen_importacion", "regimen_exportacion", "unidad", "columnas", "aviso"]
    salida_filas = []
    for f in filas:
        if "desc" in f:
            d = re.sub(r"\s+", " ", " ".join(f.pop("desc"))).strip()
            d = re.sub(r"\s+([,;:)])", r"\1", d)
            mn = re.match(r"^((?:-\s*)+)", d)
            f["nivel"] = mn.group(1).count("-") if mn else 0
            f["descripcion"] = d[mn.end():].strip() if mn else d
            f.update(normalizar_valores(f.pop("vals")))
        salida_filas.append({c: f.get(c, "") for c in campos})
    with open(salida, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=campos)
        w.writeheader()
        w.writerows(salida_filas)
    from collections import Counter
    print(pdf, dict(Counter(f["tipo"] for f in salida_filas)),
          "avisos:", sum(1 for f in salida_filas if f["aviso"]))
    # completitud de las listas: la columna N° debe ser correlativa 1..máximo por artículo
    for (tipo, art), nums in sorted(_numeros(salida_filas).items()):
        faltan = sorted(set(range(1, max(nums) + 1)) - set(nums))
        rep = [n for n, c in Counter(nums).items() if c > 1]
        print(f"  art. {art} {tipo}: {len(nums)} filas, N° máx {max(nums)}, faltan {len(faltan)} {faltan[:15]}, repetidos {rep[:10]}")


def _numeros(filas):
    d = {}
    for f in filas:
        if f["numero"]:
            d.setdefault((f["tipo"], f["articulo"]), []).append(int(f["numero"]))
    return d


if __name__ == "__main__":
    main(*sys.argv[1:6])
