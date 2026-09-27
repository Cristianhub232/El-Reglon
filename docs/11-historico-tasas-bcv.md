# 11 · Histórico oficial de tasas BCV (módulo BCV)

> **Generado el:** 27/09/2026 · **Fuente:** archivos oficiales del BCV "Tipo de Cambio de Referencia" (Sistema de Mercado Cambiario), `2_1_2<trimestre><año>_smc.xls`
> **Cobertura:** fecha valor del **03/01/2025 al 28/09/2026** (7 trimestres).

## 1. Resultado

| Concepto | Valor |
|---|---|
| Archivos | 7 (2025 T1–T4 y 2026 T1–T3), guardados en `fuentes/bcv/` con su SHA-256 |
| Publicaciones (una por fecha valor) | **417** |
| Tasas | **8.757** (21 monedas × 417 días) |
| Monedas | EUR, USD, CNY, TRY, RUB y 16 más (CAD, INR, JPY, ARS, BRL, CLP, COP, UYU, PEN, BOB, MXP, CUC, NIO, DOP, TTD, ANG) |
| Días hábiles sin publicación | 35: coinciden con los **feriados bancarios** (Carnaval, Semana Santa, 1° de mayo, 24 de junio, 24 de julio, fin de año y lunes de traslado) |
| Última tasa | Fecha valor 28/09/2026: **USD 857,00580000** y **EUR 976,90091142**, idénticas a la portada del BCV consultada el 27/09/2026 |

### Cuál es la "tasa oficial"

Cada hoja trae, por moneda, la compra y la venta en dos expresiones: **cotización frente al US$** y **Bs. por unidad**. La tasa oficial que publica la portada del BCV, y que se usa a efectos tributarios y aduaneros, es **"Venta (ASK)" en Bs./moneda** (`venta_bs`). Se verificó con las 5 monedas de la portada (USD, EUR, CNY, TRY y RUB).

Base legal, según la nota al pie de cada hoja: Convenio Cambiario N° 1, art. 9, parágrafo primero, y Resolución N° 19-05-01. Es el tipo de cambio "de referencia de mercado a todos los efectos", incluido el cálculo de las obligaciones de la Ley Orgánica de Aduanas y del Código Orgánico Tributario.

## 2. Estructura homologada (PostgreSQL, esquema `bcv`)

| Tabla / objeto | Contenido |
|---|---|
| `bcv.fuente` | Cada archivo (o, más adelante, la portada o una migración) con su SHA-256 y período |
| `bcv.moneda` | Código del BCV, país y **código ISO 4217** (el BCV publica `MXP`; el ISO vigente es `MXN`) |
| `bcv.publicacion` | Una fila por **fecha valor**: fecha de operación, hora de publicación y hoja de origen |
| `bcv.tasa` | Por fecha valor y moneda: `compra_bs`, **`venta_bs` (oficial)**, `cotizacion_compra` y `cotizacion_venta`, en `numeric(20,8)`: los **8 decimales** del BCV |
| `bcv.dia_sin_publicacion` | Feriados bancarios inferidos (días hábiles sin fecha valor) |
| `bcv.v_tasa_oficial` | Vista: tasa oficial por fecha valor, con su fuente |
| `bcv.tasa_aplicable(fecha, moneda)` | Tasa **aplicable a una operación** según el art. 25 de la Ley de IVA |

### Tasa aplicable (art. 25 de la Ley de IVA)

La tasa del día de la operación; si ese día no es hábil para el sector financiero, la vigente en el **día hábil inmediatamente siguiente**. Como solo los días hábiles tienen fecha valor, es la primera fecha valor igual o posterior a la fecha de la operación.

| Operación | Fecha valor usada | USD / EUR |
|---|---|---|
| Martes 01/04/2025 | 01/04/2025 | USD 69,776 |
| Sábado 26/09/2026 | Lunes 28/09/2026 | USD 857,0058 |
| Miércoles 24/12/2025 (feriado) | Viernes 26/12/2025 | EUR 342,93634242 |
| Lunes de Carnaval 16/02/2026 | Miércoles 18/02/2026 | USD 396,3674 |
| 15/10/2026 (sin publicación todavía) | — | Sin resultado: **nunca se inventa una tasa** |

## 3. Validaciones

**Al extraer** (`extraer_historico_bcv.py`; si algo falla, aborta):

- Nombre de cada hoja = fecha de operación.
- Fecha valor entre 1 y 6 días después de la operación.
- Encabezado de columnas esperado.
- Una sola publicación por fecha valor; si aparece dos veces con valores distintos, es un error.
- USD y EUR presentes y la cotización del USD igual a 1.
- Compra ≤ venta y valores positivos.
- **Coherencia cruzada:** la tasa en Bs. de cada moneda coincide con la del USD dividida o multiplicada por su cotización (tolerancia 0,05 %). **0 desvíos** en 8.757 tasas.
- **Continuidad:** ninguna variación diaria del USD superior al 5 %.

**Al cargar** (`db/bcv/002_cargar_historico.sql`, en una transacción):

| Regla | Qué verifica |
|---|---|
| V1 | El lote coincide con su manifiesto |
| V2 | **Nada de lo ya cargado se contradice.** Probado: una tasa alterada (69,776 → 69,777) aborta la carga |
| V3 | Toda publicación trae USD y EUR |
| V4 | La última tasa USD del lote es la del manifiesto |
| V5 | Un archivo ya cargado no puede reaparecer con otro contenido (republicación del BCV) |
| V6 | Un día marcado sin publicación no tiene fecha valor |

La carga es **incremental e idempotente**: para un trimestre nuevo se agrega su archivo y se repite el proceso, y recargar lo mismo no duplica nada.

## 4. Uso

```bash
pip install -r herramientas/requirements.txt          # xlrd, para leer .xls
python3 herramientas/bcv/extraer_historico_bcv.py fuentes/bcv datos/bcv/historico
herramientas/bcv/cargar_bcv.sh                          # requiere "docker compose up -d db"
```

```sql
SELECT * FROM bcv.tasa_aplicable('2026-09-26', 'USD');
SELECT fecha_valor, tasa_bs FROM bcv.v_tasa_oficial WHERE moneda = 'EUR' ORDER BY fecha_valor DESC LIMIT 5;
```

## 5. Relación con tasas-bcv (premisa 12)

| tasas-bcv `"DBO"."tasas_diarias"` | El Renglón |
|---|---|
| `cur_cod` (solo EUR y USD) | `bcv.tasa.moneda` (21 monedas) |
| `valid_from` | `bcv.publicacion.fecha_valor` |
| `rat_exc` numeric(18,6) | `bcv.tasa.venta_bs` numeric(20,8) |
| — | `compra_bs`, cotizaciones, fecha de operación, hora de publicación, archivo fuente y SHA-256 |

Los archivos del BCV **reemplazan** al CSV "Listado de Tasas Diarias.csv" como fuente histórica desde 2025, con más precisión (8 decimales) y trazabilidad al documento oficial. La lectura diaria de la portada (lógica de tasas-bcv, con las correcciones del [informe 10](analisis/10-analisis-tasas-bcv.md)) completará los días posteriores al último archivo. Para esas filas, `bcv.fuente.tipo` será `portada`.

## 6. Pendiente

- **Años anteriores a 2025.** El BCV publica los mismos archivos para años previos. Si hacen falta, se agregan a `fuentes/bcv/` y se recarga.
- **Ingesta diaria desde la portada:** portar el scraper de tasas-bcv con sus correcciones.
- **Calendario de feriados:** hoy se infiere de los días sin publicación. Se podría contrastar con el calendario bancario oficial de SUDEBAN, lo que serviría también para el futuro módulo de calendario tributario.
