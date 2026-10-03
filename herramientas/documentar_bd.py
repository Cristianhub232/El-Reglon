#!/usr/bin/env python3
"""Genera DATABASE.md a partir de la base en servicio y de los comentarios de db/**/*.sql.

Uso:  python3 herramientas/documentar_bd.py            (escribe DATABASE.md en la raíz del repositorio)
Requiere el contenedor "db" de docker compose en marcha. Solo lee el catálogo y cuenta filas: no muestra datos.
Las descripciones salen de los comentarios SQL: el bloque «-- …» encima de cada CREATE TABLE/FUNCTION y el «-- …»
al final de la línea de cada columna. Para mejorar el documento, se mejoran esos comentarios.
"""
import json, os, re, subprocess, sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
os.chdir(RAIZ)

# Propósito de cada esquema, quién lo escribe y su documentación
ESQUEMAS = {
    "core": ("Núcleo: API keys, usuarios del panel, sesiones, solicitudes de API key, uso diario y auditoría", "La app (panel y API)", "15, 18"),
    "iva": ("Clasificador de IVA: catálogo legal de reglas, alícuotas, base legal, decretos, consultas y productos no encontrados", "Cargador `scripts/iva-cargar-catalogo.ts` y la app", "16"),
    "arancel": ("Arancel de Aduanas (Decreto 4.944 y reformas 2025): secciones, capítulos, partidas, subpartidas, régimen legal y detección por nombre comercial", "Cargadores `herramientas/arancel` y `scripts/arancel-cargar-sinonimos.ts`", "09, 17"),
    "bcv": ("Tasas oficiales del BCV: publicaciones, tasas por moneda, observaciones y fuentes", "Cargador histórico y `bcv-programador` (8, 14 y 20 h)", "11, 15"),
    "calendario": ("Calendario tributario: obligaciones, vencimientos por terminal de RIF, condiciones y días inhábiles", "Cargador `herramientas/calendario`", "13"),
    "rif": ("Validación del RIF con dígito verificador (solo funciones)", "Cargador `herramientas/calendario`", "13"),
    "noticias": ("Noticiero: fuentes, titulares y lecturas", "`noticias-programador` (cada hora)", "20"),
    "comparador": ("Comparador de precios: tiendas, sucursales, productos, precios observados, búsquedas e índice por sitemaps", "Contenedor `comparador` (PM2, un proceso por tienda)", "22"),
    "analitica": ("Analítica del sitio público: visitantes (cookie propia), visitas y RIF consultados; 12 meses", "La app; purga en `noticias-programador`", "23"),
    "avisos": ("Avisos push: suscripciones, RIF seguidos y envíos", "La app y los programadores", "24"),
    "directorio": ("Directorio de contribuyentes: empresas con contacto, importadores, sistemas de facturación y mayores pagadores (datos personales; semilla fuera del repositorio)", "Cargador `herramientas/directorio`", "25"),
    "prospeccion": ("Prospección comercial por correo: prospectos, bajas permanentes, envíos y ajustes", "Panel y `noticias-programador` (cada 5 min)", "26"),
    "contacto": ("Mensajes del botón flotante de contacto y cursor de lectura de los buzones", "La app y `noticias-programador`", "27"),
}
# Tablas con datos personales (correos, IP, RIF de personas, contraseñas en hash…)
PERSONALES = {"core.usuario", "core.sesion", "core.api_key", "core.solicitud_api_key", "core.auditoria", "analitica.visita", "analitica.visitante",
              "analitica.rif_consultado", "avisos.suscripcion", "avisos.suscripcion_rif", "avisos.envio_deber", "directorio.contribuyente",
              "directorio.direccion", "directorio.pagador", "directorio.pago_region", "directorio.importador", "directorio.software",
              "prospeccion.prospecto", "prospeccion.baja", "prospeccion.envio", "contacto.mensaje", "iva.consulta_registro"}


def psql(sql: str) -> str:
    env = {**os.environ}
    try:
        for l in open(".env"):
            m = re.match(r"^([A-Z_]+)=(.*)$", l.strip())
            if m and m.group(1) in ("POSTGRES_USER", "POSTGRES_DB"): env[m.group(1)] = m.group(2).strip("'\"")
    except FileNotFoundError:
        pass
    r = subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-U", env.get("POSTGRES_USER", "elrenglon"), "-d", env.get("POSTGRES_DB", "elrenglon"),
                        "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], capture_output=True, text=True)
    if r.returncode:
        sys.exit(f"Error de psql: {r.stderr.strip()}")
    return r.stdout.strip()


ESQ = "(" + ",".join(f"'{e}'" for e in ESQUEMAS) + ")"
meta = json.loads(psql(f"""
SELECT json_build_object(
 'tablas', (SELECT json_agg(json_build_object('esquema', n.nspname, 'nombre', c.relname, 'tipo', c.relkind, 'oid', c.oid,
            'bytes', pg_total_relation_size(c.oid),
            'metabase', CASE WHEN NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN null
                             WHEN has_table_privilege('metabase_lectura', c.oid, 'SELECT') THEN 'sí'
                             WHEN has_any_column_privilege('metabase_lectura', c.oid, 'SELECT') THEN 'algunas columnas' ELSE 'no' END)
            ORDER BY n.nspname, c.relname)
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN {ESQ} AND c.relkind IN ('r', 'p', 'v', 'm')),
 'columnas', (SELECT json_agg(json_build_object('oid', a.attrelid, 'n', a.attnum, 'nombre', a.attname, 'tipo', format_type(a.atttypid, a.atttypmod),
            'nulo', NOT a.attnotnull, 'defecto', pg_get_expr(d.adbin, d.adrelid), 'generada', a.attgenerated <> '',
            'mb', CASE WHEN EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN has_column_privilege('metabase_lectura', a.attrelid, a.attnum, 'SELECT') END)
            ORDER BY a.attrelid, a.attnum)
     FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE n.nspname IN {ESQ} AND c.relkind IN ('r', 'p', 'v', 'm') AND a.attnum > 0 AND NOT a.attisdropped),
 'restricciones', (SELECT json_agg(json_build_object('oid', r.conrelid, 'nombre', r.conname, 'tipo', r.contype, 'def', pg_get_constraintdef(r.oid),
            'ref', CASE WHEN r.contype = 'f' THEN r.confrelid::regclass::text END) ORDER BY r.conrelid, r.contype, r.conname)
     FROM pg_constraint r JOIN pg_class c ON c.oid = r.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN {ESQ}),
 'indices', (SELECT json_agg(json_build_object('esquema', schemaname, 'tabla', tablename, 'nombre', indexname, 'def', indexdef) ORDER BY schemaname, tablename, indexname)
     FROM pg_indexes WHERE schemaname IN {ESQ}),
 'funciones', (SELECT json_agg(json_build_object('esquema', n.nspname, 'nombre', p.proname, 'args', pg_get_function_arguments(p.oid),
            'devuelve', pg_get_function_result(p.oid), 'lenguaje', l.lanname) ORDER BY n.nspname, p.proname)
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname IN {ESQ} AND NOT EXISTS (SELECT FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')),
 'extensiones', (SELECT json_agg(extname || ' ' || extversion ORDER BY extname) FROM pg_extension WHERE extname <> 'plpgsql'),
 'version', current_setting('server_version'),
 'total', pg_size_pretty(pg_database_size(current_database())),
 'bases', (SELECT json_agg(datname || ' (' || pg_size_pretty(pg_database_size(datname)) || ')' ORDER BY datname) FROM pg_database WHERE NOT datistemplate)
)"""))

# Filas exactas de cada tabla (solo el número)
conteos = {}
tablas_r = [t for t in meta["tablas"] if t["tipo"] in ("r", "p")]
consulta = " UNION ALL ".join(f"SELECT '{t['esquema']}.{t['nombre']}', count(*) FROM {t['esquema']}.\"{t['nombre']}\"" for t in tablas_r)
for l in psql(consulta).splitlines():
    k, v = l.rsplit("|", 1)
    conteos[k] = int(v)

# ── Comentarios de los archivos SQL ─────────────────────────────────────────────────────────────────────
desc_tabla, desc_col, desc_func, desc_esquema = {}, {}, {}, {}
def limpiar(lineas):
    # Une las líneas del comentario; si una termina sin puntuación y la siguiente empieza en mayúscula, es otra oración
    partes = [re.sub(r"={3,}", "", l.strip().lstrip("-").strip()) for l in lineas]
    partes = [x.strip() for x in partes if x.strip()]
    t = ""
    for x in partes:
        if t and not re.search(r"[.:;,(\[«/-]$", t) and re.match(r"[A-ZÁÉÍÓÚÑ¿¡]", x): t += "."
        t = f"{t} {x}" if t else x
    return re.sub(r"\s+", " ", t).strip()

for f in sorted(Path("db").rglob("*.sql")):
    lineas = f.read_text(encoding="utf-8").splitlines()
    esquema_archivo = f.parent.name
    # Cabecera del archivo 001: descripción del esquema
    if f.name.startswith("001") and esquema_archivo not in desc_esquema:
        cab = []
        for l in lineas:
            if l.strip().startswith("--"): cab.append(l)
            elif l.strip() == "" and not cab: continue
            else: break
        desc_esquema[esquema_archivo] = limpiar(cab)
    actual, previos = None, []
    for l in lineas:
        s = l.strip()
        m = re.match(r"CREATE TABLE IF NOT EXISTS ([a-z_]+)\.([a-z_]+)\s*\(", s, re.I)
        mf = re.match(r"CREATE (?:OR REPLACE )?FUNCTION ([a-z_]+)\.([a-z_]+)\s*\(", s, re.I)
        ma = re.match(r"ALTER TABLE ([a-z_]+)\.([a-z_]+) ADD COLUMN IF NOT EXISTS ([a-z_]+)\b.*?(?:--\s*(.*))?$", s, re.I)
        if m:
            actual = f"{m.group(1)}.{m.group(2)}"
            if previos: desc_tabla.setdefault(actual, limpiar(previos))
        elif mf:
            if previos: desc_func.setdefault(f"{mf.group(1)}.{mf.group(2)}", limpiar(previos))
        elif ma:
            nota = ma.group(4) or (limpiar(previos) if previos else "")
            if nota: desc_col.setdefault((f"{ma.group(1)}.{ma.group(2)}", ma.group(3)), nota.strip())
        elif actual:
            if s.startswith(")"):
                actual = None
            elif not s.startswith("--"):
                mc = re.match(r"([a-z_][a-z0-9_]*)\s+(?:[^-]|-(?!-))*?(?:--\s*(.+))?$", s)
                if mc and mc.group(1).upper() not in ("CONSTRAINT", "PRIMARY", "UNIQUE", "CHECK", "FOREIGN", "EXCLUDE"):
                    # comentario al final de la línea, o el bloque «-- …» justo encima de la columna
                    nota = " ".join(x for x in [limpiar(previos) if previos else "", (mc.group(2) or "").strip()] if x)
                    if nota: desc_col.setdefault((actual, mc.group(1)), nota)
        previos = previos + [l] if s.startswith("--") else []

# ── Render ─────────────────────────────────────────────────────────────────────────────────────────────
def tam(b):
    for u in ("B", "kB", "MB", "GB"):
        if b < 1024: return f"{b:.0f} {u}" if u == "B" else f"{b:.1f} {u}".replace(".0 ", " ")
        b /= 1024
    return f"{b:.1f} TB"
def num(n): return f"{n:,}".replace(",", ".")
def celda(s): return (s or "").replace("|", "\\|").replace("\n", " ")
def corto(defn, n=150):
    defn = re.sub(r"::(text|character varying|numeric|integer|bigint|smallint|date)(\[\])?", "", defn)
    return defn if len(defn) <= n else defn[:n - 1] + "…"

cols_por = {}
for c in meta["columnas"] or []: cols_por.setdefault(c["oid"], []).append(c)
rest_por = {}
for r in meta["restricciones"] or []: rest_por.setdefault(r["oid"], []).append(r)
idx_por = {}
for i in meta["indices"] or []: idx_por.setdefault(f"{i['esquema']}.{i['tabla']}", []).append(i)
fun_por = {}
for fn in meta["funciones"] or []: fun_por.setdefault(fn["esquema"], []).append(fn)
tab_por = {}
for t in meta["tablas"]: tab_por.setdefault(t["esquema"], []).append(t)

DOCS = {p.name[:2]: p.name for p in Path("docs").glob("[0-9][0-9]-*.md")}
enlaces = lambda nums: ", ".join(f"[{d}](docs/{DOCS[d]})" if d in DOCS else d for d in nums.split(", "))

hoy = datetime.now(timezone(timedelta(hours=-4))).strftime("%d/%m/%Y %H:%M")
o = []
w = o.append
w("# Base de datos de El Renglón\n")
w(f"> Generado por `herramientas/documentar_bd.py` el **{hoy}** (hora de Caracas) a partir de la base en servicio y de los comentarios de `db/**/*.sql`. "
  "No editar a mano: se mejora el comentario SQL y se vuelve a generar. Solo describe la estructura y cuenta filas; **no contiene datos**.\n")
w("## Resumen\n")
w(f"- **Motor:** PostgreSQL {meta['version'].split()[0]} (contenedor `db`, imagen `postgres:16.14-alpine`, volumen `elrenglon-pgdata`; escucha en `127.0.0.1:55432`).")
w(f"- **Bases:** {', '.join(meta['bases'])}. `metabase` es la base interna de Metabase (sus preguntas, tableros y usuarios) y no se documenta aquí.")
w(f"- **Tamaño de `elrenglon`:** {meta['total']}.")
w(f"- **Extensiones:** {', '.join(meta['extensiones'])} (`pg_trgm`: búsqueda por similitud; `unaccent`: búsqueda sin tildes).")
w("- **Instalación:** `herramientas/instalar_bd.sh` crea todos los esquemas y carga todas las semillas; es idempotente y cada carga va en una transacción con validaciones. Metabase: `herramientas/instalar_metabase.sh`.")
w("- **Respaldos:** `pg_dump -Fc` antes de cada despliegue, en `~/respaldos/` del servidor (ver docs/19).")
w("- **Convenciones:** fechas `date`/`timestamptz` (la app trabaja en hora de Caracas); montos y tasas `numeric` (la API los devuelve como texto decimal exacto); RIF con guiones (`J-12345678-9`).\n")

w("| Esquema | Para qué | Tablas | Filas | Tamaño | Lo escribe | Docs |")
w("|---|---|---:|---:|---:|---|---|")
for e, (que, quien, docs) in ESQUEMAS.items():
    ts = tab_por.get(e, [])
    filas = sum(conteos.get(f"{e}.{t['nombre']}", 0) for t in ts)
    bytes_ = sum(t["bytes"] for t in ts)
    nt = len([t for t in ts if t["tipo"] in ("r", "p")]); nv = len([t for t in ts if t["tipo"] in ("v", "m")])
    w(f"| [`{e}`](#esquema-{e}) | {que} | {nt}{f' + {nv} vista' + ('s' if nv > 1 else '') if nv else ''} | {num(filas)} | {tam(bytes_)} | {quien} | {enlaces(docs)} |")
w("")

w("## Roles y permisos\n")
w("| Rol | Uso | Permisos |")
w("|---|---|---|")
w("| `elrenglon` (`POSTGRES_USER`) | La app, los programadores y los cargadores | Dueño de todos los esquemas |")
w("| `metabase` | Metabase guarda su configuración | Dueño de la base `metabase` |")
w("| `metabase_lectura` | Conexión de Metabase a los datos | **Solo lectura** (`default_transaction_read_only`, `statement_timeout` 120 s). Ver la columna «Metabase» de cada tabla |\n")
w("Tablas con **datos personales** (marcadas con 🔒): correos, IP, RIF de personas, contraseñas o tokens en hash. En el panel solo las ve el superadministrador.\n")

# Relaciones entre esquemas
rel = sorted({(f"{t['esquema']}.{t['nombre']}", r["ref"]) for t in tablas_r for r in rest_por.get(t["oid"], []) if r["tipo"] == "f" and r["ref"] and r["ref"].split(".")[0] != t["esquema"]})
if rel:
    w("### Relaciones entre esquemas\n")
    for a, b in rel: w(f"- `{a}` → `{b}`")
    w("")

w("## Retención y limpieza\n")
w("- `analitica.purgar()`: visitas y RIF consultados de más de 12 meses (cada hora, desde `noticias-programador`).")
w("- `avisos.purgar()`: envíos de más de 12 meses y control de vencimientos ya pasados.")
w("- Noticiero: titulares y lecturas de más de 90 días.")
w("- `prospeccion.baja`: **nunca se borra** (lista de supresión permanente).\n")

for e in ESQUEMAS:
    ts = tab_por.get(e, [])
    w(f"---\n\n## Esquema `{e}`\n<a id=\"esquema-{e}\"></a>\n")
    if desc_esquema.get(e): w(f"{desc_esquema[e]}\n")
    w(f"**Lo escribe:** {ESQUEMAS[e][1]} · **Documentación:** {enlaces(ESQUEMAS[e][2])}\n")
    for t in ts:
        clave = f"{e}.{t['nombre']}"
        es_vista = t["tipo"] in ("v", "m")
        cab = f"### `{clave}`{' (vista)' if es_vista else ''}{' 🔒' if clave in PERSONALES else ''}"
        w(cab + "\n")
        partes = []
        if not es_vista: partes.append(f"{num(conteos.get(clave, 0))} filas")
        partes.append(tam(t["bytes"]))
        if t["metabase"]: partes.append(f"Metabase: {t['metabase']}")
        w(f"*{' · '.join(partes)}*\n")
        if desc_tabla.get(clave): w(f"{desc_tabla[clave]}\n")
        cols = cols_por.get(t["oid"], [])
        pks = [r for r in rest_por.get(t["oid"], []) if r["tipo"] == "p"]
        pk_cols = set(re.findall(r"[a-z_]+", pks[0]["def"].split("(", 1)[1])) if pks else set()
        fks = {}
        for r in rest_por.get(t["oid"], []):
            if r["tipo"] == "f":
                for cn in re.findall(r"[a-z_]+", r["def"].split("(", 1)[1].split(")")[0]): fks[cn] = r["ref"]
        w("| Columna | Tipo | Nulo | Predeterminado | Notas |")
        w("|---|---|:---:|---|---|")
        for c in cols:
            notas = []
            if c["nombre"] in pk_cols: notas.append("**PK**")
            if c["nombre"] in fks: notas.append(f"→ `{fks[c['nombre']]}`")
            if c["generada"]: notas.append("generada")
            if t["metabase"] == "algunas columnas" and c.get("mb") is False: notas.append("oculta a Metabase")
            if desc_col.get((clave, c["nombre"])): notas.append(desc_col[(clave, c["nombre"])])
            defecto = "autonumérico" if (c["defecto"] or "").startswith("nextval(") else f"`{celda(corto(c['defecto'], 60))}`" if c["defecto"] else ""
            tipo = c["tipo"].replace("timestamp with time zone", "timestamptz").replace("timestamp without time zone", "timestamp").replace("character varying", "varchar")
            w(f"| `{c['nombre']}` | {celda(tipo)} | {'sí' if c['nulo'] else 'no'} | {defecto} | {celda(' · '.join(notas))} |")
        extras = [r for r in rest_por.get(t["oid"], []) if r["tipo"] in ("u", "c")]
        idx = [i for i in idx_por.get(clave, []) if not i["nombre"].endswith("_pkey") and i["nombre"] not in {r["nombre"] for r in extras}]
        if extras or idx:
            w("")
            for r in extras: w(f"- {'Única' if r['tipo'] == 'u' else 'Regla'} `{r['nombre']}`: `{celda(corto(r['def']))}`")
            for i in idx:
                cuerpo = re.sub(r"^CREATE (UNIQUE )?INDEX \S+ ON \S+ ", "", i["def"])
                w(f"- Índice{' único' if 'UNIQUE' in i['def'] else ''} `{i['nombre']}`: `{celda(corto(cuerpo, 120))}`")
        w("")
    if fun_por.get(e):
        w(f"### Funciones de `{e}`\n")
        for fn in fun_por[e]:
            d = desc_func.get(f"{e}.{fn['nombre']}", "")
            w(f"- `{e}.{fn['nombre']}({celda(corto(fn['args'], 90))})` → `{celda(corto(fn['devuelve'], 80))}` ({fn['lenguaje']}){': ' + d if d else ''}")
        w("")

Path("DATABASE.md").write_text("\n".join(o) + "\n", encoding="utf-8")
print(f"DATABASE.md: {len(ESQUEMAS)} esquemas, {len(tablas_r)} tablas, {sum(conteos.values()):,} filas, {len(o)} líneas")
