# 06 · Terminología y homologación SENIAT (premisa 10)

> El servicio aplica **únicamente al contexto venezolano**. Toda categoría, campo, mensaje y referencia debe usar los términos de la **Ley de IVA** (GO Ext. 6.507) y del **SENIAT**. Este documento es la referencia obligatoria para nombrar cosas en la base de datos, la API y la UI.

## 1. Reglas de homologación

1. **Términos legales literales.** Se usa el término de la ley aunque exista uno coloquial: "alícuota impositiva general" y no "IVA normal"; "consumo suntuario" y no "lujo"; "exento" y "exonerado" como conceptos **distintos**.
2. **Toda clasificación cita su fuente oficial:** norma, artículo, numeral, literal, número y fecha de la Gaceta Oficial. No se aceptan reglas sin base legal.
3. **Solo fuentes oficiales como autoridad:** Gaceta Oficial, providencias administrativas del SENIAT, decretos y el Arancel de Aduanas. Blogs y terceros sirven para ubicar información, nunca como base legal.
4. **Moneda de curso legal: bolívares (Bs.).** Los montos en divisas se convierten con el **tipo de cambio oficial del BCV** del día de la operación (art. 25).
5. **Formato local:** fechas `dd/mm/aaaa` en la UI (ISO `aaaa-mm-dd` en la API), decimales con coma en la UI y el símbolo "Bs.".
6. **Conceptos alineados con la declaración de IVA (Forma 30)**, para que el usuario sepa en qué renglón declarar cada operación (§4).
7. **Marca "(E)"** para exento, exonerado o no sujeto, según la Providencia SNAT/2011/00071.

## 2. Glosario

| Término oficial | Definición operativa | Fuente |
|---|---|---|
| Hecho imponible | Operación gravada: venta de bienes muebles corporales, importación definitiva, prestación de servicios | Ley IVA, arts. 3 y 4 |
| Bienes muebles corporales | Bienes físicos objeto de la venta | Ley IVA, art. 4 |
| Prestación de servicios | Actividad o servicio a cambio de una contraprestación | Ley IVA, art. 4 |
| Importación definitiva | Nacionalización de bienes en aduana | Ley IVA, art. 3 |
| Base imponible | Monto sobre el que se aplica la alícuota | Ley IVA, arts. 20–25 |
| Alícuota impositiva general | 16 %. El Ejecutivo la fija entre 8 % y 16,5 % | Ley IVA, arts. 27 y 63 |
| Alícuota reducida | 8 % para los bienes y servicios del art. 64 | Ley IVA, art. 64 |
| Alícuota adicional (consumo suntuario) | 15 % **adicional** a la general, para los bienes y servicios del art. 61 | Ley IVA, arts. 27 y 61 |
| Alícuota cero (exportación) | 0 % para las ventas de exportación. Da derecho a recuperar créditos fiscales. **Fuera del alcance de El Renglón** | Ley IVA, art. 27 |
| Exención | Dispensa del impuesto **establecida por la ley** | Ley IVA, arts. 17–19 |
| Exoneración | Dispensa **otorgada por el Ejecutivo mediante decreto**, temporal | Ley IVA, art. 66 |
| No sujeción | Operación que **no genera** el impuesto (bancos, seguros, trabajo dependiente…) | Ley IVA, art. 16 |
| Débito fiscal | IVA cobrado en la venta | Ley IVA, art. 28 |
| Crédito fiscal | IVA soportado en compras e importaciones | Ley IVA, arts. 29 y 33 |
| Contribuyente ordinario / formal | Tipos de contribuyente según sus ingresos | Ley IVA, arts. 5–8 |
| Unidad Tributaria (U.T.) | Unidad de valor para umbrales, p. ej. espectáculos exentos hasta 2 U.T. (art. 19.7) | Código Orgánico Tributario y providencia vigente |
| Consumo suntuario | Bienes y servicios de lujo definidos en el art. 61 | Ley IVA, art. 61 |
| Máquina fiscal / imprenta digital | Medios autorizados para emitir facturas | Providencias SNAT/2011/00071 y SNAT/2024/000102 |

## 3. Códigos de categoría en la API (homologados)

| Código API | Denominación oficial que muestra la UI |
|---|---|
| `EXENTO` | Operación exenta |
| `EXONERADO` | Operación exonerada (con decreto y vigencia) |
| `NO_SUJETO` | Operación no sujeta |
| `ALICUOTA_GENERAL` | Gravado por alícuota general (16 %) |
| `ALICUOTA_REDUCIDA` | Gravado por alícuota reducida (8 %) |
| `ALICUOTA_GENERAL_MAS_ADICIONAL` | Gravado por alícuota general más adicional (16 % + 15 %) |

## 4. Renglón de la declaración (Forma 30)

La respuesta incluye `concepto_declaracion` con el renglón que corresponde en la declaración de IVA:

| Categoría | `operacion = nacional` (quien vende) | `operacion = importacion` (quien importa) |
|---|---|---|
| EXENTO / EXONERADO / NO_SUJETO | Ventas internas no gravadas | Compras no gravadas y/o sin derecho a crédito fiscal |
| ALICUOTA_GENERAL | Ventas internas gravadas por alícuota general | Importaciones gravadas por alícuota general |
| ALICUOTA_GENERAL_MAS_ADICIONAL | Ventas internas gravadas por alícuota general más adicional | Importaciones gravadas por alícuota general más adicional |
| ALICUOTA_REDUCIDA | Ventas internas gravadas por alícuota reducida | Importaciones gravadas por alícuota reducida |

> **A verificar** contra el formulario vigente en el Portal Fiscal del SENIAT antes de publicarlo.
