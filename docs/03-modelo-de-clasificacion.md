# 03 · El Renglón, módulo IVA: modelo de datos, lógica de clasificación y contrato de API

> Las rutas de este documento quedan bajo el prefijo `/api/v1/iva/` (p. ej. `/api/v1/iva/clasificar`). Los módulos BCV y Arancel están en [07](07-ecosistema.md).

> Actualizado según las [premisas](00-premisas.md) y las decisiones del 27/09/2026. La terminología sigue [06](06-terminologia-seniat.md).

## 1. Categorías fiscales (homologadas SENIAT)

| Código | Denominación | Componentes de alícuota | Marca "(E)" |
|---|---|---|---|
| `EXENTO` | Operación exenta (arts. 17, 18, 19, 65) | — | Sí |
| `EXONERADO` | Operación exonerada (decreto con vigencia) | — (o parcial) | Sí |
| `NO_SUJETO` | Operación no sujeta (art. 16) | — | Sí |
| `ALICUOTA_REDUCIDA` | Gravado por alícuota reducida (art. 64) | `REDUCIDA` (8 %) | No |
| `ALICUOTA_GENERAL` | Gravado por alícuota general (art. 63) | `GENERAL` (16 %) | No |
| `ALICUOTA_GENERAL_MAS_ADICIONAL` | Consumo suntuario (art. 61) | `GENERAL` (16 %) + `ADICIONAL` (15 %) | No |

Los porcentajes se leen de la tabla `alicuota` según la fecha. Nunca van fijos en el código.

## 2. Códigos aceptados y cómo se detectan

La API recibe `codigo` (uno) o `codigos[]` (varios). El tipo se **detecta automáticamente**, y también se puede indicar con `tipo_codigo`.

| Tipo | Formato / detección | Qué aporta a la clasificación |
|---|---|---|
| **EAN-13 / GTIN-13** | 13 dígitos con dígito verificador GS1 (módulo 10) | Identifica el producto (OFF o respaldo) |
| **EAN-8** | 8 dígitos con dígito verificador | Igual que el anterior |
| **UPC-A / GTIN-12** | 12 dígitos con dígito verificador | Igual que el anterior |
| **UPC-E** | 8 dígitos comprimidos. Se expanden a UPC-A | Igual que el anterior |
| **GTIN-14 / DUN-14** | 14 dígitos (cajas y bultos). Se quita el dígito indicador y se recalcula para obtener el GTIN-13 de la unidad | Identifica el producto de la unidad |
| **ISBN-10 / ISBN-13** | ISBN-13 = EAN que empieza por 978 o 979. ISBN-10 con dígito verificador módulo 11 | **Señal fuerte: libro → EXENTO 18.6** |
| **ISSN** | EAN que empieza por 977, o formato `NNNN-NNNC` | **Señal fuerte: diario o revista → EXENTO 18.5 / 18.6** |
| **Peso o precio variable GS1** | EAN-13 que empieza por 20–29 (etiqueta de balanza). Se extrae el código de artículo | Suelen ser carnes, frutas y verduras. Se identifican con el catálogo o PLU local |
| **PLU (IFPS)** | 4 dígitos (3000–4999), o 5 dígitos que empiezan por 9 (orgánico) | **Señal fuerte: fruta u hortaliza fresca → EXENTO 18.1.a** |
| **Código arancelario** | 10 dígitos (Decreto 4.944). Se aceptan prefijos de 4, 6 u 8 dígitos | Regla por prefijo más largo, más exoneraciones de importación |
| **Registro sanitario** | Texto, p. ej. medicamentos "E.F. NN.NNN" (formato a confirmar) | **Señal: medicamento → EXENTO 18.3** |
| **SKU** | Texto libre (interno de cada empresa) | Informativo. Solo sirve si existe en la caché o en un catálogo propio (más adelante) |

## 3. Modelo de datos (PostgreSQL minimalista)

```
alicuota           (codigo, porcentaje, vigente_desde, vigente_hasta, instrumento, gaceta)
unidad_tributaria  (valor_bs, vigente_desde, vigente_hasta, instrumento, gaceta)
tasa_cambio        (fecha, moneda, tasa_bs, fuente='BCV')   -- vista del módulo BCV (bcv.tasa), ver doc 07
base_legal         (id, norma, gaceta, fecha_gaceta, articulo, numeral, literal, texto_literal)

regla              ← entrada del diccionario (bienes y servicios)
  id, tipo [BIEN|SERVICIO], nombre, prioridad,
  patrones_incluir text[], patrones_excluir text[], categorias_off text[],
  zona_gris bool, nota, version

opcion_regla       ← una regla tiene 1..n opciones. Con 1 opción → determinado; con más → condicionado
  regla_id, orden, categoria, base_legal_id,
  condicion_texto ("si el suministro es residencial"),
  condicion_eval jsonb NULL   -- evaluable automáticamente si llegan los datos:
                              -- {"campo":"precio_usd","op":">=","valor":300}
                              -- {"campo":"precio_ut","op":"<=","valor":2}
                              -- {"campo":"peso_g","op":"<=","valor":170}

arancel            -- se usa arancel.subpartida / arancel.v_subpartida_ruta del módulo Arancel (docs 07 y 09)
regla_arancel      (prefijo varchar(2..10), regla_id)
exoneracion        (decreto, gaceta, operacion, prefijos_arancel text[], regla_ids int[],
                    porcentaje, vigente_desde, vigente_hasta, requisitos)
suspension_exencion(decreto, gaceta, operacion, articulo_afectado, vigente_desde, vigente_hasta)

producto_cache     (codigo, tipo_codigo, nombre, marca, cantidad, categorias_off text[],
                    fuente, consultado_en, raw jsonb)
plu                (codigo, nombre, regla_id)      -- tabla IFPS de frutas y verduras
sinonimo           (termino, regla_id)             -- índice pg_trgm

api_key            (id, nombre, prefijo, hash, activo, limite_por_minuto, creado_por, creado_en, ultimo_uso)
admin_usuario      (id, email, hash_clave, rol [ADMIN|CURADOR], activo)
catalogo_version   (id, version, publicado_por, publicado_en, nota)   -- cada publicación del catálogo
auditoria          (id, entidad, entidad_id, accion, antes jsonb, despues jsonb,
                    usuario_id, motivo, gaceta_citada, creado_en)       -- append-only
consulta_registro  (api_key_id, entrada jsonb, estado, regla_id, creado_en)
```

## 4. Algoritmo de clasificación

```
entrada: nombre?, codigo? | codigos[]?, codigo_arancelario?, operacion (OBLIGATORIO),
         tipo? (bien|servicio), precio_compra?, precio_venta?, moneda? (VES|USD, obligatorio si hay precios), fecha = hoy
(se requiere al menos un nombre o un código)

1. SEÑALES (cada una propone una regla con un peso)
   - codigo_arancelario → regla_arancel con el prefijo más largo          (0.95)
   - SKU o código no reconocido → búsqueda directa (exacta y parcial) en la caché
     + búsqueda aproximada por nombre → coincidencias[] (productos candidatos)
   - ISBN / ISSN → regla libros o prensa                                   (0.95)
   - PLU → tabla plu → regla                                               (0.90)
   - GTIN (EAN/UPC/DUN) → caché → OFF → respaldo:
       categorias_off → regla                                              (0.85)
       nombre obtenido → matcher de texto                                  (0.6–0.8)
   - registro sanitario de medicamento → regla medicamentos                (0.85)
   - nombre → matcher de texto (regex con inclusión y exclusión por prioridad;
     si no hay coincidencia, pg_trgm)                                      (0.6–0.8 / sim × 0.6)

2. COMBINAR
   - todas las señales llevan a la misma regla → esa regla
   - reglas distintas → sus opciones se **unen** en la multiopción, ordenadas por peso
   - sin señales → 'no_determinado'

3. CONTEXTO (por cada opción)
   - exoneración vigente para (operación, arancel o regla, fecha) → se agrega la opción EXONERADO
     con sus requisitos (p. ej. certificado COMEX)
   - operacion = importacion + opción EXENTO del art. 18 + suspensión vigente (Decreto 5.196)
       → la opción pasa a ALICUOTA_GENERAL, con nota sobre la exoneración posible y sobre
         la venta nacional exenta
   - condicion_eval: si el dato llega (precio, peso, U.T.) → se evalúa y se descartan
     las opciones que no se cumplen; si no llega → la opción queda con su condición en texto
     · el umbral del art. 61 se evalúa con precio_venta (operacion=nacional) o con
       precio_compra (operacion=importacion, como aproximación del valor en aduana)
     · conversión Bs ↔ USD con la tasa BCV de `fecha`
   - MONTOS (si llegan los precios), por opción:
       base_imponible_venta, iva_venta (débito fiscal) y, si llega precio_compra,
       iva_compra (crédito fiscal), en Bs y USD

4. ESTADO
   - queda 1 opción → 'determinado'
   - quedan varias → 'condicionado' (el usuario decide)
   - ninguna → 'no_determinado' (se registra para curaduría)

5. RESPUESTA: alícuotas vigentes en `fecha`, base legal con Gaceta, concepto_declaracion
   (Forma 30), marca (E), aviso de responsabilidad
```

**Nunca se niega una consulta por reglas de negocio.** Los únicos errores HTTP son 400 (entrada inválida o sin `operacion`), 401 (API key), 429 (límite de peticiones) y 5xx.

## 4.1 Precios (decisión del 27/09/2026)

| Campo | Regla |
|---|---|
| `precio_compra`, `precio_venta`, `moneda` | **Forman parte de todo request.** Sus valores son **opcionales**: pueden llegar en `null` y la consulta funciona igual. Son precios **unitarios sin IVA** (base imponible) |
| `moneda` | `VES` o `USD` (la UI muestra "Bs." y "US$"). **Obligatoria si llega algún precio**, para no confundir bolívares con dólares |
| Conversión | El precio se convierte a la otra moneda con la **tasa aplicable del BCV** a la fecha de la consulta (art. 25 Ley IVA; función `bcv.tasa_aplicable`). La respuesta indica la tasa y la fecha valor usadas |
| Efecto en la clasificación | Solo donde **la ley** usa el precio: art. 61 (umbrales en USD) y art. 19.7 (2 U.T.). En los demás casos el precio no cambia la categoría. Sin precio, los umbrales se responden como opciones ("16 % si < US$ 300; 31 % si ≥ US$ 300") |
| Efecto en la respuesta | Montos en **Bs. y en USD**: base imponible, IVA de la venta (débito) e IVA de la compra (crédito) de cada opción |
| **Minería de precios** | Cada precio recibido se guarda como **observación de precio** (§4.2), aunque la consulta sea ambigua |

## 4.2 Observaciones de precio (minería de datos)

Objetivo: construir con el tiempo una base de **precios reales de la calle** por producto, en Bs. y en USD, para análisis (evolución, dispersión, precio de referencia por producto).

```
iva.observacion_precio (
  id bigserial, observado_en timestamptz,          -- momento de la consulta
  fecha_operacion date,                            -- fecha informada en el request (o hoy)
  codigo_barras text NULL, codigo_arancelario varchar(10) NULL, nombre_normalizado text,
  regla_id NULL,                                   -- producto/regla identificados (si los hubo)
  precio_compra numeric NULL, precio_venta numeric NULL, moneda char(3),
  precio_compra_usd numeric NULL, precio_venta_usd numeric NULL,
  precio_compra_bs numeric NULL, precio_venta_bs numeric NULL,
  tasa_bcv numeric, tasa_fecha_valor date,         -- trazabilidad de la conversión
  ubicacion text NULL,                             -- estado o ciudad, si se envía
  api_key_id int,                                  -- solo para control de calidad y abuso
  calidad text                                     -- 'ok' | 'atipico' | 'duplicado' (se marca, no se borra)
)
```

- **Sin datos personales:** no se guardan IP, RIF ni datos del cliente final. La API key se usa solo para detectar abuso o datos basura; los análisis publicados se agregan y son anónimos.
- **Calidad:** los precios atípicos (p. ej. a más de 5 desviaciones de la mediana del producto en los últimos 30 días) y los duplicados (misma clave, producto y precio en menos de 1 minuto) se **marcan**, no se descartan.
- **Ubicación:** campo opcional `ubicacion` (estado o ciudad), para comparar precios por zona cuando se envíe.
- **Análisis internos**, no publicados. Los términos de uso de la API se definirán más adelante.

## 5. Contrato de API (borrador)

> **Implementado** (ver [16](16-clasificador-iva.md)): las rutas del módulo quedaron bajo `/api/v1/iva/` (`clasificar`, `alicuotas`, `reglas`, `base-legal`, `codigo/{codigo}`), como los demás módulos. La respuesta sigue esta forma, con `montos` dentro de cada opción. Lo demás de esta sección sigue como diseño.

Autenticación: header `X-API-Key: <token>` en todos los endpoints `/api/v1/*`.

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/api/v1/clasificar` | Clasifica un bien o servicio (nombre y/o códigos) |
| `POST` | `/api/v1/clasificar/arancel` | Clasificación **por código arancelario** (endpoint dedicado) |
| `GET` | `/api/v1/arancel/{codigo}` | Descripción arancelaria, regla asociada y exoneraciones vigentes |
| `GET` | `/api/v1/codigo/{codigo}` | Detecta el tipo de código y devuelve el producto identificado, sin clasificar |
| `GET` | `/api/v1/servicios?q=` | Catálogo de servicios con su tratamiento |
| `GET` | `/api/v1/alicuotas?fecha=` | Alícuotas y U.T. vigentes |
| `GET` | `/api/v1/base-legal` | Artículos y literales usados, con su Gaceta |
| `GET` | `/api/v1/diccionario?q=` | Busca reglas del diccionario |
| `GET` | `/api/v1/glosario` | Terminología SENIAT |
| `GET` | `/api/v1/sku/{sku}` | Búsqueda directa por SKU → lista de coincidencias |

**Administración** (sesión de administrador, no API key; lo usa la UI de administración):

| Método | Ruta | Descripción |
|---|---|---|
| `GET` / `POST` / `DELETE` | `/api/admin/api-keys` | Listar, crear (el token se muestra una sola vez) y revocar |
| `GET` / `POST` / `PUT` | `/api/admin/reglas`, `/api/admin/reglas/{id}/opciones` | Catálogo de reglas y sus opciones |
| `GET` / `POST` / `PUT` | `/api/admin/base-legal`, `/api/admin/alicuotas`, `/api/admin/unidad-tributaria` | Normas y valores con su vigencia |
| `GET` / `POST` / `PUT` | `/api/admin/exoneraciones`, `/api/admin/suspensiones` | Decretos |
| `GET` / `POST` / `PUT` | `/api/admin/regla-arancel` | Mapeo de códigos arancelarios a reglas |
| `POST` | `/api/admin/catalogo/publicar` | Publica una nueva versión del catálogo |
| `GET` | `/api/admin/auditoria` | Historial de cambios |
| `POST` | `/api/admin/bcv/ingesta`, `/api/admin/arancel/importar` | Ejecuta la ingesta de tasas BCV o importa datos del arancel |
| `GET` | `/api/openapi.json` | Especificación OpenAPI 3 |
| — | `/docs` | Swagger UI (con *Authorize*) |
| — | `/` | UI de consulta |

**Petición `POST /api/v1/clasificar`:**

```json
{
  "nombre": "Atún en aceite 140 g",
  "codigos": ["7591234567890"],
  "operacion": "nacional",
  "tipo": "bien",
  "precio_compra": 1.10,          // siempre presentes; null si no se conocen
  "precio_venta": 1.60,
  "moneda": "USD",                // VES o USD; obligatoria si hay algún precio
  "fecha": "2026-09-27"
}
```

**Respuesta (condicionado, multiopción):**

```json
{
  "estado": "condicionado",
  "operacion": "nacional",
  "tipo": "bien",
  "producto_identificado": { "nombre": "Atún en aceite vegetal 140 g", "codigo": "7591234567890",
                             "tipo_codigo": "EAN-13", "fuente": "open_food_facts" },
  "opciones": [
    {
      "orden": 1,
      "categoria": "ALICUOTA_GENERAL",
      "denominacion": "Gravado por alícuota general",
      "alicuotas": [{ "codigo": "GENERAL", "porcentaje": 16 }],
      "alicuota_total": 16,
      "condicion": "Si se considera que el atún en aceite no es 'presentación natural'.",
      "base_legal": [{ "norma": "Ley IVA", "gaceta": "GO Ext. 6.507 del 29/01/2020", "articulo": 63 }],
      "concepto_declaracion": "Ventas internas gravadas por alícuota general",
      "marca_exento": false
    },
    {
      "orden": 2,
      "categoria": "EXENTO",
      "denominacion": "Operación exenta",
      "alicuotas": [],
      "alicuota_total": 0,
      "condicion": "Si el producto califica como 'atún enlatado en presentación natural'.",
      "base_legal": [{ "norma": "Ley IVA", "gaceta": "GO Ext. 6.507 del 29/01/2020",
                       "articulo": 18, "numeral": 1, "literal": "k",
                       "texto": "Atún enlatado en presentación natural." }],
      "concepto_declaracion": "Ventas internas no gravadas",
      "marca_exento": true
    }
  ],
  "coincidencias": [
    { "nombre": "Atún en aceite vegetal 140 g", "codigo": "7591234567890", "similitud": 0.93, "fuente": "cache" },
    { "nombre": "Atún al natural 140 g", "codigo": "7591234567883", "similitud": 0.71, "fuente": "cache" }
  ],
  "montos_por_opcion": {
    "1": { "tasa_bcv_bs": null, "base_imponible_venta_usd": 1.60, "iva_venta_usd": 0.256, "iva_compra_usd": 0.176 },
    "2": { "tasa_bcv_bs": null, "base_imponible_venta_usd": 1.60, "iva_venta_usd": 0.0, "iva_compra_usd": 0.0 }
  },
  "confianza": 0.7,
  "metodo": ["codigo_barras", "diccionario"],
  "advertencias": ["Zona gris: la ley no define 'presentación natural'."],
  "notas_operacion": [],
  "responsabilidad": "Resultado orientativo. La selección entre opciones corresponde al usuario bajo su responsabilidad y análisis.",
  "version_diccionario": "2026.09.27-1",
  "atribucion": "Datos de producto: Open Food Facts (ODbL)"
}
```

**Caso determinado:** tiene la misma forma, con `"estado": "determinado"` y una sola opción en `opciones`.

**Diferencia entre `coincidencias` y `opciones`:**

- `coincidencias` responde **"¿qué producto es?"**: candidatos cuando el SKU o el nombre no son únicos.
- `opciones` responde **"¿cómo tributa?"**: tratamientos fiscales posibles con sus condiciones.

Cuando el usuario elige una coincidencia, puede volver a consultar con ese código para obtener una clasificación más precisa. *(En los montos del ejemplo, `tasa_bcv_bs` se llena con el servicio BCV y los montos se muestran también en Bs.)*

## 6. Arquitectura tentativa (premisa 7, por confirmar)

```
Next.js (App Router)
 ├─ app/page.tsx                     UI de consulta
 ├─ app/docs/page.tsx                Swagger UI (swagger-ui-react)
 ├─ app/admin/**                     UI de administración (API keys, catálogo legal, auditoría)
 ├─ app/api/v1/**/route.ts           endpoints
 ├─ middleware.ts                    API key y límite de peticiones
 └─ lib/
     ├─ (detección de códigos: shared/productos/codigos, compartido con Arancel; ver doc 07)
     ├─ normalizar.ts
     ├─ matcher.ts    (regex con inclusión, exclusión y prioridad; pg_trgm)
     ├─ (fuentes externas OFF/UPCitemdb: shared/productos/fuentes, compartido; ver doc 07)
     ├─ (usa modules/bcv y modules/arancel por funciones internas, ver doc 07)
     └─ clasificador.ts (señales → opciones → contexto → estado)
PostgreSQL (pg_trgm, unaccent)
Despliegue: Docker o PM2
```

## 7. Campo opcional: tasa de la máquina fiscal

Cada opción puede incluir `tasa_maquina_fiscal` con la convención habitual: Exento, Tasa 1 = 16 %, Tasa 2 = 8 %, Tasa 3 = 31 %. Es configurable, porque depende del fabricante.
