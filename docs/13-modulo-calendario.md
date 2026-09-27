# 13 · Módulo Calendario tributario 2026 (y validación del RIF)

> Implementado el 27/09/2026. Esquemas `calendario` y `rif` en PostgreSQL. Reemplaza a calendarioapi ([12](analisis/12-analisis-calendarioapi.md)), que nadie usa.

## 1. Fuentes y regla por tipo de contribuyente

| Tipo | Norma | Regla |
|---|---|---|
| **Especial** (notificado por el SENIAT) | Providencia **SNAT/2025/000091**, GO **43.283** del 23/12/2025 (reimpresión de la GO 43.273) | Fechas fijas por último dígito del RIF, transcritas de la Gaceta: 13 obligaciones y 646 fechas por grupo de terminales |
| **Ordinario** (IVA) | **Reglamento General de la Ley de IVA, art. 60** (Decreto 206, GO Ext. 5.363 del 12/07/1999) y **COT art. 10** | Período mensual; declaración y pago "dentro de los quince (15) días continuos siguientes al período de imposición". Si el día 15 es inhábil (fin de semana, feriado nacional o día bancario no laborable), el primer día hábil siguiente. Igual para todos los terminales |
| **Ambos** | **COT art. 10**, parágrafo único ([14](14-codigo-organico-tributario.md)) | Los días en que los bancos no abren al público son inhábiles para declarar y pagar. Una fecha de la norma que caiga en uno de ellos se prorroga al primer día hábil siguiente: 9 casos en 2026, todos de especiales |

**Aclaración:** la **Providencia SNAT/2011/00071** (GO 39.795) no es un calendario: son las **normas generales de emisión de facturas**, que ya usamos para la marca "(E)" (ver [01](01-marco-legal.md) §8).

Vencimientos de los ordinarios en 2026:

| Período | Vence | Nota |
|---|---|---|
| dic-2025 | 15/01 | |
| ene | **18/02** | 15/02 es domingo; 16 y 17 son Carnaval |
| feb | **16/03** | 15/03 es domingo |
| mar a jun | 15/04, 15/05, 15/06, 15/07 | |
| jul | **17/08** | 15/08 es sábado |
| ago a oct | 15/09, 15/10 | |
| oct | **16/11** | 15/11 es domingo |
| nov, dic | 15/12, 15/01/2027 | |

Los días inhábiles están en `datos/calendario/dia_inhabil_2026.csv`: 15 feriados nacionales (LOTTT art. 184) y 10 días bancarios del calendario de SUDEBAN, que coincide exactamente con el histórico del BCV. **No incluye** los días no laborables que se decreten durante el año: si se decreta alguno, se agrega a ese archivo y se regenera.

## 2. Modelo

```
rif.validar(texto)            -- formato, tipo de persona, terminal y dígito verificador (módulo 11)
calendario.instrumento        -- normas fuente (con SHA-256 del PDF de la Gaceta)
calendario.condicion          -- condiciones que declara el contribuyente (no se deducen del RIF)
calendario.obligacion         -- 14 obligaciones: base legal, tipo, requiere / excluye condición, nota
calendario.vencimiento        -- 1.470 filas: obligación × terminal × fecha de la norma, fecha prorrogada (COT art. 10) y período
calendario.dia_inhabil        -- feriados nacionales y días bancarios no laborables (COT art. 10)
calendario.proximos_deberes(rif, tipo, condiciones[], desde = hoy en Caracas, límite)
```

| Condición | Efecto |
|---|---|
| `MINERIA_HIDROCARBUROS` | Activa el IVA mensual del art. 2 y quita la tabla a) (art. 5) |
| `SOLO_EXENTO_EXONERADO` | Activa la declaración informativa trimestral de IVA (art. 3) |
| `JUEGOS_AZAR`, `LOTERIA`, `GRANDES_PATRIMONIOS`, `ENTE_PUBLICO` | Activan las tablas d), e), h), i) |
| `EJERCICIO_IRREGULAR` | Activa la tabla g) y quita la anual del ejercicio 2025 (f) |

**Período declarado:** se informa solo donde la norma lo define. En la primera quincena es del 1 al 15 del mes del vencimiento; en la segunda, **del 16 al último día del mes anterior** (el error de calendarioapi); luego el ejercicio 2025 y el mes anterior para los ordinarios.

**Días bancarios:** la función devuelve `fecha` (la de la norma) y `fecha_limite` (la prorrogada por el COT art. 10 cuando corresponde), con un aviso que lo explica y recomienda cumplir antes. En 2026 hay 9 casos ([14](14-codigo-organico-tributario.md) §2). Ya no depende del módulo BCV.

## 3. Verificaciones ejecutadas (27/09/2026)

| # | Verificación | Resultado |
|---|---|---|
| Transcripción | 0 fechas inexistentes, 0 en fin de semana, un terminal por mes, quincenas coherentes | ✅ |
| Contraste independiente | 10 tablas idénticas a las de calendarioapi (transcritas por otra persona); relectura a 400 dpi de la tabla g) | ✅ |
| V1 | Conteos iguales al manifiesto | ✅ |
| V2 | Ningún vencimiento en sábado, domingo ni feriado nacional | ✅ |
| V3 | Una fecha por obligación, terminal y mes | ✅ |
| V4 | Los 10 terminales cubiertos en cada mes | ✅ |
| V5 | Quincenas: la 1ª desde el día 16, la 2ª hasta el 16, con el período correcto | ✅ |
| V6 | Ordinarios: día 15 o primer día hábil siguiente | ✅ |
| V7 | Tablas b), i) y art. 2 idénticas, como en la Gaceta | ✅ |
| T1 | RIF públicos válidos (J-00002961-0, G-20000303-0, J-07013380-5); dígito errado rechazado; formatos inválidos rechazados | ✅ |
| T2–T5 | Especial general, minería, ejercicio irregular y ordinario devuelven las obligaciones y períodos esperados | ✅ |
| T6 | Sin fecha, usa hoy (America/Caracas) | ✅ |
| T8 | Vencimiento del 19/01 (terminal 1, lunes bancario) → fecha límite 20/01 con aviso | ✅ |
| V8 | La prórroga existe solo si la fecha es inhábil y es el primer día hábil siguiente | ✅ |
| Contraste | Calendario bancario de SUDEBAN = días sin tasa del BCV (hasta el 28/09) | ✅ 0 diferencias |
| T13 | Una semilla sin la prórroga del 19/01 **aborta la carga** | ✅ |
| T9 | Condición desconocida → error; RIF inválido → error | ✅ |
| T10 | Un vencimiento alterado a domingo **aborta la carga** y no deja datos a medias | ✅ |

## 4. Reproducir

```bash
python3 herramientas/calendario/transcripcion_spe_2026.py datos/calendario/spe_2026
python3 herramientas/calendario/construir_calendario.py datos/calendario/spe_2026 \
    datos/calendario/dia_inhabil_2026.csv fuentes/calendario/GO-43283_Providencia-SNAT-2025-000091.pdf datos/calendario/semilla
herramientas/calendario/cargar_calendario.sh          # requiere docker compose up -d db
```

## 5. Pendientes

- **Pensiones 2026** (Contribución Especial para la Protección de las Pensiones): falta la Gaceta de su providencia (A41).
- **Declaración informativa trimestral (art. 3):** la providencia no dice qué meses de la tabla del art. 2 corresponden a cada trimestre; hoy se publican las 12 fechas con una nota (B21).
- **Ordinarios, otros tributos** (ISLR anual de personas naturales, etc.): fuera de este alcance (IVA).
- **Calendario 2027:** se agrega cuando el SENIAT publique la providencia.
