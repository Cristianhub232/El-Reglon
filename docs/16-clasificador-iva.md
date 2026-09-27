# 16 · Clasificador de IVA: catálogo, motor y API

> Núcleo de El Renglón. Dice cómo tributa un bien o servicio en IVA (exento, exonerado, no sujeto, 8 %, 16 % o 16 % + 15 %), con la base legal citada textualmente de la Gaceta. En las zonas grises devuelve varias opciones con sus condiciones, y **el operario decide** (premisa 10).
> **Estado del catálogo:** `pendiente_validacion_asesor`. Toda respuesta lo advierte hasta que el asesor tributario lo valide.

## 1. Piezas

| Pieza | Archivo | Qué hace |
|---|---|---|
| Catálogo | `datos/iva/catalogo.json` | Fuente única, editable: alícuotas, categorías SENIAT, decretos, base legal, **115 reglas** (148 opciones) y **126 prefijos arancelarios** |
| Casos de referencia | `datos/iva/casos_prueba.json` | 116 casos con el resultado esperado (estado, categorías y regla) |
| Esquema | `db/iva/001_esquema.sql` | Tablas del catálogo, caché de productos, observaciones de precio y registro de consultas no resueltas |
| Cargador | `scripts/iva-cargar-catalogo.ts` | Valida (V1–V10) y carga en **una transacción**: si algo falla, no carga nada |
| Motor | `src/modules/iva/motor.ts` | Puro (sin base de datos ni red): señales → reglas → opciones |
| Clasificador | `src/modules/iva/clasificador.ts` | Valida el request, detecta códigos, consulta Open Food Facts y el arancel, convierte precios con el BCV, calcula montos y registra |
| API | `src/app/api/v1/iva/*` | `POST clasificar`; `GET alicuotas`, `reglas`, `base-legal`, `codigo/{codigo}` (permiso `iva`) |

## 2. Cómo se clasifica

1. **Señales**, cada una con un peso:

   | Señal | Peso |
   |---|---|
   | Código arancelario (prefijo más largo en `regla_arancel`) | 0,95 |
   | ISBN o ISSN (libros, prensa y revistas) | 0,95 |
   | Categorías de Open Food Facts | 0,85 |
   | Nombre enviado | 0,75 |
   | Nombre del producto en Open Food Facts | 0,70 |

2. **Reglas por texto.** El nombre se normaliza: minúsculas, sin acentos (la ñ queda como n) y solo letras y dígitos. Cada regla tiene expresiones regulares para incluir, excluir y exigir todas, además de una prioridad del 1 al 100. Gana la de mayor prioridad. A igual prioridad gana la que coincide **antes en el texto**, porque en español el sustantivo principal va primero ("mantequilla con sal" es mantequilla, "galletas de avena" son galletas).
3. **Condiciones.** Si llega el dato (`precio_usd`, `peso_g`, `uso`, `cliente`), se descartan las opciones que no se cumplen. Si no llega, la opción queda con su condición en texto.
4. **Operación.** En `importacion`, mientras esté vigente el **Decreto 5.196**, las exenciones del art. 18 no aplican (el decreto suspende el art. 17.1). La opción pasa a la alícuota general, con base legal `LIVA-17-1 + DEC-5196-1 + LIVA-63` y una nota que menciona la exoneración COMEX.
5. **Varias reglas:**
   - Si coinciden en alguna categoría, la **más específica acota** a las otras. Por ejemplo, la partida 16.01 ("mortadela o embutidos") más el nombre "mortadela" da exento, y la subpartida 0406.10 más "queso blanco" también da exento.
   - Si no coinciden en ninguna, se muestran todas las opciones y una advertencia de conflicto.
6. **Misma categoría, mismo resultado.** Las opciones con igual categoría se unen. Por ejemplo, en importación "si es queso blanco" y "si es otro queso" terminan ambas en el 16 %.
7. **Regla residual.** Un código arancelario válido sin regla asociada responde **16 % (art. 63)** como opción condicionada, con una advertencia.
8. **Estado:** una opción es `determinado`, varias son `condicionado`, ninguna es `no_determinado`. Los casos `condicionado` y `no_determinado` se registran en `iva.consulta_registro` para mejorar el catálogo.

**Precios.** Los campos `precio_compra`, `precio_venta` y `moneda` van en todo request y pueden valer `null`:

- Se convierten con la tasa BCV aplicable (art. 25).
- El umbral en USD del art. 61 se evalúa con el precio de venta en operaciones nacionales y con el de compra en importaciones. Si falta ese precio, se usa el otro y se advierte.
- Montos por opción, en Bs. y USD, **como en la factura**: base redondeada a céntimos, IVA sobre esa base y total igual a la base más el IVA. Aritmética decimal exacta con BigInt.
- Cada precio se guarda en `iva.observacion_precio` sin datos personales. Los duplicados (misma clave, producto y precios en menos de 1 minuto) se marcan, no se borran.

## 3. Validaciones del cargador

| # | Qué comprueba |
|---|---|
| V1 | Identificadores únicos: reglas, base legal, prefijos, categorías y alícuotas |
| V2 | Las 183 expresiones regulares compilan y están normalizadas (sin mayúsculas ni acentos) |
| V3 | Toda regla es alcanzable (patrón, categoría de Open Food Facts o prefijo); una zona gris tiene al menos 2 opciones |
| V4 | Las referencias existen: categorías, base legal, componentes de alícuota y base legal de los decretos |
| V5 | Condiciones evaluables: campo y operador soportados; si una opción de la regla se evalúa, todas se evalúan sobre el mismo campo |
| V6 | **Cobertura de la ley:** los 72 numerales y literales de los arts. 16, 18, 19, 61 y 64 están en alguna regla |
| V7 | **Texto legal idéntico a la Gaceta:** cada texto se busca literalmente, reducido a letras y dígitos, en el PDF oficial. Se extrae por columnas con `pdftotext -layout`, porque la Gaceta va a dos columnas. Resultado: 77 de 78 idénticos; el Decreto 5.207 no tiene fuente a mano (B12) y queda `verificado = false` |
| V8 | Los 116 casos de referencia dan el resultado esperado |
| V9 | Los 126 prefijos existen en el arancel vigente |
| V10 | Lo cargado coincide con el archivo (reglas, opciones, base legal y prefijos) |

Prueba negativa: un catálogo con un texto legal alterado, una expresión regular rota y una referencia inexistente falla en V2, V4, V6 y V7, y no se carga nada.

**Errores que las verificaciones encontraron al construir el catálogo:**

- Seis textos de la base legal estaban **cortados** en un salto de columna. El más grave era el art. 64.2, que terminaba en "los literales" sin decir cuáles. Se completaron desde la Gaceta.
- La subpartida **0406.10.10.00 es mozzarella**, no queso blanco. Se crearon reglas propias para 0406.10, 16.01 (mortadela o embutidos) y 87.08 (repuesto o accesorio). También se quitó 71.14, que es orfebrería y no joyería.
- **Plurales mal escritos** en los patrones: `collares?` no coincidía con "collar" ni `relojes?` con "reloj". Se corrigieron 34 palabras.

## 4. Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/iva/clasificar` | Clasificación (ver `/docs` para el esquema y ejemplos) |
| GET | `/api/v1/iva/alicuotas?fecha=` | Componentes vigentes, categorías con su alícuota total y decretos vigentes |
| GET | `/api/v1/iva/reglas?q=&tipo=` | Catálogo de reglas; con `q` muestra qué regla elegiría el motor |
| GET | `/api/v1/iva/base-legal` | Textos legales con su Gaceta y si están verificados |
| GET | `/api/v1/iva/codigo/{codigo}` | Tipo de código, dígito verificador y producto en Open Food Facts |

Errores: 400 (entrada inválida o sin `operacion`), 401, 403, 413, 415 y 429. Las exportaciones están fuera del alcance (400).

## 5. Cómo se mantiene el catálogo

```bash
npm run iva:casos          # casos de referencia, sin base de datos
npm run iva:cargar         # valida y carga (requiere pdftotext; sin él: -- --sin-pdf)
BASE_URL=http://127.0.0.1:3000 npm run prueba:api   # 57 pruebas de extremo a extremo
```

Para agregar un producto o un criterio:

1. Editar `catalogo.json`.
2. Agregar su caso en `casos_prueba.json`.
3. Cargar. Si el cargador no pasa las 10 validaciones, no cambia nada.

La **UI de administración** (pendiente) editará el mismo catálogo, con auditoría.

## 6. Pendientes

- Validación del catálogo por el asesor tributario (B1–B8, B12, B14, B23–B26).
- Marcar precios atípicos: más de 5 desviaciones de la mediana del producto en 30 días.
- Umbral de 2 U.T. del art. 19.7 cuando exista el módulo U.T.
- Tabla PLU → producto; búsqueda aproximada por nombre (`pg_trgm`) cuando no coincide ninguna regla; `coincidencias[]` desde la caché.
- UI de consulta (A21) y de administración.
