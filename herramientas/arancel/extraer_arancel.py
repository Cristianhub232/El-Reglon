#!/usr/bin/env python3
"""Extrae la tabla del artículo 37 del Arancel de Aduanas (Decreto N° 4.944, GO Ext. 6.804)
a CSV, usando las coordenadas de cada palabra del PDF oficial.

Uso:
    python3 extraer_arancel.py <pdf> <dir_salida>

Requiere `pdftotext` (poppler-utils). Solo usa la biblioteca estándar de Python.

Columnas del artículo 37 (arts. 6 y 19 del Decreto):
    (1) código  (2) designación  (3) AEC [+BK/BIT]  (4) Ex.AEC [+E/A]
    (5) régimen legal importación  (6) régimen legal exportación  (7) unidad física

Método (dos pasadas por página):
  1. Filas: una fila empieza en una línea cuyo primer token es un código en la columna (1)
     seguido de la descripción en la columna (2); las líneas siguientes en la columna (2)
     la continúan. Cada fila guarda su franja vertical.
  2. Valores: cada palabra de las columnas (3)..(7) se asigna a la fila elegible cuya franja
     vertical la contiene o está más cerca (la Gaceta centra verticalmente los valores en
     celdas de varias líneas). Las agrupaciones (descripción terminada en ":") no reciben valores.

Salida (dir_salida): nodo.csv, partida.csv, capitulo.csv, extraccion.log
"""
import csv
import html
import re
import subprocess
import sys
from pathlib import Path

RE_WORD = re.compile(
    r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">(.*?)</word>')
RE_COD_PARTIDA = re.compile(r"^\d{2}\.\d{2}$")
RE_COD_SUB = re.compile(r"^\d{4}(\.\d{1,2}){0,3}$")
RE_AEC = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)(BK|BIT)?$")
RE_EXAEC = re.compile(r"^(\d{1,2}(?:[.,]\d{1,2})?)?(E|A)?$")
RE_REGIMEN = re.compile(r"^\d{1,2}(,\d{1,2})*$")
MARCADORES = ["(1)", "(2)", "(3)", "(4)", "(5)", "(6)", "(7)"]
FIN_TABLA = re.compile(r"^(CAPÍTULO|SECCIÓN|Nota|Notas|Subcapítulo|SUBCAPÍTULO)\b")
PUNTUACION = re.compile(r"^[,;.\-–:()]+$")
UNIDADES = {"Kg": "kg", "ℓ": "l", "ℓℓ": "l"}


def palabras_por_pagina(pdf):
    xml = subprocess.run(["pdftotext", "-bbox-layout", str(pdf), "-"],
                         capture_output=True, text=True, check=True).stdout
    for num, pag in enumerate(re.split(r"<page ", xml)[1:], start=1):
        yield num, [(float(a), float(b), float(c), float(d), html.unescape(t))
                    for a, b, c, d, t in RE_WORD.findall(pag)]


def agrupar_lineas(palabras, tol=2.0):
    lineas = []
    for w in sorted(palabras, key=lambda w: ((w[1] + w[3]) / 2, w[0])):
        yc = (w[1] + w[3]) / 2
        if lineas and abs(lineas[-1]["y"] - yc) <= tol:
            lineas[-1]["ws"].append(w)
        else:
            lineas.append({"y": yc, "ws": [w]})
    for ln in lineas:
        ln["ws"].sort(key=lambda w: w[0])
        ln["y0"] = min(w[1] for w in ln["ws"])
        ln["y1"] = max(w[3] for w in ln["ws"])
    return lineas


def columnas_de_pagina(lineas):
    for ln in lineas:
        textos = [w[4] for w in ln["ws"]]
        if all(m in textos for m in MARCADORES):
            return ln["y"], {int(w[4][1]): (w[0] + w[2]) / 2 for w in ln["ws"] if w[4] in MARCADORES}
    return None, None


def nueva_fila(tipo, codigo, pagina, ln):
    return {"tipo": tipo, "codigo": codigo, "pagina": pagina, "desc": [], "y0": ln["y0"], "y1": ln["y1"], "yc": ln["y"],
            "vals": {k: [] for k in range(3, 8)}}


def procesar_paginas(paginas, log):
    """paginas: iterable de (número, palabras). Devuelve (filas crudas, capítulos)."""
    filas, capitulos = [], {}
    ultima = None            # última fila abierta (puede continuar en la página siguiente)
    ultimos_centros = None   # columnas de la última página con encabezado completo

    for num, palabras in paginas:
        lineas = agrupar_lineas(palabras)
        # --- títulos de capítulo ("CAPÍTULO N" + líneas en mayúsculas)
        for i, ln in enumerate(lineas):
            t = " ".join(w[4] for w in ln["ws"]).strip()
            m = re.fullmatch(r"CAPÍTULO (\d{1,2})", t)
            if m and i + 1 < len(lineas):
                titulo, j = [], i + 1
                while j < len(lineas):
                    tj = " ".join(w[4] for w in lineas[j]["ws"])
                    if not re.fullmatch(r"[A-ZÁÉÍÓÚÑÜ0-9 ,;.()«»“”\"'\-*]+", tj) or tj.startswith(("Nota", "CAPÍTULO", "SECCIÓN")):
                        break
                    titulo.append(tj); j += 1
                cod = f"{int(m.group(1)):02d}"
                if titulo:
                    capitulos.setdefault(cod, {"codigo": cod, "titulo": " ".join(titulo), "pagina": num})

        y_enc, centros = columnas_de_pagina(lineas)
        if centros is None and ultimos_centros is not None:
            # página sin fila completa de marcadores: se reutilizan las columnas de la última
            # página de tabla, desplazadas según la posición del marcador "(1)" si aparece
            m1 = [(ln, w) for ln in lineas for w in ln["ws"]
                  if w[4] == "(1)" and all(re.fullmatch(r"\(\d\)", x[4]) for x in ln["ws"])]
            if m1:
                ln1, w1 = m1[0]
                dx = (w1[0] + w1[2]) / 2 - ultimos_centros[1]
                centros = {k: v + dx for k, v in ultimos_centros.items()}
                y_enc = ln1["y"]
                log.write(f"Pág {num}: encabezado incompleto, columnas inferidas (dx={dx:.1f})\n")
        if centros is None:
            ultima = None
            continue
        ultimos_centros = centros
        x_desc = centros[1] + 25
        x_col3 = centros[3] - (centros[4] - centros[3]) / 2
        filas_pag, valores = [], []
        en_tabla = False
        continua = ultima  # fila de la página anterior que puede seguir aquí
        for ln in lineas:
            if ln["y"] <= y_enc + 2:
                continue
            ws = ln["ws"]
            texto = " ".join(w[4] for w in ws)
            if re.search(r"GACETA OFICIAL|Extraordinario$", texto):
                continue
            primera = ws[0]
            es_codigo = (primera[0] < x_desc - 5
                         and (RE_COD_PARTIDA.match(primera[4]) or RE_COD_SUB.match(primera[4]))
                         and (len(ws) == 1 or (ws[1][0] >= x_desc - 12
                                              and re.match(r"^[-A-ZÁÉÍÓÚÑ(«“]", ws[1][4]))))
            if FIN_TABLA.match(primera[4]) and (primera[0] < x_desc - 5
                                                or primera[4] in ("CAPÍTULO", "SECCIÓN", "SUBCAPÍTULO")):
                en_tabla, continua = False, None
                continue
            if es_codigo:
                en_tabla, continua = True, None
                tipo = "partida" if RE_COD_PARTIDA.match(primera[4]) else "nodo"
                fila = nueva_fila(tipo, primera[4], num, ln)
                filas_pag.append(fila)
                resto = ws[1:]
            elif primera[0] < x_desc - 5:
                # texto en la columna del código que no es código: notas u otro texto
                en_tabla, continua = False, None
                continue
            elif en_tabla or continua is not None:
                resto = ws
                fila = filas_pag[-1] if filas_pag else continua
                if fila is None:
                    continue
                desc_ws = [w for w in resto if w[0] < x_col3]
                if desc_ws and desc_ws[0][4] == "-" and fila.get("desc") and fila["desc"][-1].endswith(":"):
                    # agrupación sin código (poco frecuente)
                    fila = nueva_fila("nodo", None, num, ln)
                    filas_pag.append(fila)
                elif desc_ws:
                    fila["y1"] = max(fila["y1"], ln["y1"]) if fila["pagina"] == num else fila["y1"]
            else:
                continue
            for w in resto:
                if re.fullmatch(r"\(\d\)", w[4]):
                    continue  # marcadores de columna repetidos
                if w[0] < x_col3 or PUNTUACION.match(w[4]):
                    fila["desc"].append(w[4])
                else:
                    valores.append((num, (w[1] + w[3]) / 2, (w[0] + w[2]) / 2, w[4]))

        # --- segunda pasada: asignar valores por franja vertical
        elegibles = [f for f in filas_pag if f["tipo"] == "nodo"
                     and not " ".join(f["desc"]).rstrip().endswith(":")]
        agrupaciones = [f for f in filas_pag if f["tipo"] == "nodo" and f not in elegibles]
        if ultima is not None and ultima["tipo"] == "nodo":
            elegibles.append({"_ref": ultima, "y0": y_enc, "y1": y_enc + 1, "yc": -1e9})  # continuación
        for _, yc, xc, txt in valores:
            # 1) el valor está en la misma línea que el código de una fila
            # (las agrupaciones solo reciben valores escritos en su misma línea: ocurre en la fuente)
            misma = [f for f in elegibles + agrupaciones if abs(yc - f["yc"]) <= 3]
            if misma:
                mejor, dist = misma[0], 0
            else:
                # 2) franja vertical que lo contiene (la más cercana a su centro), o la más próxima
                mejor, dist = None, 1e9
                for f in elegibles + agrupaciones:
                    dentro = f["y0"] - 2 <= yc <= f["y1"] + 2
                    d = abs(yc - (f["y0"] + f["y1"]) / 2) / 100 if dentro else min(abs(yc - f["y0"]), abs(yc - f["y1"]))
                    if f in agrupaciones and not dentro:
                        continue
                    if d < dist:
                        mejor, dist = f, d
            if mejor is None or dist > 14:
                log.write(f"Valor huérfano pág {num} y={yc:.0f}: {txt!r}\n")
                continue
            destino = mejor.get("_ref", mejor)
            col = min((abs(xc - centros[k]), k) for k in range(3, 8))[1]
            destino["vals"][col].append(txt)
        filas.extend(filas_pag)
        ultima = next((f for f in reversed(filas_pag) if f["tipo"] == "nodo"), None)
    return filas, capitulos


def normalizar_filas(filas, log):
    """Filas crudas -> (nodos, partidas) con columnas normalizadas.
    Los duplicados y códigos fuera de lugar se tratan en construir_semilla.py."""
    nodos, partidas = [], []
    for f in filas:
        d = re.sub(r"\s+", " ", " ".join(f["desc"])).strip()
        d = re.sub(r"\s+([,;:)])", r"\1", d)
        if f["tipo"] == "partida":
            partidas.append({"codigo": f["codigo"].replace(".", ""), "descripcion": d, "pagina": f["pagina"]})
            continue
        m = re.match(r"^((?:-\s*)+)", d)
        nivel = m.group(1).count("-") if m else 0
        texto = d[m.end():].strip() if m else d
        v = {k: "".join(f["vals"][k]) if k in (5, 6) else " ".join(f["vals"][k]) for k in range(3, 8)}
        aec = marca = exaec = marca_ex = ""
        if v[3]:
            ma = RE_AEC.match(v[3].replace(" ", ""))
            if ma:
                aec, marca = ma.group(1).replace(",", "."), ma.group(2) or ""
            else:
                log.write(f"AEC no reconocido pág {f['pagina']} {f['codigo']}: {v[3]!r}\n")
        if v[4]:
            t4 = v[4].replace("± DV", "±DV")
            partes = [p for p in re.split(r"[,\s]+", t4) if p]
            if "±DV" in partes:
                marca_ex = "±DV"; partes.remove("±DV")
            malos = [p for p in partes if not RE_EXAEC.match(p)]
            if malos:
                log.write(f"ExAEC no reconocido pág {f['pagina']} {f['codigo']}: {v[4]!r}\n")
            buenos = [RE_EXAEC.match(p) for p in partes if RE_EXAEC.match(p)]
            nums = [b.group(1) for b in buenos if b.group(1)]
            marcas = [b.group(2) for b in buenos if b.group(2)]
            exaec = nums[0].replace(",", ".") if nums else ""
            marca_ex = ",".join([x for x in [marca_ex] + list(dict.fromkeys(marcas)) if x])
        reg = {}
        for k, etiqueta in ((5, "importacion"), (6, "exportacion")):
            r = v[k]
            if r and not RE_REGIMEN.match(r):
                log.write(f"Régimen {etiqueta} no reconocido pág {f['pagina']} {f['codigo']}: {r!r}\n")
            elif r and any(int(x) > 21 for x in r.split(",")):
                log.write(f"Régimen {etiqueta} fuera de 1..21 pág {f['pagina']} {f['codigo']}: {r!r}\n")
            reg[etiqueta] = r
        unidad = UNIDADES.get(v[7].replace(" ", ""), v[7])
        nodos.append({"orden": len(nodos) + 1, "codigo": f["codigo"] or "", "nivel": nivel, "descripcion": texto,
                      "aec": aec, "marca_aec": marca, "exaec": exaec, "marca_exaec": marca_ex,
                      "regimen_importacion": reg["importacion"], "regimen_exportacion": reg["exportacion"],
                      "unidad": unidad, "pagina": f["pagina"]})

    return nodos, partidas


def main(pdf, salida):
    salida = Path(salida)
    salida.mkdir(parents=True, exist_ok=True)
    log = open(salida / "extraccion.log", "w", encoding="utf-8")
    filas, capitulos = procesar_paginas(palabras_por_pagina(pdf), log)
    nodos, partidas = normalizar_filas(filas, log)
    campos = list(nodos[0].keys())
    with open(salida / "nodo.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=campos); w.writeheader(); w.writerows(nodos)
    with open(salida / "partida.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["codigo", "descripcion", "pagina"]); w.writeheader(); w.writerows(partidas)
    with open(salida / "capitulo.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=["codigo", "titulo", "pagina"]); w.writeheader()
        w.writerows(sorted(capitulos.values(), key=lambda c: c["codigo"]))
    log.close()
    print(f"nodos={len(nodos)} partidas_con_encabezado={len(partidas)} capitulos={len(capitulos)}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
