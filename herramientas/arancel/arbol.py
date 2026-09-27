"""Jerarquía del árbol arancelario derivada del CÓDIGO (compartido por construir_semilla.py y
aplicar_reformas.py).

Padre de un nodo = nodo anterior de la misma partida cuyo código, sin ceros de relleno al final,
es el prefijo propio más largo del código del hijo. Ejemplos: "3914.00.00" -> "3914",
"5210.20" -> "52102", "0101.21.00" -> "010121". Un nodo es terminal si no tiene hijos.
Los guiones de la Gaceta (nivel) solo se usan como verificación cruzada.
"""


def digitos(codigo):
    return codigo.replace(".", "")


def efectivo(codigo):
    e = codigo.rstrip("0")
    return e if len(e) >= 4 else codigo[:4]


def asignar_jerarquia(nodos):
    """nodos: lista (en orden de la Gaceta) de dicts con 'codigo' (solo dígitos) y 'nivel'.
    Completa 'padre', 'partida' y 'es_terminal'. Devuelve observaciones de discrepancia."""
    obs, hijos = [], set()
    partida_actual, previos, pila = None, [], {}
    for n in nodos:
        cod = n["codigo"]
        p = cod[:4]
        if p != partida_actual:
            partida_actual, previos, pila = p, [], {}
        nivel = int(n["nivel"])
        candidatos = [c for c in previos if cod.startswith(efectivo(c)) and c != cod]
        padre = max(candidatos, key=lambda c: len(efectivo(c)), default=None)
        por_guiones = next((pila[k] for k in range(nivel - 1, -1, -1) if k in pila), None)
        if por_guiones != padre:
            obs.append({"codigo": cod, "tipo": "guiones_no_concuerdan_con_codigo",
                        "detalle": f"padre por guiones {por_guiones or '(partida)'}; "
                                   f"se usa padre por código {padre or '(partida)'}",
                        "valor_fuente": str(nivel)})
        pila[nivel] = cod
        for k in [k for k in pila if k > nivel]:
            del pila[k]
        previos.append(cod)
        if padre:
            hijos.add(padre)
        n["padre"], n["partida"] = padre or "", p
    for n in nodos:
        n["es_terminal"] = "false" if n["codigo"] in hijos else "true"
    return obs
