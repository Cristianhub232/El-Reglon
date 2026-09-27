#!/usr/bin/env python3
"""Construye la semilla del módulo Arancel (CSV listos para PostgreSQL) a partir de la
extracción de `extraer_arancel.py` y del texto del PDF oficial.

Uso:
    python3 construir_semilla.py <pdf_oficial> <dir_extraccion> <dir_semilla>

Genera en <dir_semilla>:
    seccion.csv  capitulo.csv  partida.csv  subpartida.csv  unidad_fisica.csv  regimen_legal.csv
    observacion_fuente.csv  manifiesto.json

Reglas:
  * La jerarquía Sección → Capítulo → Partida se deriva del CÓDIGO (primeros 2 y 4 dígitos),
    nunca del orden de inserción.
  * El padre de cada subpartida se deriva del CÓDIGO (prefijo más largo, sin ceros de relleno)
    dentro de su partida; los guiones de la Gaceta se usan como verificación cruzada.
  * Una subpartida es terminal (declarable) si no tiene hijos.
  * Los vacíos o incoherencias de la propia Gaceta NO se corrigen: se registran en
    observacion_fuente.csv para revisión humana.
"""
import csv
import hashlib
import json
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

from arbol import asignar_jerarquia, digitos

ROMANOS = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV",
           "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI", "XXII"]
# Rangos de capítulos por sección (Sistema Armonizado; el capítulo 98 es nacional, Sección XXII)
RANGOS = [(1, 5), (6, 14), (15, 15), (16, 24), (25, 27), (28, 38), (39, 40), (41, 43), (44, 46),
          (47, 49), (50, 63), (64, 67), (68, 70), (71, 71), (72, 83), (84, 85), (86, 89), (90, 92),
          (93, 93), (94, 96), (97, 97), (98, 98)]
# Tabla oficial "Unidades Físicas (U.F.) por subpartida" del Decreto N° 4.944
UNIDADES = [("kg", "Kilogramo", "Peso"), ("c/t", "Quilate", "Peso"), ("m", "Metro", "Longitud"),
            ("m²", "Metro cuadrado", "Área"), ("m³", "Metro cúbico", "Volumen"),
            ("cm³", "Centímetro cúbico", "Volumen"), ("l", "Litro", "Volumen"),
            ("1000 kWh", "Mil kilovatios hora", "Energía eléctrica"), ("u", "Unidades o artículos", "Cantidad"),
            ("2u", "Par", "Cantidad"), ("12u", "Docena", "Cantidad"),
            ("1000 u", "Miles de unidades o artículos", "Cantidad")]
# Art. 21 del Decreto N° 4.944 (texto original de 2024; la reforma 5.103 modifica los regímenes 9 y 11)
REGIMENES = {
    1: "Importación o Exportación Prohibida.",
    2: "Importación o Exportación Reservada al Ejecutivo Nacional.",
    3: "Permiso del Ministerio del Poder Popular con competencia en materia de salud.",
    4: "Permiso del Ministerio del Poder Popular con competencia en materia de industrias y producción nacional.",
    5: "Certificado Sanitario del País de Origen.",
    6: "Permiso Sanitario del Ministerio del Poder Popular con competencia en materia de agricultura productiva y tierras.",
    7: "Permiso del Ministerio del Poder Popular con competencia en materia de defensa.",
    8: "Licencia de Importación administrada por el Ministerio del Poder Popular con competencia en materia de alimentación.",
    9: "Licencia de Importación administrada por el Ministerio del Poder Popular con competencia en materia de comercio exterior.",
    10: "Permiso del Ministerio del Poder Popular con competencia en materia de ecosocialismo.",
    11: "Permiso del Ministerio del Poder Popular con competencia en materia de petróleo.",
    12: "Registro Sanitario expedido por el Ministerio del Poder Popular con competencia en materia de salud.",
    13: "Registro Sanitario expedido por el Ministerio del Poder Popular con competencia en materia de agricultura productiva y tierras.",
    14: "Permiso del Ministerio del Poder Popular con competencia en materia de alimentación.",
    15: "Permiso del Ministerio del Poder Popular con competencia en materia de ciencia, tecnología e innovación.",
    16: "Licencia de Importación administrada por el Ministerio del Poder Popular con competencia en materia de industrias y producción nacional.",
    17: "Permiso del Ministerio del Poder Popular con competencia en materia de energía eléctrica.",
    18: "Permiso del Ministerio del Poder Popular con competencia en materia de pesca y acuicultura.",
    19: "Certificado del Proceso Kimberley.",
    20: "Constancia de Registro de Norma Venezolana COVENIN o Registro de Reglamento Técnico administrado por el Servicio Desconcentrado de Normalización, Calidad, Metrología y Reglamentos Técnicos (SENCAMER).",
    21: "Permiso del Registro Nacional Único de Operadores de Sustancias Químicas Controladas.",
}
RE_REGIMEN = re.compile(r"^\d{1,2}(,\d{1,2})*$")




def titulos_de_seccion(pdf):
    raw = subprocess.run(["pdftotext", "-raw", str(pdf), "-"], capture_output=True, text=True, check=True).stdout
    lineas = raw.splitlines()
    titulos = {}
    for i, ln in enumerate(lineas):
        m = re.fullmatch(r"SECCIÓN ([IVXL]+)", ln.strip())
        if not m or i < 1000:      # las primeras apariciones son el índice del Decreto
            continue
        partes, j = [], i + 1
        while j < len(lineas) and re.fullmatch(r"[A-ZÁÉÍÓÚÑÜ0-9 ,;.()«»“”\"'\-*]+", lineas[j].strip()) \
                and not lineas[j].startswith(("CAPÍTULO", "Nota")):
            partes.append(lineas[j].strip()); j += 1
        if partes:
            titulos.setdefault(m.group(1), " ".join(partes))
    return titulos


def main(pdf, dir_ext, dir_sem):
    dir_ext, dir_sem = Path(dir_ext), Path(dir_sem)
    dir_sem.mkdir(parents=True, exist_ok=True)
    nodos = list(csv.DictReader(open(dir_ext / "nodo.csv", encoding="utf-8")))
    encabezados = {p["codigo"]: p for p in csv.DictReader(open(dir_ext / "partida.csv", encoding="utf-8"))}
    caps_pdf = {c["codigo"]: c for c in csv.DictReader(open(dir_ext / "capitulo.csv", encoding="utf-8"))}
    obs = []

    # --- secciones y capítulos
    tit_sec = titulos_de_seccion(pdf)
    secciones = []
    cap_a_sec = {}
    for n, (rom, (a, b)) in enumerate(zip(ROMANOS, RANGOS), start=1):
        secciones.append({"numero": n, "romano": rom, "titulo": tit_sec.get(rom, ""),
                          "capitulo_desde": f"{a:02d}", "capitulo_hasta": f"{b:02d}"})
        for c in range(a, b + 1):
            cap_a_sec[f"{c:02d}"] = n
    capitulos = [{"codigo": c, "seccion": cap_a_sec[c], "titulo": caps_pdf.get(c, {}).get("titulo", ""),
                  "reservado": "true" if "RESERVADO" in caps_pdf.get(c, {}).get("titulo", "") else "false"}
                 for c in sorted(cap_a_sec)]

    # --- códigos fuera de lugar: una fila cuyo código no pertenece a la partida del bloque en el que
    # aparece (p. ej. "8701.29.00.00" impreso dentro del bloque 98.01). No se corrige: se descarta y
    # se registra con los datos de la fila para revisión humana.
    limpios = []
    for i, n in enumerate(nodos):
        c = digitos(n["codigo"])
        vecinos = [digitos(x["codigo"])[:4] for x in nodos[max(0, i - 2):i] + nodos[i + 1:i + 3]]
        if vecinos and all(v != c[:4] for v in vecinos) and len(set(vecinos)) == 1 \
                and any(digitos(x["codigo"]) == c for j, x in enumerate(nodos) if j != i):
            bloque = vecinos[0]
            obs.append({"codigo": c, "tipo": "codigo_fuera_de_lugar_en_fuente",
                        "detalle": f"pág {n['pagina']}, dentro del bloque de la partida {bloque}: "
                                   f"'{n['descripcion']}' AEC {n['aec']} {n['unidad']}. Revisar el código correcto",
                        "valor_fuente": n["codigo"]})
            continue
        limpios.append(n)
    nodos = limpios

    # --- duplicados en la fuente: se conserva la fila más completa
    por_codigo = {}
    for n in nodos:
        c = digitos(n["codigo"])
        previo = por_codigo.get(c)
        completo = sum(bool(n[k]) for k in ("aec", "unidad", "regimen_importacion"))
        if previo is None or completo > previo[0]:
            if previo is not None:
                obs.append({"codigo": c, "tipo": "fila_duplicada_en_fuente",
                            "detalle": f"se conserva la aparición de la pág {n['pagina']}", "valor_fuente": ""})
            por_codigo[c] = (completo, n)
        else:
            obs.append({"codigo": c, "tipo": "fila_duplicada_en_fuente",
                        "detalle": f"se descarta la aparición de la pág {n['pagina']}", "valor_fuente": ""})
    nodos = sorted((v[1] for v in por_codigo.values()), key=lambda n: int(n["orden"]))

    # --- partidas (derivadas del código)
    partidas = {}
    for n in nodos:
        p = digitos(n["codigo"])[:4]
        if p not in partidas:
            if p in encabezados:
                partidas[p] = {"codigo": p, "capitulo": p[:2], "descripcion": encabezados[p]["descripcion"],
                               "origen_descripcion": "encabezado"}
            else:
                partidas[p] = {"codigo": p, "capitulo": p[:2], "descripcion": n["descripcion"],
                               "origen_descripcion": "linea_unica"}
    for p in encabezados:
        if p not in partidas:
            obs.append({"codigo": p, "tipo": "partida_sin_subpartidas", "detalle": "encabezado sin líneas", "valor_fuente": ""})

    # --- subpartidas: jerarquía derivada del código (ver arbol.py)
    subs = [{"codigo": digitos(n["codigo"]), "codigo_formateado": n["codigo"], "nivel": int(n["nivel"]),
             "orden": k + 1, "descripcion": n["descripcion"], "aec": n["aec"], "marca_aec": n["marca_aec"],
             "exaec": n["exaec"], "marca_exaec": n["marca_exaec"], "regimen_importacion": n["regimen_importacion"],
             "regimen_exportacion": n["regimen_exportacion"], "unidad": n["unidad"], "pagina": n["pagina"]}
            for k, n in enumerate(nodos)]
    obs.extend(asignar_jerarquia(subs))
    unidades_validas = {u[0] for u in UNIDADES}
    for s in subs:
        for campo in ("regimen_importacion", "regimen_exportacion"):
            v = s[campo]
            if v.endswith(",") and RE_REGIMEN.match(v.rstrip(",")):
                obs.append({"codigo": s["codigo"], "tipo": "regimen_coma_final", "detalle": f"{campo}: se elimina la coma final", "valor_fuente": v})
                s[campo] = v = v.rstrip(",")
            if v and (not RE_REGIMEN.match(v) or any(int(x) > 21 for x in v.split(","))):
                obs.append({"codigo": s["codigo"], "tipo": "regimen_ilegible_en_fuente", "detalle": f"{campo}: se deja vacío", "valor_fuente": v})
                s[campo] = ""
        if s["es_terminal"] == "true":
            if not s["aec"]:
                obs.append({"codigo": s["codigo"], "tipo": "terminal_sin_aec_en_fuente", "detalle": "", "valor_fuente": ""})
            if not s["unidad"]:
                obs.append({"codigo": s["codigo"], "tipo": "terminal_sin_unidad_en_fuente", "detalle": "", "valor_fuente": ""})
        elif s["aec"] or s["unidad"]:
            obs.append({"codigo": s["codigo"], "tipo": "agrupacion_con_valores_en_fuente",
                        "detalle": "valores en una línea de agrupación", "valor_fuente": f"{s['aec']} {s['unidad']}".strip()})
        if s["unidad"] and s["unidad"] not in unidades_validas:
            obs.append({"codigo": s["codigo"], "tipo": "unidad_desconocida", "detalle": "", "valor_fuente": s["unidad"]})

    def escribir(nombre, filas, campos):
        with open(dir_sem / nombre, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=campos); w.writeheader(); w.writerows(filas)

    escribir("seccion.csv", secciones, ["numero", "romano", "titulo", "capitulo_desde", "capitulo_hasta"])
    escribir("capitulo.csv", capitulos, ["codigo", "seccion", "titulo", "reservado"])
    escribir("partida.csv", sorted(partidas.values(), key=lambda p: p["codigo"]),
             ["codigo", "capitulo", "descripcion", "origen_descripcion"])
    GACETA = "GO Ext. N° 6.804"
    for x in subs:
        x["version"] = GACETA
    for o in obs:
        o["version"] = GACETA
    escribir("subpartida.csv", subs, ["codigo", "codigo_formateado", "partida", "nivel", "padre", "orden",
                                      "descripcion", "es_terminal", "aec", "marca_aec", "exaec", "marca_exaec",
                                      "regimen_importacion", "regimen_exportacion", "unidad", "pagina", "version"])
    escribir("version.csv", [{"instrumento": "Decreto N° 4.944", "gaceta": GACETA, "fecha_publicacion": "2024-04-25",
                              "fuente_archivo": Path(pdf).name,
                              "fuente_sha256": hashlib.sha256(Path(pdf).read_bytes()).hexdigest(),
                              "descripcion": "Arancel de Aduanas (texto original)"}],
             ["instrumento", "gaceta", "fecha_publicacion", "fuente_archivo", "fuente_sha256", "descripcion"])
    escribir("cambio.csv", [], ["version", "articulo", "tipo", "codigo", "campo", "antes", "despues"])
    prelim = Path(__file__).resolve().parents[2] / "datos" / "arancel" / "preliminares"
    for f in ("regla_interpretacion.csv", "abreviatura.csv", "conversion_unidad.csv"):
        (dir_sem / f).write_text((prelim / f).read_text(encoding="utf-8"), encoding="utf-8")
    escribir("unidad_fisica.csv", [{"sigla": a, "nombre": b, "magnitud": c} for a, b, c in UNIDADES],
             ["sigla", "nombre", "magnitud"])
    escribir("regimen_legal.csv", [{"codigo": k, "descripcion": v} for k, v in REGIMENES.items()], ["codigo", "descripcion"])
    escribir("observacion_fuente.csv", obs, ["codigo", "tipo", "detalle", "valor_fuente", "version"])

    terminales = [s for s in subs if s["es_terminal"] == "true"]
    manifiesto = {
        "instrumento": "Decreto N° 4.944 (Arancel de Aduanas)",
        "gaceta": "GO Ext. N° 6.804 del 25/04/2024",
        "fuente_pdf": Path(pdf).name,
        "fuente_sha256": hashlib.sha256(Path(pdf).read_bytes()).hexdigest(),
        "generado": date.today().isoformat(),
        "conteos": {"secciones": len(secciones), "capitulos": len(capitulos), "partidas": len(partidas),
                    "subpartidas": len(subs), "terminales": len(terminales),
                    "terminales_con_aec": sum(1 for s in terminales if s["aec"]),
                    "observaciones_fuente": len(obs)},
    }
    (dir_sem / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifiesto["conteos"], ensure_ascii=False))
    faltan_titulo = [s["romano"] for s in secciones if not s["titulo"]] + [c["codigo"] for c in capitulos if not c["titulo"]]
    if faltan_titulo:
        print("ADVERTENCIA: sin título:", faltan_titulo)


if __name__ == "__main__":
    main(*sys.argv[1:4])
