# 08 · Análisis del repositorio Rep-Arancel (premisa 11)

> **Repositorio:** https://github.com/Ronny390/Rep-Arancel (proyecto de pasantía, 30 commits, junio de 2026)
> **Analizado el:** 27/09/2026
> **Método:** se clonó el repositorio **sin ejecutar su código**. Solo se extrajeron los **datos** de sus archivos semilla (`sql/dml_*.sql`), se cargaron en tablas de *staging* de **PostgreSQL 16** y se contrastaron con el **texto oficial de la Gaceta Oficial Ext. N° 6.804 (25/04/2024, Decreto N° 4.944)**, que el propio repositorio incluye en PDF.
> **Decisión del equipo:** El Renglón usa **solo PostgreSQL**. Nada del proyecto se basa en Oracle.

---

## 1. Veredicto

| Aspecto | Evaluación |
|---|---|
| **Modelo conceptual** (Sección → Capítulo → Partida → Subpartida, nodos terminales, relación padre, régimen legal N:M, notas multinivel) | ✅ **Bueno.** Se reutiliza como idea para el módulo Arancel |
| **Cobertura de códigos** | ✅ **Completa.** Están los **11.834 códigos oficiales de 10 dígitos** |
| **Calidad de los datos semilla** | ❌ **No apta para importar tal cual.** Hay tarifas contradictorias, IDs que chocan, descripciones cortadas, unidades perdidas y jerarquía mal enlazada |
| **Vigencia** | ⚠️ Solo el texto original de 2024. **No incluye las reformas de 2025** (p. ej. el Decreto N° 5.122, GO 43.111, que agrega al capítulo 98 las mercancías para la industria de hidrocarburos) |
| **Código e infraestructura** | ❌ Basado en Oracle y Metabase, con credenciales en texto plano y privilegios excesivos. **No se reutiliza** |

**Recomendación:** construir **nuestra propia semilla en PostgreSQL** a partir del PDF oficial y de sus reformas, usando Rep-Arancel solo como **verificación cruzada**. Sus mejores datos (tarifas de `dml_12` y `dml_08`) sirven para contrastar.

---

## 2. Hallazgos en los datos semilla

Cifras obtenidas con consultas SQL sobre el *staging* en PostgreSQL. La columna "Impacto" indica qué pasaría si se usaran esos datos en El Renglón.

### 2.1 Críticos

| # | Hallazgo | Evidencia | Impacto |
|---|---|---|---|
| D1 | **El archivo de "faltantes" (`dml_10`) reutiliza 2.115 IDs que `dml_08` ya usa para otros productos**, y **2.114 de sus 2.115 códigos ya existían** en `dml_08` | ID 11846: en `dml_08` es 8111.00.90.20 "Desperdicios de manganeso"; en `dml_10` es 0106.12.00.00 "Ballenas, delfines…" | Archivo redundante y en conflicto |
| D2 | **Las tarifas de `dml_11` quedan asignadas a productos equivocados**: apuntan a los IDs de `dml_10`, que en realidad pertenecen a otros productos de `dml_08` | La tarifa pensada para "Ballenas" cae en "Desperdicios de manganeso". Exactitud frente a la Gaceta: **2,5 %** | Aranceles falsos |
| D3 | **`dml_03` tiene las tarifas desplazadas**: fueron generadas para una numeración de IDs anterior | Exactitud frente a la Gaceta: **19,8 %**. Ej.: 0101.30.00.00 "Asnos" dice 0 %; la Gaceta dice **4 %** | Aranceles falsos |
| D4 | **4.160 subpartidas tienen tarifas contradictorias** según el archivo | Ej.: 0101.29.00.10 → `dml_03` = 4 %, `dml_08` = 2 % (Gaceta: 2 %) | El resultado depende del orden de carga |
| D5 | **Tarifas imposibles:** 114 valores que en realidad son **números de partida** tomados como porcentaje | 9305.20.00.00 con AEC = **93.03 %**; 9209.94.00.00 con **92.07 %** | Aranceles falsos |
| D6 | **~1.842 subpartidas enlazadas a la partida equivocada** (la clave foránea está desfasada) | 1901.10 "Preparaciones para lactantes" colgando de la partida **04.01** (leche) | Árbol jerárquico incorrecto |
| D7 | **Capítulo 44 (Madera) asignado a la Sección VIII.** Corresponde a la **Sección IX** | Las secciones se enlazan por orden de inserción, lo que es frágil | Clasificación incorrecta |

### 2.2 Importantes

| # | Hallazgo | Evidencia |
|---|---|---|
| D8 | **87 códigos duplicados** en `dml_08`, generados al leer como subpartidas las citas del capítulo 98 | 8704.10 aparece 4 veces con descripciones "14BK", "14BK u", "0BK u" |
| D9 | **912 descripciones truncadas**: se perdió el final | "- - De peso superior o igual a" (falta "50 kg"); "En envases de contenido neto inferior o igual a" |
| D10 | **Descripciones basura**: fragmentos de notas legales o de columnas | 3004.90.99.30 = "a 3004.90.99.50"; 8470.29 = "16 u"; 4412.33.00.00 = "Ltraospidceamleás s…" (texto entremezclado del PDF) |
| D11 | **Unidades físicas perdidas**: el catálogo solo tiene 5 unidades y **no incluye m², m³ ni "1000 u"** | 578 subpartidas en m² y 183 en m³ quedaron sin unidad. En total, **3.561 terminales sin unidad** |
| D12 | **Régimen legal incompleto**: **3.024 terminales** que en la Gaceta exigen permisos o registros no tienen régimen en la semilla. Además hay 2 códigos de régimen inexistentes (612 y 1000; solo existen del 1 al 21) | Para un importador, el régimen legal es clave |
| D13 | **2.313 tarifas asignadas a nodos de agrupación** (no declarables) y **2.749 terminales sin tarifa** | — |
| D14 | **67 de 105 notas legales** incluyen texto de encabezado de página | "…8 GACETA OFICIAL DE LA REPÚBLICA BOLIVARIANA DE VENEZUELA Extraordinario" |
| D15 | **Partidas con texto corrupto**: letras perdidas y tarifas pegadas | 05.04 "…EXCEPTO LOS D PESCADO"; 23.05 "…DEL ACEIT DE MANÍ… 6 5 kg" |

### 2.3 Error conceptual

| # | Hallazgo | Por qué es un error |
|---|---|---|
| D16 | `dml_14` **"desactiva" 22 códigos** porque aparecen en una lista de "partidas exentadas" (`3.1.2-Partidas exentadas.xlsx`). Además, **9 de esos 22 códigos no existen** en la semilla | Un código **exonerado sigue siendo un código válido** del arancel. La exoneración es un **tratamiento fiscal con vigencia**, no una baja del código. En El Renglón se modela como **exoneración** (tabla `exoneracion`, con decreto y fechas), nunca desactivando el código |

### 2.4 Lo que está bien y se aprovecha

- **Todos los códigos oficiales de 10 dígitos están presentes** (11.834 de 11.834).
- **Las tarifas de `dml_12` coinciden con la Gaceta en el 99,2 %** y las incluidas en `dml_08` en el 96,5 %. Sirven como verificación cruzada.
- El **catálogo de los 21 regímenes legales** y la semántica de las tarifas (AEC, sufijos **BK** = bienes de capital, **BIT** = bienes de informática y telecomunicaciones, Ex-AEC con sufijos **E**/**A**) están bien documentados.
- La idea de **reconstruir la ruta completa** para resolver las descripciones "Los demás" (p. ej. "Crustáceos > Congelados > … > Los demás") es muy útil para la **detección arancelaria**.

---

## 3. Hallazgos en el código y la infraestructura

### 3.1 Seguridad

| # | Hallazgo | Riesgo |
|---|---|---|
| S1 | **Contraseñas en texto plano** en `docker-compose.yml` (`ORACLE_PASSWORD=postgres`), `sql/init_db.sh` (`system/postgres`) y el README (`arancel/arancel`). El commit que "eliminaba la contraseña" (`fbdc140`) fue **revertido** por un commit posterior (`55222cf`) | Acceso a la base de datos por cualquiera que lea el repositorio |
| S2 | **El historial de git conserva contraseñas** (`postgress`, `postgres`) | Aunque se borren hoy, siguen visibles en el historial |
| S3 | El usuario de la aplicación recibe **`GRANT DBA`** | Viola el principio de mínimo privilegio: control total de la base |
| S4 | **Puertos 1521 (base de datos) y 3000 (Metabase) expuestos en todas las interfaces** (`0.0.0.0`) | Accesibles desde la red local o pública |
| S5 | Imágenes Docker con **`:latest`** sin versión fija | Builds no reproducibles; una actualización puede romper todo |
| S6 | Metabase con base **H2** y un commit que propone **subir `metabase-data` a git** para compartir dashboards | H2 guarda las credenciales de conexión: se filtrarían en el repositorio |
| S7 | **La instalación borra todo en cada ejecución** (`00_drop_tablas.sql`) y las claves foráneas usan **`ON DELETE CASCADE` desde Sección** | Borrar una sección elimina en cascada todo su árbol |

### 3.2 Malas prácticas

| # | Hallazgo |
|---|---|
| P1 | **Los errores de carga no detienen la instalación.** El script no aborta ante un error, así que miles de inserciones rechazadas (duplicados, claves foráneas rotas) pasan **en silencio** y el resultado depende del orden de ejecución |
| P2 | **Las "correcciones" se aplican como INSERT adicionales** sobre datos ya cargados, en lugar de corregir la fuente y regenerar. Por eso muchas correcciones nunca se aplican |
| P3 | **Claves foráneas basadas en el orden de inserción** (IDs de identidad implícitos) en Sección, Capítulo y Partida. Es frágil y causó D6 y D7 |
| P4 | **Rutas absolutas de Windows** en scripts (`C:/Users/usuario/Desktop/New diseño/...`): no son reproducibles |
| P5 | **Muchos scripts de un solo uso** (`fix_*`, `reclean_*`, `apply_*`, `verify_notes_v2`…), respaldos duplicados (`respaldos_sql/`, dos versiones de `dml_04`) y consultas de prueba (`test_view*.sql`) mezclados con el código productivo |
| P6 | **Binarios en el repositorio**: `ojdbc11.jar` (7 MB, aunque el `.gitignore` excluye `plugins/`), el PDF oficial (5,6 MB) y un Excel. El repositorio pesa 47 MB |
| P7 | **Sin pruebas automatizadas** de integridad de los datos contra la fuente oficial |

### 3.3 Lo que no necesitamos

Todo lo específico de Oracle (DDL, `ojdbc11.jar`, `sqlplus`, `CONNECT BY`), Metabase y sus vistas, `docker-compose.yml`, el instalador `.bat`, los scripts de corrección puntuales, los respaldos, la bitácora de tesis y los scripts de verificación de notas.

---

## 4. Plan propuesto para el módulo Arancel de El Renglón

> ✅ **Ejecutado el 27/09/2026.** Resultado en [09 · Semilla propia del Arancel](../09-semilla-arancel.md).

1. **Fuente primaria:** el PDF oficial de la GO Ext. 6.804 **más sus reformas de 2025**, cada una registrada en `arancel.version` con su decreto y su Gaceta.
2. **Extracción propia y reproducible** (Python) a CSV, que se carga en PostgreSQL con `COPY` dentro de **una transacción que aborta ante cualquier error**.
3. **La jerarquía se deriva del código** (los primeros 2, 4, 6 u 8 dígitos), no de IDs por orden de inserción. La clave natural es el código.
4. **Validaciones automáticas antes de publicar:** formato del código, padre existente, terminal con tarifa y unidad, AEC en rango, régimen entre 1 y 21, descripciones sin texto de página, y la cantidad de terminales igual a la de la Gaceta.
5. **Verificación cruzada** contra las tarifas de Rep-Arancel (`dml_12` y `dml_08`), con un reporte de diferencias para revisión humana.
6. **Unidades completas:** kg, u, m², m³, 2u, 1000 u, 1000 kWh, etc.
7. **Exoneraciones como tratamiento con vigencia**, nunca desactivando códigos (ver D16).
8. **Notas legales limpias** y vinculadas por código.

---

## 5. Reproducibilidad del análisis

Las herramientas usadas están en [herramientas/arancel/](../../herramientas/arancel/):

- `extraer_semilla.py`: extrae los datos de los `dml_*.sql` a CSV, conservando el archivo de origen de cada fila. No ejecuta nada del repositorio.
- `referencia_pdf.py`: construye la tabla de referencia (código, descripción, AEC, unidad) a partir del texto del PDF oficial.
- `consultas_calidad.sql`: las consultas de este informe, para PostgreSQL.

**Limitación:** la referencia se construye leyendo el texto del PDF, así que es heurística. Obtuvo el AEC de 11.666 de los 11.834 códigos. Las comparaciones de AEC se hicieron sobre esos 11.666.
