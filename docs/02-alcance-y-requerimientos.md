# 02 · Alcance y requerimientos (El Renglón)

> Actualizado según las [premisas](00-premisas.md) y las decisiones confirmadas el 27/09/2026.

## 1. Objetivo

Ofrecer una **API de consulta** protegida con **API key**, más una UI sencilla y documentación Swagger, **exclusiva para el contexto venezolano** y homologada a la terminología del SENIAT.

Cualquier persona puede enviar el **nombre de un bien o servicio**, uno o varios **códigos** y la **operación** (`nacional` o `importacion`). La API responde cómo tributa en IVA:

- la categoría;
- las alícuotas desglosadas;
- la base legal con su Gaceta Oficial;
- el renglón de la Forma 30.

Cuando la ley deja dudas, devuelve **varias opciones con sus condiciones** y **el usuario decide bajo su responsabilidad**.

El servicio **orienta, no bloquea**.

## 2. Principios de diseño

1. **El código identifica el producto, pero no dice cómo tributa.** La categoría fiscal sale de *qué es* el bien o servicio.
2. **La operación siempre cuenta.** `operacion` es obligatorio porque el mismo bien puede estar exento en la venta nacional y gravado en la importación (Decreto 5.196).
3. **Multiopción en zonas grises.** El servicio no elige por el usuario. Muestra cada opción con su condición y su base legal.
4. **Homologación SENIAT.** Se usan términos legales literales, fuentes oficiales, Bs. y el tipo de cambio BCV (ver [06](06-terminologia-seniat.md)).

## 3. Actores

| Actor | Rol |
|---|---|
| Usuario (comerciante, contador, desarrollador) | Consulta por la UI o por la API con su API key. Decide entre las opciones cuando la respuesta es multiopción |
| Sistemas externos (POS, ERP, e-commerce) | Consumen la API con su API key |
| Curador del diccionario (equipo o asesor tributario) | Mantiene las reglas, regex, exclusiones y mapeos de códigos arancelarios |
| Administrador | Desde la UI de administración: genera y revoca API keys, y edita el catálogo legal (reglas, alícuotas, decretos, U.T.) |

## 4. Alcance

**Incluido (MVP):**

- **Bienes y servicios**: arts. 16, 17, 18, 19, 61, 63 y 64.
- Operaciones `nacional` e `importacion`, con los Decretos 5.196, 5.197 y 5.207.
- Entrada por nombre y por códigos: EAN-13, EAN-8, UPC-A, UPC-E, GTIN-14/DUN-14, ISBN, ISSN, códigos GS1 de peso variable, PLU, código arancelario, SKU y registro sanitario.
- **Endpoint dedicado para el código arancelario.**
- Diccionario arancelario, diccionario de productos básicos y catálogo de servicios.
- Identificación por código de barras: Open Food Facts como principal y respaldo gratuito como segunda opción, con caché local.
- Respuesta multiopción para zonas grises y condiciones.
- API key, límite de peticiones por key, UI de consulta, **UI de administración** y Swagger.
- **Módulos propios BCV y Arancel** dentro del ecosistema, con sus propias APIs. BCV: se migra la lógica del servicio existente del equipo. Arancel: semilla propia extraída de la Gaceta Oficial ([09](09-semilla-arancel.md)).
- Precios opcionales de compra y venta para evaluar umbrales y calcular montos.

**Excluido por decisión del equipo (27/09/2026):**

- **Ventas de exportación** (alícuota 0 %, art. 27). `operacion` solo admite `nacional` e `importacion`.

**Fuera del MVP:**

- Catálogos privados por empresa (SKU propios).
- Clasificación asistida por IA.
- IGTF y alícuota por pago en divisas, que dependen del medio de pago.

## 5. Requerimientos funcionales

| ID | Requerimiento |
|---|---|
| RF-01 | **Clasificar por nombre:** normalizar el texto (minúsculas, sin acentos, unidades como atributos) y buscar en el diccionario con regex de inclusión y exclusión. Si no hay coincidencia, hacer búsqueda aproximada |
| RF-02 | **Detectar el tipo de código** automáticamente (ver [03](03-modelo-de-clasificacion.md) §2), validar su dígito verificador y usarlo como señal |
| RF-03 | **Identificar por código de barras:** caché local → Open Food Facts (y proyectos hermanos) → fuente de respaldo. Todo resultado se guarda en caché |
| RF-04 | **Código arancelario:** como campo de la clasificación general y en un **endpoint propio**. Gana la regla del prefijo más largo |
| RF-05 | **`operacion` obligatorio** (`nacional` o `importacion`). Se aplican la suspensión del Decreto 5.196 y las exoneraciones de los Decretos 5.197 y 5.207 según su vigencia. La respuesta repite la operación y avisa si la otra operación daría otro resultado |
| RF-06 | **Servicios:** catálogo de servicios con arts. 16, 19, 61.2 y 64.3–4. Las condiciones (residencial, cliente del Poder Público, ≤ 2 U.T., institución inscrita, etc.) se resuelven con la multiopción |
| RF-07 | **Multiopción:** en zona gris o con condiciones no verificables, la respuesta trae `opciones[]`, cada una con categoría, alícuotas, **condición en lenguaje claro**, base legal y renglón de la Forma 30, ordenadas de la más a la menos probable. Incluye el aviso: *"La selección corresponde al usuario bajo su responsabilidad y análisis"* |
| RF-08 | **Precios en todo request** (`precio_compra`, `precio_venta`, `moneda` `VES` o `USD`), con valores opcionales (`null`). Se convierten con la tasa BCV aplicable; solo influyen en la clasificación donde la ley usa el precio (art. 61 en USD, art. 19.7 en U.T.); si llegan, se calculan base imponible, débito y crédito fiscal. Ver [03](03-modelo-de-clasificacion.md) §4.1 |
| RF-09 | **Homologación SENIAT:** códigos de categoría, textos, base legal y `concepto_declaracion` según [06](06-terminologia-seniat.md) |
| RF-10 | **Alícuotas, U.T. y decretos versionados** por vigencia. Parámetro opcional `fecha` para consultas históricas |
| RF-11 | **Endpoints de referencia:** alícuotas, base legal, diccionario, servicios, glosario |
| RF-12 | **API keys desde la UI de administración:** crear, revocar, poner límite por minuto y ver el último uso. El token se muestra **una sola vez** al crearlo. Swagger con botón *Authorize* |
| RF-13 | **UI de consulta:** formulario (nombre, códigos, operación, precio de compra y de venta) y resultado con las coincidencias, las opciones y su base legal |
| RF-14 | **Registro de consultas** `no_determinado` y `condicionado`, para que el curador mejore el diccionario |
| RF-15 | **Búsqueda directa por SKU con múltiples coincidencias:** el SKU (o un código no reconocido) se busca de forma exacta y parcial en la caché, y el nombre de forma aproximada. La respuesta trae `coincidencias[]`: productos candidatos con su similitud y su clasificación, para que el usuario elija |
| RF-16 | **UI de administración del catálogo legal:** crear y editar reglas (regex, exclusiones, opciones, condiciones), base legal, alícuotas, U.T., decretos, exoneraciones y mapeos arancelarios. Cada cambio queda **versionado y auditado** (quién, cuándo, antes, después, motivo) y los cambios de alícuota o de base legal **exigen citar la Gaceta** |
| RF-17 | **Módulo BCV propio** (`/api/v1/bcv`): ingesta diaria de la tasa oficial, histórico por fecha valor y conversión. Lo usan el módulo IVA y los usuarios externos. Ver [07](07-ecosistema.md) §3 |
| RF-18 | **Módulo Arancel propio** (`/api/v1/arancel`): códigos del Decreto 4.944 categorizados, búsqueda por texto y árbol de capítulos. Lo usan el módulo IVA y los usuarios externos. Ver [07](07-ecosistema.md) §4 |
| RF-19 | **API key única con permisos por módulo** (`iva`, `bcv`, `arancel`) y Swagger único con una etiqueta por módulo |
| RF-20 | **Tasas BCV en dólares y euros:** los endpoints del módulo BCV devuelven USD y EUR por fecha valor. Ver [07](07-ecosistema.md) §3 |
| RF-21 | **Detección de la clasificación arancelaria** de un producto (`/api/v1/arancel/detectar`): a partir de la descripción o el código de barras devuelve códigos candidatos con su ruta jerárquica, confianza y preguntas para afinar. **Fin propio, independiente del clasificador de IVA**. Ver [07](07-ecosistema.md) §4 |
| RF-22 | **Ecosistema extensible:** cada módulo nuevo (p. ej. un futuro calendario tributario) se agrega con la receta de [07](07-ecosistema.md) §7 |
| RF-23 | **Minería de precios:** todo precio recibido se guarda como observación (producto, precio en Bs. y USD, tasa usada, fecha), sin datos personales, con marca de calidad (atípico o duplicado). Ver [03](03-modelo-de-clasificacion.md) §4.2 |

## 6. Requerimientos no funcionales

| ID | Requerimiento | Valor propuesto |
|---|---|---|
| RNF-01 | Latencia con datos locales | p95 < 200 ms *(a confirmar)* |
| RNF-02 | Fuentes externas | OFF: 15 consultas por minuto por IP. Respaldo gratuito: 100 por día. **Caché obligatoria**, timeout corto y el servicio responde aunque fallen |
| RNF-03 | Seguridad | Header `X-API-Key`. Keys guardadas como hash. Límite por key. La UI de administración exige inicio de sesión con rol de administrador |
| RNF-04 | Determinismo | La misma entrada, con la misma fecha y la misma versión del diccionario, da la misma salida. La versión va en cada respuesta |
| RNF-05 | Base de datos | PostgreSQL minimalista con `pg_trgm` y `unaccent` |
| RNF-06 | Despliegue | Docker o PM2 *(por definir)* |
| RNF-07 | Licencias | ODbL (Open Food Facts): atribución visible en la UI y en las respuestas que usen sus datos |
| RNF-08 | Contexto | Solo Venezuela: sin internacionalización, moneda Bs. y fuentes oficiales venezolanas |

## 7. Casos de uso

1. `nombre="Arroz Mary 1kg"`, `operacion=nacional` → **EXENTO**, art. 18.1.c, "Ventas internas no gravadas".
2. Mismo arroz con `operacion=importacion` → **ALICUOTA_GENERAL** en la importación (Decreto 5.196, suspensión sin fecha de término), con nota de que la venta nacional es exenta y de la posible exoneración con certificado COMEX.
3. `codigo=9780307474728` → se detecta un **ISBN** (libro) → **EXENTO**, art. 18.6.
4. `codigo=4011` → se detecta un **PLU** de fruta o verdura (banana) → **EXENTO**, art. 18.1.a.
5. `nombre="atún en aceite 140g"` → **condicionado**. Opción 1: ALICUOTA_GENERAL si "presentación natural" no incluye el aceite. Opción 2: EXENTO (18.1.k) si se considera presentación natural. El usuario decide.
6. `nombre="reloj casio"`, sin precio → **condicionado**: ALICUOTA_GENERAL si cuesta menos de US$ 300; ALICUOTA_GENERAL_MAS_ADICIONAL si cuesta US$ 300 o más (61.1.f).
7. `nombre="servicio de electricidad"` → **condicionado**: EXENTO si es residencial (19.9); ALICUOTA_GENERAL si es comercial o industrial.
8. `nombre="asesoría legal"` → **condicionado**: ALICUOTA_REDUCIDA si el cliente es un ente del Poder Público (64.3); ALICUOTA_GENERAL en los demás casos.
9. `nombre="comisión bancaria"` → **NO_SUJETO**, art. 16.4.
10. Petición sin API key → HTTP 401. Petición sin `operacion` → HTTP 400 con un mensaje claro.
