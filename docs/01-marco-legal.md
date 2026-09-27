# 01 · Marco legal: IVA aplicable a productos en Venezuela

> **Levantado el:** 27/09/2026
> **Fuente principal:** texto único del *Decreto con Rango, Valor y Fuerza de Ley que establece el Impuesto al Valor Agregado*, reimpreso con la reforma del Decreto Constituyente publicado en **Gaceta Oficial Extraordinaria N° 6.507 del 29/01/2020** (vigente 60 días después de su publicación, art. 72).
> **Importante:** este documento es un levantamiento técnico, no asesoría legal. Cada regla debe ser validada por el asesor tributario antes de pasar a producción.

---

## 1. Normas que afectan al servicio

| Norma | Qué regula | Relevancia para el servicio |
|---|---|---|
| **Ley de IVA** (GO Ext. 6.507, 29/01/2020) | Alícuotas, exenciones, no sujeción, bienes suntuarios | Núcleo de las reglas |
| **Decreto N° 5.196** (GO Ext. 6.952, 31/12/2025) | Según su texto oficial: el art. 1 **suspende, sin fecha de término**, la exención de IVA a la importación de los bienes del art. 18 (art. 17, num. 1); el art. 16 limita **solo las exoneraciones** del art. 2 (importaciones con certificado COMEX) hasta el **31/12/2026**; deroga el Decreto 5.145 (GO Ext. 6.918); vigente desde su publicación | Solo si se clasifican importaciones. **Las ventas nacionales siguen exentas** |
| **Decreto N° 5.197** (GO Ext. 6.952, 31/12/2025) | Exoneraciones aduaneras generales hasta el 31/12/2026: 90 % del impuesto de importación y 90 % del IVA de importación para 1.351 códigos arancelarios | Solo para importaciones |
| **Decreto N° 5.207** (GO 43.292, 09/01/2026)¹ | Exonera del IVA la importación y la venta nacional de combustibles derivados de hidrocarburos y de aditivos para gasolina, por un año | Solo si se venden combustibles o aditivos |
| **Providencia SNAT/2011/00071** (GO 39.795, 08/11/2011) | Normas generales de facturación. Exige la marca **"(E)"** en los ítems exentos, exonerados o no sujetos | Formato de salida del servicio |
| **Providencia SNAT/2024/000102** (GO 43.032, 19/12/2024) | Facturación por medios digitales (imprentas digitales). Obligatoria desde el 01/03/2025 para quien la adopte. Conservación de datos durante 10 años | Integración y retención de datos |
| **Código Orgánico Tributario** (GO Ext. 6.507, 29/01/2020) | Norma general de los tributos: plazos y días inhábiles (art. 10), intereses (66), multas en la moneda de mayor valor del BCV (91–92), ilícitos de facturación (101), retraso (110), prescripción (55–56) | Calendario, BCV y trazabilidad. Ver [14](14-codigo-organico-tributario.md) |
| **Ley del IGTF** (3 % sobre pagos en divisas) | Grava el **pago**, no el producto | Fuera del alcance de la clasificación, pero el POS la necesita |

¹ Una fuente (KPMG) cita la GO N° 42.292, lo que parece un error de transcripción. Hay que confirmarlo.

---

## 2. Alícuotas vigentes

| Categoría | Alícuota | Base legal | Quién la puede cambiar |
|---|---|---|---|
| **Exento** | No se causa el impuesto | Art. 17 (importaciones), art. 18 (bienes), art. 19 (servicios) | Solo una reforma de ley |
| **Reducida** | **8 %** | Art. 64 | El Ejecutivo, dentro de los límites del art. 27 |
| **General** | **16 %** | Art. 63 | El Ejecutivo, entre 8 % y 16,5 % (art. 27) |
| **General + adicional suntuaria** | **16 % + 15 % = 31 %** | Arts. 27 y 61 | El Ejecutivo, con la adicional entre 15 % y 20 % (art. 27) |
| **Exportación** *(fuera del alcance del servicio)* | **0 %** | Art. 27 | — |
| **No sujeto** | No aplica | Art. 16 | Solo una reforma de ley |
| **Exonerado** | Total o parcial (p. ej. 90 %) | Art. 66 y el decreto correspondiente | El Ejecutivo, **con vigencia temporal** |
| Adicional por pago en divisas | Entre 5 % y 25 % | Arts. 27 y 62 | Requiere un decreto que la fije. **No se ubicó ningún decreto vigente**: hay que verificarlo con el asesor |

### Consecuencias para el diseño

- **"Exento" no es lo mismo que "tasa 0 %".** Una venta exenta no genera débito fiscal y no da derecho a crédito fiscal. La exportación está gravada a tasa 0 % y sí permite recuperar créditos. El equipo decidió **excluir la exportación** del servicio (27/09/2026), así que en El Renglón un 0 % siempre significa exento, exonerado o no sujeto.
- **La tasa de lujo son dos componentes, no una tasa de 31 %.** Se guardan por separado, 16 % general más 15 % adicional, porque se declaran y facturan desglosados y cada uno puede cambiar por decreto de forma independiente.
- **Las alícuotas cambian por decreto** (art. 27) y las exoneraciones vencen. Por eso los porcentajes son **datos versionados con vigencia**, nunca constantes en el código.

---

## 3. Bienes exentos: ventas (art. 18)

**Numeral 1. Alimentos y productos para consumo humano:**

| Lit. | Producto | Condición literal / zona gris |
|---|---|---|
| a | Productos del reino vegetal **en su estado natural** considerados alimentos para consumo humano; semillas certificadas; material base para reproducción animal; insumos biológicos agrícolas y pecuarios | ¿"Estado natural" incluye lo picado, lo congelado o lo deshidratado? |
| b | Especies avícolas, huevos fértiles de gallina, pollitos, pollitas y pollonas para cría, reproducción y producción de carne; huevos de gallina | |
| c | Arroz | |
| d | Harina de origen vegetal, incluidas las sémolas | |
| e | Pan y pastas alimenticias | ¿Qué cuenta como "pan"? (pan dulce, tortas, galletas) |
| f | Huevos de gallina | |
| g | Sal | |
| h | Azúcar y papelón, **excepto los de uso industrial** | Depende del **uso o del comprador**, no solo del producto |
| i | Café tostado, molido o en grano | ¿Café instantáneo o mezclas? |
| j | Mortadela | Los demás embutidos pagan tarifa general |
| k | Atún enlatado **en presentación natural** | ¿El atún en aceite queda gravado? |
| l | Sardinas enlatadas **con presentación cilíndrica hasta 170 g** | Depende de la forma del envase y del peso neto |
| m | Leche cruda, pasteurizada, en polvo, modificada, maternizada o humanizada, y sus fórmulas infantiles, incluidas las de soya | ¿Yogur, leche saborizada, leche larga duración? |
| n | Queso blanco | Los demás quesos pagan tarifa general |
| ñ | Margarina y mantequilla | |
| o | Carnes de pollo, ganado bovino y porcino **en estado natural, refrigeradas, congeladas, saladas o en salmuera** | Las carnes procesadas o ahumadas pagan tarifa general. Las otras carnes pagan 8 % (ver §4) |
| p | Mayonesa | |
| q | Avena | |
| r | Animales vivos destinados al matadero (bovino y porcino) | |
| s | Ganado bovino y porcino para la cría | |
| t | Aceites comestibles, **excepto el de oliva** | |

**Numerales 2 al 11:**

2. Fertilizantes y el gas natural usado como insumo para fabricarlos.
3. Medicamentos y agroquímicos, y los principios activos usados exclusivamente para fabricarlos, incluidas vacunas, sueros, plasmas y sustancias terapéuticas o profilácticas, para uso humano, animal y vegetal. *Zona gris: suplementos, productos naturales, parafarmacia.*
4. Vehículos adaptados para personas con discapacidad, sillas de ruedas, marcapasos, catéteres, válvulas, órganos artificiales y prótesis.
5. Diarios, periódicos y el papel para sus ediciones.
6. Libros, revistas y folletos, y los insumos de la industria editorial. *Cuadernos y útiles escolares no aparecen en la lista.*
7. Maíz para elaborar alimentos de consumo humano.
8. Maíz amarillo para elaborar alimentos concentrados para animales.
9. Aceites vegetales, refinados o no, usados exclusivamente como insumo para aceites comestibles, mayonesa y margarina.
10. Minerales y alimentos concentrados para los animales de los literales b), r) y s), y sus materias primas exclusivas.
11. Sorgo y soya.

> **Parágrafo único del art. 18:** "La Administración Tributaria podrá establecer la codificación correspondiente a los productos especificados en este artículo". **Pendiente:** averiguar si el SENIAT publicó una codificación oficial. Si existe, es la fuente ideal para las reglas.

**Art. 65 (transitorio):** mientras no rijan los decretos de exoneración, también están exentos: vehículos, naves, aeronaves, locomotoras y vagones para transporte público de personas; maquinaria y equipo agrícola para la producción primaria, con sus repuestos; y buques con sus insumos para la industria naval.

---

## 4. Bienes con alícuota reducida del 8 % (art. 64)

1. Importación y venta de estos alimentos:
   - a. Ganado caprino, ovino y especies menores destinados al matadero.
   - b. Ganado caprino, ovino y especies menores para la cría.
   - c. Carnes en estado natural, refrigeradas, congeladas, saladas o en salmuera, **salvo las del art. 18.1.o** (pollo, bovino y porcino, que están exentas). *En la práctica: chivo, cordero, conejo y similares. ¿Aplica a pescados y mariscos? Hay que confirmarlo.*
   - d. Mantecas.
2. Minerales y alimentos para los animales del punto 1.a y 1.b, y sus materias primas exclusivas.
3. Servicios profesionales prestados al Poder Público (servicios, no bienes).
4. Transporte aéreo nacional de pasajeros (servicio).

---

## 5. Bienes y servicios suntuarios: 16 % + 15 % adicional (art. 61)

La alícuota adicional se calcula **sobre la misma base imponible** que la general.

**Bienes** (venta, operaciones asimiladas o importación):

| Lit. | Bien | Umbral |
|---|---|---|
| a | Vehículos automóviles | Valor en aduana o precio de fábrica **≥ US$ 40.000** |
| b | Motocicletas | **≥ US$ 20.000** |
| c | Aeronaves civiles y sus accesorios, para exhibición, publicidad, instrucción, recreación, deporte o uso particular | Sin umbral |
| d | Buques recreativos, deportivos o de uso particular | Sin umbral |
| e | Máquinas y mesas de juegos de envite o azar | Sin umbral |
| f | **Joyas y relojes** | Precio **≥ US$ 300** |
| g | **Armas, sus accesorios y proyectiles** | Sin umbral |
| h | **Accesorios para vehículos** no incorporados en el ensamblaje | Precio **≥ US$ 100** |
| i | Obras de arte y antigüedades | **≥ US$ 40.000** |
| j | Prendas y accesorios de vestir de cuero o pieles naturales | **≥ US$ 10.000** |
| k | **Animales con fines recreativos o deportivos** | Sin umbral. *¿Incluye mascotas? Hay que confirmarlo* |
| l | **Caviar y sus sucedáneos** | Sin umbral |

**Servicios:** membresías y cuotas de clubes, restaurantes, centros nocturnos o bares de acceso restringido; arrendamiento de buques o aeronaves recreativas; servicios prestados por cuenta de terceros mediante mensajería de texto u otros medios tecnológicos.

### Consecuencias para el diseño

- Varios literales dependen del **precio en USD en el momento de la venta**. El mismo SKU puede ser 16 % o 31 % según su precio. Si el precio está en bolívares, se convierte con el **tipo de cambio oficial del BCV** del día (art. 25). La comparación es **mayor o igual** (≥).
- Literales como la h) (accesorios de vehículos ≥ US$ 100), la f) (relojes ≥ US$ 300) o la g) (armas y municiones) afectan a comercios comunes: autopartes, relojerías y artículos deportivos.

---

## 6. Servicios (dentro del alcance)

### 6.1 Servicios exentos (art. 19), texto completo

| Num. | Servicio exento | Condición para la respuesta multiopción |
|---|---|---|
| 1 | Transporte terrestre y acuático nacional de pasajeros | El aéreo nacional va al 8 % (art. 64.4) |
| 2 | Transporte de mercancías | |
| 3 | Servicios educativos de instituciones inscritas en los ministerios de Educación, Cultura, Deporte y Educación Superior | Solo si la institución está **inscrita** |
| 4 | Hospedaje, alimentación y accesorios a estudiantes, ancianos, personas con discapacidad o enfermas, dentro de instituciones dedicadas exclusivamente a ellos | Solo en esas instituciones |
| 5 | Entradas a parques nacionales, zoológicos, museos y centros culturales | Solo si el ente es **sin fines de lucro y exento de ISLR** |
| 6 | Servicios médico-asistenciales, odontológicos, de cirugía y hospitalización | |
| 7 | Entradas a espectáculos artísticos, culturales y deportivos | Solo si el valor es **≤ 2 U.T.** |
| 8 | Alimentación a alumnos y trabajadores en comedores y cantinas de escuelas o empresas, en sus propias sedes | Solo en esas sedes |
| 9 | Suministro de electricidad | Solo si es **residencial** |
| 10 | Telefonía nacional por teléfonos públicos | |
| 11 | Suministro de agua | Solo si es **residencial** |
| 12 | Aseo urbano | Solo si es **residencial** |
| 13 | Suministro de gas, directo o por bombonas | Solo si es **residencial** |
| 14 | Transporte de combustibles derivados de hidrocarburos | |
| 15 | Crianza de ganado bovino, caprino, ovino, porcino, aves y especies menores, incluida la reproducción y producción | |

### 6.2 Servicios al 8 % (art. 64)

- Num. 3: servicios profesionales prestados **al Poder Público** (profesiones que no impliquen actos de comercio y comporten trabajo predominantemente intelectual). Depende de **quién es el cliente**.
- Num. 4: transporte aéreo nacional de pasajeros.

### 6.3 Servicios de consumo suntuario (art. 61, num. 2): 16 % + 15 %

- Membresías y cuotas de mantenimiento de restaurantes, centros nocturnos o bares de acceso restringido.
- Arrendamiento o cesión de uso de buques recreativos, deportivos o de uso particular, y de aeronaves civiles para exhibición, publicidad, instrucción, recreación, deporte o uso particular.
- Servicios prestados por cuenta de terceros a través de mensajería de texto u otros medios tecnológicos.

### 6.4 Operaciones no sujetas (art. 16)

Importaciones no definitivas; ventas de bienes intangibles (acciones, bonos, títulos valores); préstamos en dinero; operaciones de bancos e instituciones financieras; operaciones de seguros y reaseguros; servicios bajo relación de dependencia (trabajo); y actividades de los entes de administración tributaria.

### 6.5 Otros servicios

Cualquier otro servicio prestado o aprovechado en el país paga la **alícuota general del 16 %** (arts. 3, 15 y 63).

---

## 7. Importaciones (si entran en el alcance)

- El art. 17, num. 1, exime la importación de los bienes del art. 18, **pero el Decreto 5.196 suspende esa exención sin fecha de término** (solo las exoneraciones con certificado COMEX de su art. 2 vencen el 31/12/2026). El bien se vende exento, pero su importación paga IVA, salvo que tenga un certificado de exoneración del COMEX.
- El Decreto 5.197 exonera el 90 % del IVA de importación para 1.351 códigos arancelarios. Es una **exoneración parcial**, así que el modelo debe admitir porcentajes y no solo "sí/no".
- Para cruzar un producto con estos decretos hace falta su **código arancelario** (Arancel de Aduanas, basado en NANDINA y el Sistema Armonizado).

---

## 8. Facturación: qué debe producir el servicio

- **Marca "(E)"** junto a la descripción o al precio de los ítems exentos, exonerados o no sujetos, con un espacio en blanco antes (Providencia 0071).
- **Base imponible e impuesto desglosados por alícuota** (general, reducida y adicional).
- Si la operación se paga en divisas, la factura muestra el monto en la moneda de pago y su equivalente en bolívares, con el tipo de cambio aplicado (art. 69).
- Las máquinas fiscales trabajan con "tasas" preconfiguradas: Exento, Tasa 1, Tasa 2 y Tasa 3. El servicio debe devolver el código de tasa que corresponde. El mapeo exacto depende del fabricante o protocolo (ver [03-modelo-de-clasificacion.md](03-modelo-de-clasificacion.md)).

---

## 9. Fuentes consultadas

- Gaceta Oficial Ext. N° 6.507 (29/01/2020), texto oficial en PDF: https://www.asambleanacional.gob.ve/storage/documentos/leyes/decreto-constituyente-de-reforma-parcial-del-decreto-con-rango-valor-y-fuerza-de-ley-que-establece-el-impuesto-al-valor-agregado-20220204234747.pdf
- Decreto 5.196, suspensión de exenciones a la importación: https://gerenciaytributos.blogspot.com/2025/07/decreto-suspension-exencion-IVA-importacion.html y https://www.grantthornton.com.ve/globalassets/1.-member-firms/venezuela/2026/ni-resumen-decreto-de-suspension-de-exenciones-del-iva.pdf
- Decreto 5.197, exoneraciones aduaneras 2026: https://lega.law/lega-informa/exoneraciones-aduanas-2026/
- Decreto 5.207, combustibles: https://finanzasdigital.com/exoneracion-impuestos-combustibles-venezuela-2026/ y https://kpmg.com/ve/es/insights/2026/01/sintesis-legal-01-2026.html
- Providencia SNAT/2011/00071: https://tributos.ivecofi.net/informacion/legislacion/providencias/pa-2011-71
- Providencia SNAT/2024/000102: https://accesoalajusticia.org/regulacion-del-uso-de-medios-digitales-para-la-emision-de-facturas-y-otros-documentos-fiscales/
- IGTF: https://galac.com/galac-blog/reforma-del-igtf-impuesto-a-las-transacciones-en-divisas-y-criptomonedas/
