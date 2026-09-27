#!/usr/bin/env python3
"""Aplica las reformas del Arancel (en orden cronológico) sobre la semilla base y genera la
semilla VIGENTE, con el registro de cada cambio.

Uso:
    python3 aplicar_reformas.py <dir_base> <reformas.json> <dir_extracciones> <dir_fuentes> <dir_salida>

  <dir_extracciones> contiene r<NNNN>.csv generados por extraer_reforma.py (NNNN = número del
  decreto sin punto, p. ej. r5103.csv).

Orden dentro de cada reforma: nomenclatura ("DONDE DICE" -> "DEBE DECIR") e incorporaciones
primero; después las listas de Ex.AEC y de régimen legal (pueden referirse a códigos nuevos).

Validaciones (se registran en reporte_reformas.json; las críticas abortan con código 1):
  * "DONDE DICE" debe coincidir con el estado vigente antes de la reforma (código y AEC).
  * Todo código de una lista de Ex.AEC o régimen debe existir y ser terminal.
  * Una incorporación no puede crear un código que ya existe.
"""
import csv
import hashlib
import json
import re
import sys
from collections import Counter, OrderedDict
from pathlib import Path

from arbol import asignar_jerarquia, digitos

CAMPOS_VALOR = ["aec", "marca_aec", "exaec", "marca_exaec", "regimen_importacion", "regimen_exportacion", "unidad"]


def leer(p):
    with open(p, encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def escribir(p, filas, campos):
    with open(p, "w", newline="", encoding="utf-8") as fh:
        w = csv.DictWriter(fh, fieldnames=campos, extrasaction="ignore")
        w.writeheader()
        w.writerows(filas)


def main(dir_base, cfg, dir_ext, dir_fuentes, dir_sal):
    dir_base, dir_ext, dir_fuentes, dir_sal = map(Path, (dir_base, dir_ext, dir_fuentes, dir_sal))
    dir_sal.mkdir(parents=True, exist_ok=True)
    config = json.loads(Path(cfg).read_text(encoding="utf-8"))

    base_gaceta = leer(dir_base / "version.csv")[0]["gaceta"]
    estado = OrderedDict()
    for n in leer(dir_base / "subpartida.csv"):
        estado[n["codigo"]] = n
    partidas = {p["codigo"]: p for p in leer(dir_base / "partida.csv")}
    obs = leer(dir_base / "observacion_fuente.csv")
    cambios, reporte, tocadas = [], {"reformas": []}, set()
    versiones = leer(dir_base / "version.csv")
    criticos = 0

    def registrar(version, articulo, tipo, codigo, campo, antes, despues):
        cambios.append({"version": version, "articulo": articulo, "tipo": tipo, "codigo": codigo,
                        "campo": campo, "antes": antes, "despues": despues})

    for rf in config["reformas"]:
        num = re.search(r"(\d)\.(\d{3})", rf["instrumento"]).group(0).replace(".", "")
        gaceta = rf["gaceta"]
        pdf = dir_fuentes / rf["archivo"]
        versiones.append({"instrumento": rf["instrumento"], "gaceta": gaceta, "fecha_publicacion": rf["fecha_publicacion"],
                          "fuente_archivo": rf["archivo"], "fuente_sha256": hashlib.sha256(pdf.read_bytes()).hexdigest(),
                          "descripcion": rf.get("observacion", "Reforma parcial del Decreto N° 4.944")})
        filas = leer(dir_ext / f"r{num}.csv")
        dice_criticos = 0
        # duplicados exactos (bloques repetidos en la copia del PDF)
        vistos, unicas, dups = set(), [], 0
        for f in filas:
            clave = tuple((k, v) for k, v in f.items() if k != "pagina")
            if clave in vistos:
                dups += 1
                continue
            vistos.add(clave)
            unicas.append(f)
        rep = {"instrumento": rf["instrumento"], "gaceta": gaceta, "filas": len(unicas), "duplicados_descartados": dups,
               "dice_no_coincide": [], "dice_inexistente": [], "dice_fuera_de_lugar": [], "lista_inexistente": [], "lista_no_terminal": [],
               "incorpora_existente": [], "aplicados": Counter()}

        # ---------------- nomenclatura e incorporaciones
        for art in sorted({f["articulo"] for f in unicas if f["tipo"] in ("dice", "debe", "incorpora")}, key=int):
            dice = [f for f in unicas if f["articulo"] == art and f["tipo"] == "dice"]
            debe = [f for f in unicas if f["articulo"] == art and f["tipo"] in ("debe", "incorpora")]
            # una fila del DONDE DICE cuyo código no pertenece a la partida de sus vecinas reproduce un
            # "código fuera de lugar" de la Gaceta base (que nunca se cargó): no se toca el código real
            fuera = set()
            for k, f in enumerate(dice):
                if k == 0 or k == len(dice) - 1:
                    continue
                antes_p, despues_p = digitos(dice[k - 1]["codigo"])[:4], digitos(dice[k + 1]["codigo"])[:4]
                vec = [antes_p]
                if antes_p == despues_p != digitos(f["codigo"])[:4]:
                    fuera.add(k)
                    rep["dice_fuera_de_lugar"].append(f"{f['codigo']} (en bloque {vec[0]})")
                    for o in obs:
                        if o["codigo"] == digitos(f["codigo"]) and o["tipo"] == "codigo_fuera_de_lugar_en_fuente":
                            o["detalle"] += f" | RESUELTO: {rf['instrumento']} art. {art} lo cita en DONDE DICE y lo omite en DEBE DECIR"
            dice = [f for k, f in enumerate(dice) if k not in fuera]
            for f in dice:
                if re.fullmatch(r"\d{2}\.\d{2}", f["codigo"]):
                    continue  # encabezado de partida
                c = digitos(f["codigo"])
                if c not in estado:
                    rep["dice_inexistente"].append(f["codigo"])
                    continue
                if f["aec"] and estado[c]["aec"] and float(f["aec"]) != float(estado[c]["aec"]):
                    rep["dice_no_coincide"].append(f"{f['codigo']}: dice AEC {f['aec']}, vigente {estado[c]['aec']}")
            eliminados = {digitos(f["codigo"]) for f in dice if not re.fullmatch(r"\d{2}\.\d{2}", f["codigo"])}
            for c in sorted(eliminados):  # orden determinista
                if c in estado:
                    tocadas.add(c[:4])
                    if c not in {digitos(f["codigo"]) for f in debe}:
                        registrar(gaceta, art, "elimina", c, "", estado[c]["descripcion"], "")
                        del estado[c]
            for f in debe:
                if re.fullmatch(r"\d{2}\.\d{2}", f["codigo"]):
                    p = f["codigo"].replace(".", "")
                    antes = partidas.get(p, {}).get("descripcion", "")
                    partidas[p] = {"codigo": p, "capitulo": p[:2], "descripcion": f["descripcion"], "origen_descripcion": "encabezado"}
                    registrar(gaceta, art, "partida", p, "descripcion", antes, f["descripcion"])
                    continue
                c = digitos(f["codigo"])
                if f["tipo"] == "incorpora" and c in estado:
                    rep["incorpora_existente"].append(f["codigo"])
                    criticos += 1
                    continue
                nuevo = {"codigo": c, "codigo_formateado": f["codigo"], "nivel": f["nivel"] or "0",
                         "descripcion": f["descripcion"], "pagina": "", "version": gaceta,
                         **{k: f[k] for k in CAMPOS_VALOR}}
                if c in estado:
                    # si el texto solo difiere en espacios (cortes de línea), se conserva el vigente
                    if re.sub(r"\s", "", estado[c]["descripcion"]) == re.sub(r"\s", "", nuevo["descripcion"]):
                        nuevo["descripcion"] = estado[c]["descripcion"]
                    for k in ["descripcion"] + CAMPOS_VALOR:
                        if (estado[c].get(k) or "") != (nuevo.get(k) or ""):
                            registrar(gaceta, art, "modifica", c, k, estado[c].get(k, ""), nuevo.get(k, ""))
                    nuevo["orden"] = estado[c]["orden"]
                else:
                    registrar(gaceta, art, "crea", c, "", "", f["descripcion"])
                    nuevo["orden"] = ""
                estado[c] = nuevo
                tocadas.add(c[:4])
                rep["aplicados"]["nomenclatura" if f["tipo"] == "debe" else "incorpora"] += 1
                if c[:4] not in partidas:
                    partidas[c[:4]] = {"codigo": c[:4], "capitulo": c[:2], "descripcion": f["descripcion"],
                                       "origen_descripcion": "linea_unica"}

        # ---------------- listas de Ex.AEC y régimen legal
        for f in unicas:
            if f["tipo"] not in ("exaec", "regimen"):
                continue
            c = digitos(f["codigo"])
            if c not in estado:
                rep["lista_inexistente"].append(f"{f['tipo']} art. {f['articulo']}: {f['codigo']}")
                criticos += 1
                continue
            campos = (["exaec", "marca_exaec"] if f["tipo"] == "exaec"
                      else ["regimen_importacion"] + (["regimen_exportacion"] if f["columnas"] == "5,6" else []))
            for k in campos:
                if (estado[c].get(k) or "") != (f.get(k) or ""):
                    registrar(gaceta, f["articulo"], f["tipo"], c, k, estado[c].get(k, ""), f.get(k, ""))
                    estado[c][k] = f.get(k, "")
                    estado[c]["version"] = gaceta
            rep["aplicados"][f["tipo"]] += 1
        rep["aplicados"] = dict(rep["aplicados"])
        reporte["reformas"].append(rep)

    # ---------------- orden final y jerarquía
    por_partida = OrderedDict()
    for n in sorted(estado.values(), key=lambda n: (n["codigo"][:4], int(n["orden"]) if n["orden"] else 10**9)):
        por_partida.setdefault(n["codigo"][:4], []).append(n)
    nodos = []
    for p in sorted(por_partida):
        grupo = por_partida[p]
        if p in tocadas:
            grupo = sorted(grupo, key=lambda n: n["codigo"])
        nodos.extend(grupo)
    for k, n in enumerate(nodos, start=1):
        n["orden"] = k
    obs_arbol = asignar_jerarquia(nodos)
    estado_version = {n["codigo"]: n["version"] for n in nodos}
    obs.extend(dict(o, version=estado_version.get(o["codigo"], "")) for o in obs_arbol
               if o["codigo"][:4] in tocadas)
    for n in nodos:
        if n["es_terminal"] == "true" and (not n["aec"] or not n["unidad"]):
            tipo = "terminal_sin_aec" if not n["aec"] else "terminal_sin_unidad"
            if not any(o["codigo"] == n["codigo"] and o["tipo"].startswith(tipo) for o in obs):
                obs.append({"codigo": n["codigo"], "tipo": f"{tipo}_tras_reformas", "detalle": "", "valor_fuente": "",
                            "version": n["version"]})
    # partidas sin nodos (eliminadas por completo)
    partidas = {p: v for p, v in partidas.items() if p in por_partida}

    # ---------------- art. 21 (textos de los regímenes legales): el de la reforma más reciente que lo modifique
    regimenes = {r["codigo"]: r["descripcion"] for r in leer(dir_base / "regimen_legal.csv")}
    for rf in config["reformas"]:
        for cod, texto in rf.get("articulo_21", {}).get("regimenes", {}).items():
            if regimenes.get(cod) != texto:
                registrar(rf["gaceta"], "art. 21", "regimen_legal", cod, "descripcion", regimenes.get(cod, ""), texto)
                regimenes[cod] = texto
    escribir(dir_sal / "regimen_legal.csv", [{"codigo": k, "descripcion": v} for k, v in sorted(regimenes.items(), key=lambda x: int(x[0]))],
             ["codigo", "descripcion"])

    # ---------------- validación de formato de cada campo (defensa ante errores de extracción)
    unidades = {u["sigla"] for u in leer(dir_base / "unidad_fisica.csv")}
    formato = {"aec": r"(\d{1,2}(\.\d{1,2})?)?", "exaec": r"(\d{1,2}(\.\d{1,2})?)?", "marca_aec": r"(BK|BIT)?",
               "marca_exaec": r"(A|E|E,A|±DV|±DV,E|±DV,A)?", "regimen_importacion": r"(\d{1,2}(,\d{1,2})*)?",
               "regimen_exportacion": r"(\d{1,2}(,\d{1,2})*)?", "nivel": r"\d"}
    malos = []
    for n in nodos:
        for campo, rx in formato.items():
            if not re.fullmatch(rx, str(n.get(campo) or "")):
                malos.append(f"{n['codigo']}.{campo}={n.get(campo)!r} ({n['version']})")
        for campo in ("regimen_importacion", "regimen_exportacion"):
            if n.get(campo) and re.fullmatch(formato[campo], n[campo]) \
                    and any(not 1 <= int(x) <= 21 for x in n[campo].split(",")):
                malos.append(f"{n['codigo']}.{campo}={n[campo]!r} fuera de 1..21 ({n['version']})")
        if n.get("unidad") and n["unidad"] not in unidades:
            malos.append(f"{n['codigo']}.unidad={n['unidad']!r} ({n['version']})")
    reporte["formato_invalido"] = malos
    if malos:
        print("Campos con formato inválido:", *malos[:20], sep="\n  ", file=sys.stderr)
        criticos += len(malos)

    # ---------------- salida
    for f in ("seccion.csv", "capitulo.csv", "unidad_fisica.csv",
              "regla_interpretacion.csv", "abreviatura.csv", "conversion_unidad.csv"):
        (dir_sal / f).write_text((dir_base / f).read_text(encoding="utf-8"), encoding="utf-8")
    escribir(dir_sal / "partida.csv", sorted(partidas.values(), key=lambda p: p["codigo"]),
             ["codigo", "capitulo", "descripcion", "origen_descripcion"])
    escribir(dir_sal / "subpartida.csv", nodos,
             ["codigo", "codigo_formateado", "partida", "nivel", "padre", "orden", "descripcion", "es_terminal",
              "aec", "marca_aec", "exaec", "marca_exaec", "regimen_importacion", "regimen_exportacion", "unidad",
              "pagina", "version"])
    escribir(dir_sal / "observacion_fuente.csv", obs, ["codigo", "tipo", "detalle", "valor_fuente", "version"])
    escribir(dir_sal / "cambio.csv", cambios, ["version", "articulo", "tipo", "codigo", "campo", "antes", "despues"])
    escribir(dir_sal / "version.csv", versiones,
             ["instrumento", "gaceta", "fecha_publicacion", "fuente_archivo", "fuente_sha256", "descripcion"])
    terminales = [n for n in nodos if n["es_terminal"] == "true"]
    manifiesto = {"descripcion": "Arancel de Aduanas vigente: Decreto N° 4.944 con sus reformas",
                  "versiones": [v["instrumento"] + " (" + v["gaceta"] + ")" for v in versiones],
                  "pendientes": config.get("pendientes", []),
                  "conteos": {"secciones": 22, "capitulos": 98, "partidas": len(partidas), "subpartidas": len(nodos),
                              "terminales": len(terminales), "terminales_con_aec": sum(1 for n in terminales if n["aec"]),
                              "cambios": len(cambios), "observaciones_fuente": len(obs)}}
    (dir_sal / "manifiesto.json").write_text(json.dumps(manifiesto, ensure_ascii=False, indent=2), encoding="utf-8")
    (dir_sal / "reporte_reformas.json").write_text(json.dumps(reporte, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifiesto["conteos"], ensure_ascii=False))
    for r in reporte["reformas"]:
        print(f"{r['instrumento']}: aplicados {r['aplicados']}, duplicados {r['duplicados_descartados']}, "
              f"DICE≠vigente {len(r['dice_no_coincide'])}, DICE inexistente {len(r['dice_inexistente'])}, "
              f"lista inexistente {len(r['lista_inexistente'])}, incorpora existente {len(r['incorpora_existente'])}")
    if criticos:
        print(f"ERROR: {criticos} inconsistencias críticas; ver reporte_reformas.json", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main(*sys.argv[1:6])
