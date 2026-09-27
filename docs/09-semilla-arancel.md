# 09 · Semilla propia del módulo Arancel (PostgreSQL)

> **Generada el:** 27/09/2026 · **Estado:** base 2024 + 3 de 5 reformas de 2025 aplicadas y validadas.
> Ejecuta el plan del [informe 08](analisis/08-analisis-rep-arancel.md) §4: semilla propia extraída del PDF oficial, jerarquía derivada del código, carga en PostgreSQL con validaciones que abortan ante cualquier error y Rep-Arancel usado solo como contraste.

## 1. Resultado

| Semilla | Contenido | Subpartidas | Terminales (declarables) | Con AEC |
|---|---|---|---|---|
| `datos/arancel/base_2024/` | Decreto N° 4.944, texto original (GO Ext. 6.804) | 16.310 | 11.834 | 11.832 |
| `datos/arancel/vigente/` | Base + Decretos 5.103, 5.147 y 5.198 | 16.432 | 11.909 | 11.909 |

Las dos incluyen 22 secciones, 98 capítulos, 1.275 partidas, las 12 unidades físicas oficiales, los 21 regímenes legales y los **preliminares del art. 37** (§2.1). La vigente trae los textos del art. 21 tal como quedaron en el Decreto 5.198.

**Trazabilidad:**
- Cada subpartida indica la **versión normativa** que la dejó como está.
- `cambio.csv` registra los **5.301 cambios** (antes → después) con decreto y artículo.
- `version.csv` guarda el **SHA-256** de cada PDF fuente.

### Reformas

| Instrumento | Gaceta | Estado | Aplicado |
|---|---|---|---|
| Decreto N° 5.103 | Ext. 6.890 (06/03/2025) | ✅ Aplicada | 778 filas de nomenclatura, 584 Ex-AEC, 23 regímenes |
| Decreto N° 5.147 | Ext. 6.918 (30/06/2025) | ✅ Aplicada | 34 filas de nomenclatura, 999 Ex-AEC, 309 regímenes |
| Decreto N° 5.198 | Ext. 6.952 (31/12/2025) | ✅ Aplicada | 82 filas de nomenclatura, 735 Ex-AEC, 636 regímenes, textos del art. 21 |
| Decreto N° 5.122 | 43.111 (21/04/2025) | ⏳ Pendiente de revisión manual | Subcapítulo V del cap. 98 (códigos 9880–9893, hidrocarburos). Sus dos tablas lado a lado repiten fragmentos en los cortes de columna y página, y la extracción automática deja 5 filas dudosas |
| Resolución DM 012/2025 | Ext. 6.902 (23/04/2025) | ⏳ Sin texto oficial | Agrega las subpartidas 9836.00.00.4 y 9836.00.00.41 (contingente de buques) |

Ninguna de las reformas aplicadas depende de las pendientes: el aplicador verifica que todo código citado exista.

## 2. Método

```
fuentes/arancel/*.pdf ──► extraer_arancel.py ──► construir_semilla.py ──► datos/arancel/base_2024/
                                                                               │
reformas.json ──► extraer_reforma.py (por reforma) ──► aplicar_reformas.py ◄───┘
                                                               │
                                                               ▼
                                                  datos/arancel/vigente/ ──► cargar_arancel.sh ──► PostgreSQL
```

- **Lectura por coordenadas** (`extraer_arancel.py`). Cada palabra del PDF se ubica en su columna según la posición de los marcadores "(1)"…"(7)" de la página. Los valores centrados verticalmente en celdas de varias líneas se asignan a la fila cuya franja los contiene. Así se separan bien el AEC, el Ex-AEC y los regímenes de importación y exportación, que Rep-Arancel confundía.
- **Jerarquía derivada del código** (`arbol.py`). El padre de un nodo es el prefijo más largo, sin ceros de relleno. Los guiones de la Gaceta solo se usan como verificación.
- **Reformas** (`extraer_reforma.py`, `aplicar_reformas.py`). Se reconocen:
  - listas de Ex-AEC y de régimen, verificadas con la columna **N°** correlativa (no pueden faltar filas);
  - bloques "DONDE DICE / DEBE DECIR";
  - incorporaciones.

  Se aplican en orden cronológico.
- **Nada se corrige en silencio.** Los vacíos y errores de la propia Gaceta quedan en `observacion_fuente.csv` para revisión humana.

### 2.1 Preliminares del art. 37 (págs. 3–6 de la GO 6.804)

Bloques que preceden a la nomenclatura y que sirven para interpretarla. Están en `datos/arancel/preliminares/`, transcritos a mano y **verificados literalmente contra el PDF**. Cada semilla los incluye.

| Tabla | Contenido | Filas | Para qué sirve |
|---|---|---|---|
| `arancel.regla_interpretacion` | Reglas Generales para la Interpretación 1 a 6 (con literales a, b, c) y Reglas Generales Complementarias 1 y 2 | 15 | Base legal de la **detección arancelaria**: especificidad (3a), carácter esencial (3b), última partida (3c), analogía (4), envases (5b). Las respuestas pueden citar la regla aplicada |
| `arancel.abreviatura` | "Abreviaturas y Símbolos" (ISO, DCI, HRC, kVA, µCi, m², etc.) | 66 | Interpretar y **expandir** descripciones en la búsqueda por texto y en la UI (p. ej. "DCI" = Designación Común Internacional) |
| `arancel.conversion_unidad` | "Tabla de conversión de las principales unidades físicas de medida": longitud, masa, superficie y volumen | 20 | Convertir las cantidades del usuario (libras, galones, pies…) a la **unidad física** de cada subpartida (kg, m², m³, l) |

La tabla "Unidades físicas (U.F.) por subpartida" ya estaba en `arancel.unidad_fisica`, y el índice "Secciones y Capítulos" en `arancel.seccion` y `arancel.capitulo`.

**Pendiente, con mucho valor para la detección:** las **Notas legales** de sección, de capítulo, de subpartida y complementarias, que están repartidas a lo largo del documento, antes de cada capítulo. Definen qué entra y qué no en cada capítulo (p. ej. "Este Capítulo comprende todos los animales vivos, excepto…").

## 3. Validaciones

### 3.1 Al aplicar las reformas (el script aborta si fallan)

| Validación | Resultado |
|---|---|
| Cada "DONDE DICE" coincide con el estado vigente antes de la reforma (código y AEC) | **773 de 773** filas coinciden. Esto valida a la vez la base y cada reforma |
| Toda lista de Ex-AEC o régimen está completa (N° 1..máx sin huecos) | Completas: 175 + 409 + 23, 999 + 309 y 735 + 636 |
| Todo código citado por una lista existe | 0 inexistentes |
| Formato de cada campo (AEC, Ex-AEC, marcas, régimen 1..21, unidad del catálogo oficial) | 0 inválidos |
| Salida determinista | La misma SHA-256 en ejecuciones repetidas |

### 3.2 Al cargar en PostgreSQL (una transacción: si algo falla, no se carga nada)

| Regla | Qué verifica |
|---|---|
| V0 | Ninguna fila se pierde al resolver versiones |
| V1 | Conteos iguales al manifiesto |
| V2 | Cada capítulo cae en el rango de su sección (Sistema Armonizado) |
| V3 | Toda partida tiene subpartidas; todo capítulo no reservado tiene partidas |
| V4 | Terminal = sin hijos |
| V5 | Terminales sin AEC o sin unidad: solo los documentados como vacíos de la fuente |
| V6 | Tarifas mayores a 40 % solo si las introdujo una reforma registrada (p. ej. el azúcar 1701: Ex-AEC **98E**, Decreto 5.198) |
| V7, V8 | Sin texto de página ni columnas de tarifa coladas en las descripciones |
| V9 | Coherencia capítulo ↔ partida ↔ subpartida |
| V10 | El historial de cambios es coherente con el árbol vigente |
| V11 | Preliminares completos: RGI 1 a 6, complementarias 1 y 2, abreviaturas y tabla de conversión |

Además, el esquema tiene restricciones propias:
- régimen ⊆ {1..21};
- terminal ⇒ código de 10 dígitos;
- el código del padre es prefijo del hijo;
- claves foráneas a unidad y partida.

## 4. Contraste con Rep-Arancel

`datos/arancel/base_2024/contraste_rep_arancel.csv` lista las 160 diferencias de AEC (dml_08: 96,3 % de coincidencia; dml_12: 99,0 %). En todas las muestras revisadas contra la Gaceta, **el valor de El Renglón es el correcto**. Rep-Arancel tomaba el Ex-AEC o el régimen como si fueran el AEC (p. ej. 2806.10.10.00: Gaceta 6 %, Rep-Arancel 21 %, que es un régimen).

## 5. Observaciones de la fuente (revisión humana)

`observacion_fuente.csv` (49 en la vigente). Las más relevantes:

- **Código fuera de lugar:** la Gaceta 6.804 imprime "8701.29.00.00 … 3 u" dentro del bloque 98.01, donde por secuencia correspondería 9801.00.00.29. **Resuelto oficialmente:** el Decreto 5.103, art. 8, lo cita en "DONDE DICE" y lo omite en "DEBE DECIR".
- **Filas repetidas en la fuente:** 9850 a 9852 (págs. 369–370 de la GO 6.804) y un bloque de la lista del art. 3 del 5.147 en la copia de aduaneros.net.
- **Vacíos de la fuente:** 2930.90.49.20 sin AEC ni unidad; 2921.19.94.00, 7019.90.00.00, 8501.80.00.00 y 9508.21.x sin unidad.
- **Régimen ilegible:** "5,612" en 0901.12.00.00 (¿5,6,12?). Se deja vacío, a la espera de confirmación.
- **Discrepancias de guiones:** 19 casos en los que los guiones de la Gaceta no concuerdan con el código. Manda el código.
- **Encabezado erróneo:** las páginas del Decreto 5.147 dicen "Decreto N° 5.149".

## 6. Uso

```bash
# Regenerar las semillas desde los PDF (reproducible)
herramientas/arancel/generar_semilla.sh

# Cargar en PostgreSQL (docker compose, servicio "db")
cp .env.example .env            # y cambiar la contraseña
docker compose up -d db
herramientas/arancel/cargar_arancel.sh                     # vigente (por defecto)
herramientas/arancel/cargar_arancel.sh datos/arancel/base_2024
```

Consultas útiles:
- `arancel.v_subpartida_ruta`: ruta completa, que resuelve los "Los demás".
- `arancel.cambio`: historial por código.
- `arancel.observacion_fuente`: pendientes de revisión.

## 7. Fuentes

| Archivo | Origen | SHA-256 |
|---|---|---|
| GOE-6804_Decreto-4944.pdf | Tradex (idéntico al PDF incluido en Rep-Arancel) | `60e9e089…3cff85` |
| GOE-6890_Decreto-5103.pdf | Tradex | `d5192bf7…4d398` |
| GOE-6918_Decreto-5147.pdf | aduaneros.net (con marca de agua "www.aduaneros.net", que se elimina al leer) | `bd55f006…d8d12` |
| GOE-6952_Decreto-5198.pdf | Tradex | `a77cb3e9…e56d1` |
| GO-43111_Decreto-5122.pdf | Tradex (pendiente) | `1a94d0e6…e0698` |

> Son copias de terceros de la Gaceta Oficial. Para la homologación completa (premisa 10) conviene **reemplazarlas por los PDF oficiales** de la Imprenta Nacional o del TSJ y regenerar: las sumas SHA-256 del manifiesto permiten detectar cualquier diferencia.
