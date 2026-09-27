# 00 · Premisas del proyecto

> Fuente: [premisa.md](../premisa.md), definida por el equipo. Aquí se resume cada premisa, cómo se interpreta y qué implica técnicamente.
> Las observaciones marcadas con ⚠️ señalan diferencias con el texto de la ley o puntos por confirmar.

| # | Premisa | Interpretación / implicación |
|---|---|---|
| 1 | Alícuotas manejadas: general 16 %, reducida 8 %, lujo 16 % + 15 % = 31 %, exento o tasa cero 0 % | Coincide con la ley (arts. 27, 61, 63, 64 y 18). Hay algunos ejemplos a corregir: ver §1 abajo |
| 2 | La API recibe el **nombre del artículo** y lo reconoce con **regex** lo más preciso posible. Si además llega un **código** (SKU, EAN/UPC), se usa para identificar el producto con más precisión | Búsqueda en capas: primero el código exacto, después diccionario con regex y exclusiones, y por último búsqueda aproximada. Ver [03](03-modelo-de-clasificacion.md) §3 |
| 3 | Servicio desplegado como **API**, con una **UI** sencilla para consultar y **Swagger** para documentar las APIs | Especificación OpenAPI 3 con Swagger UI en `/docs` y página de consulta en `/` |
| 4 | Servicio **abierto**: cualquier persona puede consultar cómo catalogar su producto | API pública de solo lectura, sin catálogo privado por empresa. La respuesta es **orientativa** y lleva aviso legal. Hace falta limitar las peticiones por IP |
| 5 | Aplica a productos **nacionales e importados**, quizás mediante un parámetro | ⚠️ Ver §2: lo que cambia el IVA es el **tipo de operación**, no el origen del producto |
| 6 | La API **no bloquea ni deniega**: solo consulta y devuelve la categorización | Si hay dudas, responde `condicionado` con varias opciones y sus condiciones. Si no reconoce el producto, responde `no_determinado`. Nunca devuelve un error de negocio |
| 7 | Stack tentativo: **Next.js**, **PostgreSQL** minimalista, despliegue con Docker o PM2 (por definir) | Rutas API de Next.js y PostgreSQL con extensiones `pg_trgm` y `unaccent` para la búsqueda de texto |
| 8 | Primero un **diccionario basado en códigos arancelarios**, después un diccionario de **productos básicos** | Fuente: Arancel de Aduanas, Decreto 4.944. Ver [05](05-fuentes-y-diccionario.md) |
| 9 | Usar **APIs libres de terceros** para identificar productos por código de barras | Open Food Facts y proyectos hermanos, con caché local obligatoria. Ver [05](05-fuentes-y-diccionario.md) §3 |
| 10 | El servicio aplica **únicamente al contexto venezolano**. El **SENIAT** rige todos los términos legales y el servicio debe estar **100 % homologado** a sus leyes y a su terminología | Toda categoría, campo y mensaje usa la terminología de la Ley de IVA y del SENIAT. Cada respuesta cita la norma y la Gaceta Oficial. Montos en Bs. con el tipo de cambio oficial del BCV. Ver [06](06-terminologia-seniat.md) |
| 11 | Repositorio de arancel de aduanas: https://github.com/Ronny390/Rep-Arancel | Se analizó el 27/09/2026. Informe en [08](analisis/08-analisis-rep-arancel.md). **Conclusión:** sirve como referencia y verificación cruzada, pero **no se importa tal cual**. Todo el proyecto va en **PostgreSQL, nada de Oracle** |
| 12 | Repositorio de tasas BCV: https://git.grkzn.com/sirumatek/bnpl/tasas-bcv | Se analizó el 27/09/2026. Informe en [10](analisis/10-analisis-tasas-bcv.md). **Conclusión:** su lógica de lectura del BCV se porta al módulo BCV propio, con correcciones. Tiene un defecto urgente: falla cuando la tasa pase de 1.000 |
| 13 | API de calendario de IVA según tipo de contribuyente: https://github.com/Cristianhub232/calendarioapi | Se analizó el 27/09/2026 ([12](analisis/12-analisis-calendarioapi.md)). 10 de 12 tablas del calendario SPE coinciden con la Gaceta; los ejercicios irregulares tienen 76 fechas erradas y no cubre a los contribuyentes ordinarios. El calendario se toma de nuestra transcripción oficial (GO 43.283) |

## Decisiones confirmadas por el equipo (27/09/2026)

| Tema | Decisión |
|---|---|
| Nacional o importado | Es un parámetro que **siempre** se tiene en cuenta. Se llama `operacion`, es **obligatorio** y admite `nacional` (venta o prestación dentro del país) e `importacion` (importación definitiva de bienes o servicios del exterior). Ver §2 |
| Códigos aceptados | EAN y SKU, más **todos los códigos adicionales útiles**: EAN-8, UPC-A/E, GTIN-14 (DUN-14), ISBN, ISSN, códigos GS1 de peso variable, PLU de frutas y verduras, código arancelario y registro sanitario. Ver [03](03-modelo-de-clasificacion.md) §2 |
| Código arancelario | Se acepta como entrada y además tiene **endpoint propio**. Se espera en pocos casos |
| Autenticación | **API key (token)** obligatoria |
| Servicios | **Entran en el alcance**: art. 19 (exentos), art. 64 (8 %), art. 61.2 (suntuarios) y art. 16 (no sujeción) |
| Identificación por código de barras | **Open Food Facts** como fuente principal (el equipo ya lo usó en su versión gratuita) y una **segunda opción** gratuita como respaldo. Ver [05](05-fuentes-y-diccionario.md) §1 |
| Zonas grises | La respuesta es **multiopción**: "tributa al 16 % si se cumple X; está exento si se cumple Y". El **usuario final decide bajo su responsabilidad y análisis**. El servicio nunca elige por él |
| Nombre del proyecto | **El Renglón**. Ver §3 |
| SKU | Por ahora el SKU se busca de forma directa y la respuesta muestra **múltiples coincidencias** (productos candidatos) para que el usuario elija |
| Precios | `precio_compra`, `precio_venta` y `moneda` (`VES` o `USD`) van en **todo request**, con valores opcionales. Se convierten con la tasa BCV. Solo influyen donde la ley usa el precio. **Cada precio recibido se guarda para minería de datos de precios de la calle** (confirmado el 27/09/2026) |
| API keys | Se generan desde la **UI de administración** |
| Administración del catálogo | La UI de administración permite **modificar el catálogo legal**: reglas, base legal, alícuotas, decretos y mapeos arancelarios, con auditoría |
| Tasas BCV | **Módulo propio del ecosistema**, con su propia API (`/api/v1/bcv`). Se porta la lógica del repositorio tasas-bcv (premisa 12), con correcciones ([10](analisis/10-analisis-tasas-bcv.md)). Ver [07](07-ecosistema.md) |
| Código arancelario (datos) | **Módulo propio del ecosistema**, con su propia API (`/api/v1/arancel`). El "servicio de arancel" del equipo resultó ser Rep-Arancel (premisa 11). Tras analizarlo, los datos se extraen directamente de la Gaceta Oficial, con semilla propia en PostgreSQL. Ver [08](analisis/08-analisis-rep-arancel.md) y [09](09-semilla-arancel.md) |
| Tasas BCV en USD y EUR | El módulo BCV devuelve la tasa en **dólares y euros** |
| Base de datos | **Solo PostgreSQL**; nada del proyecto se basa en Oracle (27/09/2026) |
| Preliminares del Arancel | Reglas Generales de Interpretación, Abreviaturas y Símbolos y Tabla de conversión de unidades en tablas propias ([09](09-semilla-arancel.md) §2.1) |
| Detección arancelaria | Endpoints para **detectar la clasificación arancelaria** de un producto. Es **otro fin, independiente del clasificador de IVA** |
| Crecimiento | El ecosistema debe permitir **más módulos a futuro**, p. ej. **días de pago de tributos** (calendario tributario) |

---

## 1. Observaciones sobre la tabla de alícuotas (premisa 1)

La tabla general es correcta. Estos ejemplos no coinciden con el texto de la ley (GO Ext. 6.507) y conviene ajustarlos antes de cargarlos como datos:

| Ejemplo en la premisa | Qué dice la ley | Artículo |
|---|---|---|
| "Servicios médicos específicos" al **8 %** | Los servicios médico-asistenciales, odontológicos, de cirugía y de hospitalización están **exentos**. Los servicios al 8 % son el transporte aéreo nacional de pasajeros y los servicios profesionales prestados al Poder Público | Arts. 19.6 y 64.3–4 |
| Exentos: "productos de primera necesidad **producidos a nivel nacional**" y "medicamentos **nacionales**" | La exención de las **ventas** no depende del origen. Un arroz o un medicamento importado también se **vende** exento. Lo que cambia con la importación es el IVA **de la importación** (ver §2) | Art. 18 |
| "Material educativo" exento | La ley exime **libros, revistas y folletos**. Cuadernos, lápices y útiles escolares no aparecen en la lista, así que pagan **16 %** | Art. 18.6 |
| "Repuestos" al 16 % | Es correcto para los repuestos. Pero los **accesorios** de vehículo no incorporados en el ensamblaje, con precio ≥ US$ 100, pagan **31 %**. La ley no define la frontera entre repuesto y accesorio, así que es una zona gris | Art. 61.1.h |
| "Joyería fina" al 31 % | Solo si el precio es **≥ US$ 300**. Lo mismo aplica a los relojes | Art. 61.1.f |
| Al 8 %: "ciertas mantecas", ganado caprino u ovino | Correcto. Además van al 8 % las **carnes distintas de pollo, res y cerdo** (chivo, cordero, conejo…) y el alimento para esos animales | Art. 64.1–2 |
| "Exento / tasa cero 0 %" en una sola fila | Son conceptos distintos: la tasa cero es solo para exportación, que **queda fuera del servicio**. En El Renglón, 0 % significa exento, exonerado o no sujeto | Arts. 18 y 27 |

## 2. Productos nacionales e importados (premisa 5)

Lo que cambia el IVA es **qué operación se hace**, no dónde se fabricó el producto:

| Operación | Ejemplo: arroz (art. 18.1.c) | Ejemplo: televisor |
|---|---|---|
| **Venta nacional** de un producto hecho en Venezuela | Exento | 16 % |
| **Venta nacional** de un producto importado (reventa) | **Exento** | 16 % |
| **Importación** (nacionalización en aduana) | **16 %**: el Decreto 5.196 suspende la exención sin fecha de término, salvo certificado COMEX (exoneración hasta el 31/12/2026) | 16 %, o 90 % exonerado si su código arancelario está en el Decreto 5.197 |

**Decisión confirmada:** el parámetro `operacion` es **obligatorio** en toda consulta, con valores `nacional` o `importacion`. La respuesta siempre repite la operación evaluada. Cuando el resultado cambiaría con la otra operación (p. ej. un bien del art. 18 durante la suspensión del Decreto 5.196), se añade una nota que lo advierte.

## 3. Nombre: El Renglón

- **Concepto:** en Venezuela, un *renglón* es cada producto que se comercializa ("los renglones de la cesta básica"). En el mundo fiscal es cada línea de la declaración de IVA (Forma 30) y de la factura. El nombre une el lado comercial y el lado fiscal.
- **Identificadores técnicos (ASCII, sin ñ ni acentos):** `el-renglon` (repositorio, contenedor), `elrenglon` (base de datos). El nombre visible en la UI es "El Renglón".
- **Disponibilidad:** una búsqueda rápida (27/09/2026) no mostró productos de software con ese nombre en Venezuela. Si se va a registrar la marca, hay que confirmarlo en el SAPI.
- **Descartado:** "OpenAgora", porque ya existe una plataforma comercial "Openagora" (Openagora SpA, recursos humanos).

## 4. Exportación: excluida

Las **ventas de exportación** (alícuota 0 %, art. 27) **no forman parte del servicio**, por decisión del equipo (27/09/2026). El parámetro `operacion` solo admite `nacional` e `importacion`, y no existe la categoría `ALICUOTA_CERO`.
