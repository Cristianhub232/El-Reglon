# 04 · Preguntas abiertas y decisiones

## A. Para el equipo

### Resueltas

| # | Pregunta | Respuesta | Fecha |
|---|---|---|---|
| A1 | ¿Tipo de usuario? | Público general, cualquier persona (premisa 4) | 27/09/2026 |
| A2 | ¿Cómo se consume? | API, UI de consulta y Swagger (premisa 3) | 27/09/2026 |
| A3 | ¿Fuente de datos? | Arancel primero, después productos básicos (premisa 8). ✅ Arancel: semilla propia desde la Gaceta ([09](09-semilla-arancel.md)) | 27/09/2026 |
| A7 | ¿Bloquear si no hay clasificación? | No, solo consultar (premisa 6) | 27/09/2026 |
| A8 | ¿Identificación de productos? | APIs libres por código de barras (premisa 9) | 27/09/2026 |
| A9 | ¿Tecnología? | Next.js y **solo PostgreSQL** (nada de Oracle). Despliegue con Docker o PM2, por definir (premisa 7) | 27/09/2026 |
| A10 | ¿Contexto? | Solo Venezuela, homologado 100 % al SENIAT (premisa 10) | 27/09/2026 |
| A11 | ¿Open Food Facts? | Viable, se incorpora, con una segunda opción gratuita de respaldo | 27/09/2026 |
| A12 | ¿Nacional o importado? | Parámetro `operacion` **obligatorio** (`nacional` o `importacion`) | 27/09/2026 |
| A13 | ¿Códigos? | EAN y SKU, más todos los adicionales útiles (ver [03](03-modelo-de-clasificacion.md) §2) | 27/09/2026 |
| A15 | ¿Código arancelario? | Sí, como campo y con endpoint propio (se esperan pocos casos) | 27/09/2026 |
| A16 | ¿Autenticación? | API key (token) | 27/09/2026 |
| A17 | ¿Servicios? | Sí, dentro del alcance | 27/09/2026 |
| — | ¿Zonas grises? | Respuesta multiopción con condiciones. El usuario decide bajo su responsabilidad | 27/09/2026 |
| — | ¿Nombre? | **El Renglón** (se descartó OpenAgora) | 27/09/2026 |
| A25/A26 | ¿Servicios BCV y Arancel? | Se incorporan como **módulos y APIs propias** del ecosistema ([07](07-ecosistema.md)) | 27/09/2026 |
| A14 | ¿SKU? | Búsqueda directa que muestra **múltiples coincidencias**. El catálogo privado por empresa queda para más adelante | 27/09/2026 |
| A18 | ¿Precios? | `precio_compra` y `precio_venta` **opcionales**. La tasa viene del **módulo BCV propio** ([07](07-ecosistema.md) §3) | 27/09/2026 |
| A19 | ¿Quién emite las API keys? | La **UI de administración** | 27/09/2026 |
| A20 | ¿La UI edita el catálogo legal? | **Sí**, con auditoría | 27/09/2026 |
| A22 | ¿Exportación? | **Excluida** del servicio | 27/09/2026 |
| A29 | ¿Formato del "servicio de arancel categorizado"? | Era el repositorio **Rep-Arancel** (premisa 11). Se analizó ([08](analisis/08-analisis-rep-arancel.md)) y se reemplazó por una semilla propia desde la Gaceta ([09](09-semilla-arancel.md)); Rep-Arancel queda solo como contraste | 27/09/2026 |
| A30 | ¿Las APIs de BCV y Arancel son públicas? | **Sí**, como parte del ecosistema, con la misma API key y **permisos por módulo**: tasas BCV en USD y EUR; consulta y **detección** arancelaria | 27/09/2026 |
| A34 | ¿Módulos futuros? | Confirmados: calendario tributario, Unidad Tributaria, IGTF y validación del RIF. **Descartado por ahora:** retenciones de IVA ([07](07-ecosistema.md) §7) | 27/09/2026 |
| A28 | ¿Cómo obtiene hoy la tasa el servicio BCV del equipo? | Repositorio **tasas-bcv** (premisa 12): lee la portada de bcv.org.ve (NestJS, TypeScript). Se porta al módulo BCV con correcciones ([10](analisis/10-analisis-tasas-bcv.md)) | 27/09/2026 |
| A37 | ¿Histórico de tasas para el módulo BCV? | Se usan los **archivos oficiales del BCV** (2_1_2*_smc.xls): 417 fechas valor del 03/01/2025 al 28/09/2026, 21 monedas, 8 decimales ([11](11-historico-tasas-bcv.md)). Reemplazan al CSV de tasas-bcv | 27/09/2026 |
| A38 | ¿Histórico de tasas anterior a 2025? | **No por ahora**; se queda en 2025–2026 | 27/09/2026 |
| A39 | ¿Fuente del calendario tributario? | Repositorio calendarioapi (premisa 13), verificado contra la Providencia SNAT/2025/000091 (GO 43.283). Se usa la transcripción oficial ([12](analisis/12-analisis-calendarioapi.md)) | 27/09/2026 |
| A40 | ¿Calendario de IVA de contribuyentes ordinarios? | Reglamento General Ley IVA **art. 60**: 15 días continuos siguientes al mes; COT art. 10 si es inhábil. La Providencia 00071 es de **facturación**, no de calendario ([13](13-modulo-calendario.md)) | 27/09/2026 |
| A42 | ¿Alguien usa calendarioapi? | **No.** Se reemplaza por el módulo Calendario ([13](13-modulo-calendario.md)) | 27/09/2026 |
| A23 | ¿Qué efecto tienen los precios? | Van en todo request con valores opcionales; solo cambian la clasificación donde la ley usa el precio; **se guardan para minería de precios** ([03](03-modelo-de-clasificacion.md) §4.1–4.2) | 27/09/2026 |
| A24 | ¿En qué moneda llegan? | Bolívares o dólares (`moneda`), con conversión por la tasa BCV aplicable | 27/09/2026 |
| A43 | Minería de precios: ¿ubicación y visibilidad? | Campo `ubicacion` **opcional** (estado o ciudad). Los análisis son **internos**. Los términos de uso de la API se definirán más adelante | 27/09/2026 |
| A35 | ¿Guardar los preliminares del Arancel en la base? | **Sí**: Reglas Generales de Interpretación, Abreviaturas y Símbolos y Tabla de conversión, en tablas propias ([09](09-semilla-arancel.md) §2.1) | 27/09/2026 |

### Pendientes

| # | Pregunta | Por qué importa |
|---|---|---|
| A36 | 🔴 **Urgente:** ¿se aplica ya en el servicio tasas-bcv en producción (BNPL) la corrección del parser para tasas de 1.000 o más? El EUR está en 976,90 | Si no, el servicio dejará de actualizar EUR y USD ([10](analisis/10-analisis-tasas-bcv.md) §2.1) |
| A31 | ¿Puede conseguirse el **PDF oficial** (Imprenta Nacional o TSJ) de las Gacetas 6.804, 6.890, 6.918, 6.952, 43.111 y 6.902? Las usadas son copias de terceros (Tradex, aduaneros.net) | Homologación completa (premisa 10); el pipeline se regenera con las oficiales |
| A32 | Revisión manual del **Decreto 5.122** (subcapítulo V del cap. 98, hidrocarburos): 177 filas extraídas con 5 dudosas | Completar la semilla vigente |
| A33 | Texto oficial de la **Resolución DM 012/2025** (GO Ext. 6.902): subpartidas 9836.00.00.4 y .41 | Completar la semilla vigente |
| A27 | *(Valor por defecto aplicado: 60/min, configurable por clave)* ¿Otro límite por defecto para una API key nueva? | Configuración inicial |
| A41 | Calendario de la **Contribución para la Protección de las Pensiones 2026**: ¿Providencia SNAT/2025/000093 o 000094? Hace falta su Gaceta para verificar sus 120 fechas | Módulo Calendario |
| A21 | ¿La UI de consulta es pública (con una key interna) o también exige key o inicio de sesión? | Seguridad de la UI |

## B. Para el asesor tributario (zonas grises de la ley)

Mientras no se resuelvan, estas dudas se entregan como **respuesta multiopción**.

| # | Duda | Norma |
|---|---|---|
| B1 | ¿"Estado natural" incluye vegetales lavados, picados, congelados o empacados? | Art. 18.1.a |
| B2 | ¿Qué productos cuentan como "pan"? (pan dulce, tostadas, galletas, tortas) | Art. 18.1.e |
| B3 | ¿El atún en aceite es gravado? ¿Qué significa "presentación natural"? | Art. 18.1.k |
| B4 | ¿Yogur, leche saborizada, leche UHT o condensada quedan dentro de "leche"? | Art. 18.1.m |
| B5 | ¿Pescados y mariscos frescos van al 8 % como "carnes" o al 16 %? | Art. 64.1.c |
| B6 | ¿Cómo se documenta el "uso industrial" del azúcar y el papelón? | Art. 18.1.h |
| B7 | ¿Suplementos, vitaminas y productos naturales cuentan como "medicamentos"? ¿Cuál es el formato del registro sanitario? | Art. 18.3 |
| B8 | ¿"Animales con fines recreativos" incluye las mascotas? | Art. 61.1.k |
| B9 | ¿El umbral en USD se compara con el precio unitario antes o después de impuestos y descuentos? | Art. 61 |
| B10 | ¿Existe una codificación oficial del SENIAT para los productos exentos? | Art. 18, parágrafo único |
| B11 | ¿Está vigente algún decreto que fije la alícuota adicional por pago en divisas? | Arts. 27 y 62 |
| B12 | Confirmar la Gaceta del Decreto 5.207 (43.292 o 42.292) y su vencimiento | Combustibles |
| B13 | ¿Cómo se aplica una exoneración parcial (90 %) del IVA de importación? | Decreto 5.197 |
| B14 | ¿Dónde está la frontera entre "repuesto" (16 %) y "accesorio no incorporado en el ensamblaje" (31 % si ≥ US$ 100)? | Art. 61.1.h |
| B15 | Validar el borrador de la relación entre códigos arancelarios y artículos de la ley | [05](05-fuentes-y-diccionario.md) §2 |
| B16 | ¿Cuál es el valor vigente de la U.T. y en qué providencia se fijó? | Art. 19.7 |
| B17 | ¿Los servicios importados (prestados desde el exterior) mantienen las exenciones del art. 19? | Arts. 15 y 19 |
| B18 | Confirmar los renglones de la Forma 30 contra el formulario vigente | [06](06-terminologia-seniat.md) §4 |
| B19 | Arancel: 0901.12.00.00 trae régimen "5,612" en la GO 6.804. ¿Es "5,6,12"? | [09](09-semilla-arancel.md) §5 |
| B21 | Providencia 000091 art. 3 (informativa trimestral de IVA): ¿qué meses de la tabla del art. 2 corresponden a cada trimestre? | [13](13-modulo-calendario.md) §5 |
| B22 | COT art. 10 parágrafo único: ¿la prórroga por día bancario no laborable aplica a las fechas fijas de la providencia de especiales? (9 casos en 2026) | [14](14-codigo-organico-tributario.md) §2 |
| B20 | Arancel: ¿qué código correcto correspondía a la fila "8701.29.00.00" impresa dentro del bloque 98.01? (el Decreto 5.103 la eliminó) | [09](09-semilla-arancel.md) §5 |
