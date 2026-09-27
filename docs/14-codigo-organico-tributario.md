# 14 · Código Orgánico Tributario (COT) y su impacto en El Renglón

> **Norma:** Decreto Constituyente mediante el cual se dicta el Código Orgánico Tributario, **GO Ext. N° 6.507 del 29/01/2020** (la misma edición de la reforma de la Ley de IVA). Deroga el COT de 2014 (GO Ext. 6.152).
> **Fuente consultada:** PDF de la Asamblea Nacional (`fuentes/cot/GOE-6507_Codigo-Organico-Tributario.pdf`, 36 págs., 352 artículos). Consultado el 27/09/2026. Las citas son textuales.

El COT es la norma **general** de todos los tributos nacionales: plazos, pago, intereses, sanciones y prescripción. No define alícuotas (eso lo hace cada ley, como la de IVA), pero **condiciona cómo se aplican** en el tiempo.

## 1. Artículos que afectan a los módulos

| Art. | Qué dice | Módulo | Qué se hizo |
|---|---|---|---|
| **3**, Parágrafo Tercero | La Administración reajusta la **Unidad Tributaria**; en tributos por períodos distintos al anual, la U.T. aplicable es "la que esté vigente para el inicio del período" | IVA (umbral de 2 U.T. del art. 19.7), futuro módulo U.T. | Se documenta la regla para el módulo U.T. |
| **10** | "Los plazos por años o meses serán continuos…"; "Los plazos establecidos por días se contarán por días hábiles, salvo que la ley disponga que sean continuos"; "los términos y plazos que vencieran en día inhábil… se entienden **prorrogados hasta el primer día hábil siguiente**" | Calendario | ✅ Aplicado |
| **10**, Parágrafo Único | "Igualmente se consideran inhábiles, **a los solos efectos de la declaración y pago** de las obligaciones tributarias, **los días en que las instituciones financieras** autorizadas para actuar como oficinas receptoras de fondos nacionales **no estuvieren abiertas al público**, conforme lo determine su calendario anual de actividades" | Calendario | ✅ **Aplicado:** los días bancarios no laborables son inhábiles (§2) |
| **55 y 56** | Prescripción de **6 años** (verificar, sancionar, cobrar, recuperar); **10 años** si no se declaró, no se inscribió, no se llevó contabilidad, etc. | Auditoría de El Renglón | Conservar el historial de clasificaciones y tasas al menos 6 años (hoy el requisito es 10, RNF-04) |
| **66** | Intereses moratorios: **1,2 veces la tasa activa bancaria** promedio de los 6 principales bancos (calculada por el BCV), desde el vencimiento hasta el pago | Futuro: calculadora de pago tardío | Pendiente (necesita la tasa activa que publica el SENIAT) |
| **91 y 92** | Las multas se expresan en "el tipo de cambio oficial de la **moneda de mayor valor**, publicado por el Banco Central de Venezuela"; las porcentuales se convierten a esa moneda al momento del ilícito y se pagan con la tasa vigente al pagar | BCV | ✅ Función `bcv.moneda_mayor_valor(fecha)`: hoy es el **EUR** (976,90 Bs.) |
| **101** | Ilícitos de **facturación**: no emitir factura; emitirla "con prescindencia total o parcial de los requisitos" (p. ej. sin marcar la "(E)" de los exentos); multas de **100 a 150 veces** la moneda de mayor valor y **cierre de 5 a 10 días** | IVA | Refuerza que la salida de la clasificación (alícuota y marca "(E)") debe ser correcta y trazable |
| **110** | Pago con **retraso**: multa de **0,28 % por día** hasta 100 % dentro del primer año; +50 % después de 1 año; +150 % después de 2 años. No aplica con prórroga | Futuro: calculadora de pago tardío | Pendiente |

## 2. Días bancarios no laborables en el calendario tributario

Por el art. 10, parágrafo único, un vencimiento que cae en un día en que los bancos no abren **se prorroga al primer día hábil siguiente**.

- **Calendario bancario 2026 (SUDEBAN):** 22 días, de los cuales 13 son lunes o días bancarios. Coincide **exactamente** con los 15 días hábiles sin tasa del histórico del BCV hasta el 28/09/2026: dos fuentes independientes. Está en `datos/calendario/dia_inhabil_2026.csv`.
- **Contribuyentes especiales:** 9 fechas de la Providencia 000091 caen en lunes bancarios. Se conserva la fecha de la norma y se agrega la fecha prorrogada:

| Fecha de la norma | Prorrogada | Obligación y terminal |
|---|---|---|
| 12/01 | 13/01 | IVA 2ª quincena, RIF 7 |
| 19/01 | 20/01 | IVA 1ª quincena, RIF 1 |
| 18/05 | 19/05 | IVA 1ª quincena, RIF 1 |
| 08/06 | 09/06 | IVA 2ª quincena, RIF 5 |
| 29/06 | 30/06 | IVA 1ª quincena, RIF 0 |
| 14/09 | 15/09 | IVA 2ª quincena, RIF 0 |
| 26/10 | 27/10 | IVA 1ª quincena, RIF 8 |
| 23/11 | 24/11 | IVA 1ª quincena, RIF 3 |
| 14/12 | 15/12 | IVA 2ª quincena, RIF 9 |

- **Contribuyentes ordinarios:** en 2026 ningún día 15 cae en un día bancario no laborable, así que sus fechas no cambian. La regla ya los contempla para otros años.
- **Criterio conservador:** la respuesta muestra ambas fechas y recomienda cumplir en la fecha de la norma. La prórroga se presenta como un derecho del contribuyente, que debe confirmar su asesor (B22).

## 3. Pendientes

- **B22:** confirmar con el asesor que la prórroga del art. 10 aplica a las fechas fijas de la providencia de especiales cuando coinciden con días bancarios no laborables.
- **Calculadora de pago tardío** (arts. 66 y 110): necesita la tasa activa bancaria mensual que publica el SENIAT.
- **Días no laborables por decreto:** el art. 10 también los hace inhábiles. Hay que agregarlos a `dia_inhabil_2026.csv` cuando se decreten.
