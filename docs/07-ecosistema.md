# 07 · Ecosistema El Renglón: módulos y APIs propias

> Decisión del equipo (27/09/2026): las tasas BCV y los códigos arancelarios **no son servicios externos**. Se incorporan **dentro del ecosistema El Renglón como APIs propias**, con la misma autenticación, la misma documentación Swagger y la misma base de datos.

## 1. Visión

El Renglón es un **ecosistema extensible**. Arranca con **tres módulos** que funcionan juntos y que también se pueden consumir por separado, y está diseñado para **sumar módulos nuevos** (ver §7):

| Módulo | Qué responde | Ejemplo de uso por separado |
|---|---|---|
| **IVA** (núcleo) | ¿Cómo tributa este bien o servicio? | Un POS consulta la categoría de cada renglón |
| **BCV** | ¿Cuál es la tasa oficial del BCV en **dólares y euros** para esta fecha valor? | Un ERP convierte montos a Bs. para facturar |
| **Arancel** | ¿Qué es este código arancelario? y **¿qué código arancelario le corresponde a este producto?** | Un importador o agente de aduanas detecta el código de su mercancía |

El módulo IVA **usa** a los otros dos internamente: la tasa BCV para los umbrales y los montos, y el arancel para clasificar. Pero **cada módulo tiene su propio fin**. En particular, la **detección arancelaria** (§4) es un servicio independiente, sin relación con el clasificador de IVA.

## 2. Arquitectura: monolito modular

Se propone **una sola aplicación Next.js** con los módulos separados en el código y en la base de datos. Encaja con la premisa 7 (minimalista): un solo despliegue y una sola base de datos.

```
El Renglón (Next.js)
 ├─ app/api/v1/iva/**        módulo IVA
 ├─ app/api/v1/bcv/**        módulo BCV
 ├─ app/api/v1/arancel/**    módulo Arancel
 ├─ app/api/admin/**         administración (sesión de administrador)
 ├─ app/admin/**             UI de administración
 ├─ app/docs                 Swagger UI (un solo OpenAPI, con una etiqueta por módulo)
 ├─ app/page.tsx             UI de consulta
 ├─ middleware.ts            API key, permisos por módulo y límite de peticiones
 ├─ modules/
 │   ├─ iva/      clasificador de IVA, matcher, reglas
 │   ├─ bcv/      ingesta de tasas USD/EUR, consulta, conversión
 │   ├─ arancel/  consulta, búsqueda y **detección** de la clasificación arancelaria
 │   └─ (futuros: calendario/, ...)
 ├─ shared/
 │   └─ productos/ identificación por código de barras (EAN/UPC/ISBN…, caché,
 │                 Open Food Facts, UPCitemdb). La usan IVA y Arancel
 ├─ jobs/        tareas programadas (tasa BCV diaria, caché OFF)
 └─ core/        base de datos, auditoría, API keys, errores, OpenAPI

PostgreSQL: esquemas  core · iva · bcv · arancel
```

**Regla de diseño:** entre módulos se llaman por **funciones internas** (`modules/bcv/obtenerTasa(fecha)`), no por HTTP. Cada módulo solo toca **su propio esquema** de base de datos. Así, si algún día un módulo tiene que separarse como microservicio, el corte es limpio.

## 3. Módulo BCV

### Datos

> **Implementado** (27/09/2026): esquema en [db/bcv/001_esquema.sql](../db/bcv/001_esquema.sql) con `fuente`, `moneda`, `publicacion`, `tasa` (compra y venta, 8 decimales), `dia_sin_publicacion`, la vista `v_tasa_oficial` y la función `tasa_aplicable()`. Histórico 2025–2026 cargado ([11](11-historico-tasas-bcv.md)). El borrador siguiente queda como referencia.

```
bcv.tasa  (fecha_valor date, moneda char(3), tasa_bs numeric(20,8),
           publicado_en timestamptz, fuente text, capturado_en timestamptz,
           PRIMARY KEY (fecha_valor, moneda))
```

- **Monedas:** **USD y EUR** como alcance confirmado. El diseño admite las demás que publica el BCV (CNY, TRY, RUB) si más adelante se necesitan.
- **Fecha valor:** el BCV publica por la tarde la tasa que rige el **siguiente día hábil**. La clave de búsqueda es la fecha valor. Para una fecha no hábil se usa la del siguiente día hábil, según el art. 25 de la Ley de IVA.
- **Ingesta:** una tarea (8, 14 y 20 h, hora de Caracas, con reintentos) lee la portada oficial del BCV, más una carga inicial del histórico. La lógica se porta del repositorio **tasas-bcv** con sus correcciones: punto de miles, **8 decimales**, verificación TLS con el intermediario de Sectigo en lugar de desactivarla, y registro de correcciones ([10](analisis/10-analisis-tasas-bcv.md)).
- **Tasa aplicable (art. 25 Ley de IVA):** además de la tasa publicada por fecha valor, un endpoint devuelve la tasa **aplicable a una operación**. En un día no hábil se usa la vigente el día hábil inmediatamente siguiente, y la respuesta indica qué fecha valor se usó.
- **Sin tasa:** si falta la tasa de un día, se devuelve la última disponible con `advertencia` y la fecha real usada. Nunca se inventa una tasa.
- **Corrección manual:** un administrador puede corregir una tasa desde la UI, con auditoría.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/bcv/tasas/actual` | Tasas vigentes hoy en **USD y EUR** (por fecha valor) |
| `GET` | `/api/v1/bcv/tasas?fecha=AAAA-MM-DD` | Tasas USD y EUR aplicables a una fecha. `moneda=USD` o `EUR` filtra |
| `GET` | `/api/v1/bcv/tasas?desde=&hasta=&moneda=` | Histórico |
| `GET` | `/api/v1/bcv/convertir?monto=&de=USD&a=VES&fecha=` | Conversión entre VES, USD y EUR con la tasa aplicable |
| `GET` | `/api/v1/bcv/monedas` | Monedas disponibles |

**Ejemplo de respuesta de `/api/v1/bcv/tasas/actual`:**

```json
{
  "fecha_valor": "2026-09-29",
  "publicado_en": "2026-09-26T16:30:00-04:00",
  "tasas": {
    "USD": { "tasa_bs": 0.0, "variacion_pct": 0.0 },
    "EUR": { "tasa_bs": 0.0, "variacion_pct": 0.0 }
  },
  "fuente": "Banco Central de Venezuela",
  "advertencias": []
}
```
*(Los valores `0.0` son de relleno: los reales los carga la ingesta diaria.)*

## 4. Módulo Arancel

### Datos

> **Implementado** (27/09/2026): esquema en [db/arancel/001_esquema.sql](../db/arancel/001_esquema.sql) y semilla en [09](09-semilla-arancel.md).

```
arancel.version                -- Decreto 4.944 y cada reforma (Gaceta, fecha, SHA-256 del PDF)
arancel.seccion / capitulo / partida
arancel.subpartida             -- árbol completo: AEC, Ex-AEC, régimen, unidad, versión de origen
arancel.v_subpartida_ruta      -- ruta jerárquica (resuelve los "Los demás")
arancel.cambio                 -- historial de cambios de las reformas (antes -> después)
arancel.unidad_fisica / regimen_legal
arancel.regla_interpretacion / abreviatura / conversion_unidad   -- preliminares del art. 37
arancel.observacion_fuente     -- vacíos e incoherencias de la Gaceta para revisión humana
```

- **Carga inicial:** semilla propia extraída de la Gaceta Oficial (Decreto 4.944 más las reformas de 2025), contrastada con Rep-Arancel. Ver [08](analisis/08-analisis-rep-arancel.md) y [09](09-semilla-arancel.md).
- **Categorización propia** (agrupaciones comerciales por encima del Sistema Armonizado): pendiente de definir; hoy se usan secciones, capítulos y partidas oficiales.
- **Mantenimiento:** desde la UI de administración, con versión y auditoría.
- **Búsqueda por texto:** con `pg_trgm` y `unaccent` sobre la descripción.

### Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/v1/arancel/{codigo}` | Detalle del código (acepta prefijos de 4, 6 u 8 dígitos) |
| `GET` | `/api/v1/arancel/buscar?q=` | Búsqueda por descripción |
| `GET` | `/api/v1/arancel/capitulos` | Árbol de capítulos |
| `GET` | `/api/v1/arancel/capitulos/{cap}` | Partidas y subpartidas de un capítulo |
| `GET` | `/api/v1/arancel/categorias` | Categorías propias |
| `GET` | `/api/v1/arancel/reglas` | Reglas Generales para la Interpretación y Complementarias |
| `GET` | `/api/v1/arancel/abreviaturas` | Abreviaturas y símbolos de la nomenclatura |
| `GET` | `/api/v1/arancel/conversiones` | Tabla de conversión de unidades físicas |
| `GET` | `/api/v1/arancel/convertir?cantidad=&de=&codigo=` | Convierte una cantidad a la unidad física de una subpartida (p. ej. 10 libras → kg) |
| `POST` | `/api/v1/arancel/detectar` | **Detecta la clasificación arancelaria de un producto** (ver abajo) |
| `GET` | `/api/v1/arancel/detectar?q=` | Versión rápida por texto |

La clasificación de IVA **por código arancelario** vive en el módulo IVA: `POST /api/v1/iva/clasificar/arancel`.

### Detección de la clasificación arancelaria (fin propio, independiente del IVA)

**Qué resuelve:** "Tengo este producto, ¿qué código arancelario le corresponde?". Es útil para importadores, agentes de aduanas y exportadores, aunque no les interese el IVA.

**Entrada:**

```json
{
  "descripcion": "Teléfono celular inteligente 128 GB",
  "codigo": "0194253000000",
  "atributos": { "material": null, "uso": null, "estado": "nuevo" }
}
```

Se requiere `descripcion` o `codigo`. El código se resuelve con `shared/productos`.

**Proceso (el mismo patrón por capas del IVA):**

1. Identificar el producto por código de barras (caché → Open Food Facts → UPCitemdb) para obtener su nombre y sus categorías.
2. **Diccionario de sinónimos comerciales → partida:** p. ej. "celular", "smartphone" → 8517.13; "caraota" → 0713.33. Las descripciones oficiales del arancel son técnicas y no usan los nombres comerciales.
3. **Búsqueda por texto** (`pg_trgm`) sobre las descripciones oficiales del arancel.
4. **Categorías de Open Food Facts → capítulo o partida** (p. ej. `en:rices` → 1006).
5. Combinar y ordenar los candidatos por confianza.

**Salida:** multiopción, igual que en IVA.

```json
{
  "estado": "condicionado",
  "candidatos": [
    { "codigo": "8517130000", "nivel": "subpartida_nacional",
      "ruta": ["85 Máquinas, aparatos y material eléctrico…", "8517 Teléfonos…", "8517.13 Teléfonos inteligentes"],
      "descripcion": "Teléfonos inteligentes", "confianza": 0.86, "motivo": "sinónimo 'celular inteligente'" },
    { "codigo": "8517140000", "nivel": "subpartida_nacional",
      "descripcion": "Los demás teléfonos para redes celulares…", "confianza": 0.41, "motivo": "similitud de texto" }
  ],
  "preguntas_para_afinar": ["¿Es un teléfono inteligente (sistema operativo, aplicaciones) o un teléfono básico?"],
  "responsabilidad": "Resultado orientativo. La clasificación arancelaria oficial la determina la autoridad aduanera (SENIAT) conforme a las Reglas Generales para la Interpretación del Sistema Armonizado. La decisión corresponde al usuario o a su agente de aduanas.",
  "version_arancel": "Decreto 4.944 + reformas 2025"
}
```
*(Los códigos del ejemplo son ilustrativos; se validan contra el arancel cargado.)*

**Datos adicionales:**

```
arancel.sinonimo   (termino, prefijo varchar(2..10), prioridad)   -- nombres comerciales → partida
arancel.deteccion  (entrada jsonb, estado, candidato_elegido, creado_en)  -- para curaduría
```

- **Estados:** `determinado` (un candidato claro), `condicionado` (varios candidatos) y `no_determinado`.
- **Nunca se afirma una clasificación oficial.** Siempre es orientativa, con la ruta jerárquica (capítulo → partida → subpartida) para que el usuario la verifique.

## 5. Módulo IVA (rutas reorganizadas)

| Método | Ruta |
|---|---|
| `POST` | `/api/v1/iva/clasificar` |
| `POST` | `/api/v1/iva/clasificar/arancel` |
| `GET` | `/api/v1/iva/codigo/{codigo}` · `/api/v1/iva/sku/{sku}` |
| `GET` | `/api/v1/iva/alicuotas` · `/base-legal` · `/diccionario` · `/servicios` · `/glosario` |

El detalle está en [03](03-modelo-de-clasificacion.md) §5. Las rutas de ese documento quedan bajo el prefijo `/api/v1/iva/`.

## 6. Transversal

| Tema | Diseño |
|---|---|
| API key | Una sola key para todo el ecosistema, con **permisos por módulo**: `iva`, `bcv`, `arancel`. Se asignan en la UI de administración |
| Límite de peticiones | Por key y por módulo |
| Swagger | Un solo `/docs`, con etiquetas **IVA**, **BCV** y **Arancel** |
| Auditoría | Tabla `core.auditoria`, común a los tres módulos |
| Tareas programadas | Tasa BCV diaria, con el mecanismo que se elija para el despliegue (cron del contenedor o PM2) |

## 7. Módulos futuros y cómo agregarlos

El ecosistema está pensado para crecer. **Confirmado como idea futura:**

| Módulo | Qué respondería | Fuente oficial |
|---|---|---|
| **Calendario tributario** | ¿Qué días me toca declarar y pagar cada tributo? Según el tipo de contribuyente (especial u ordinario) y el **último dígito del RIF** | Providencia SNAT/2025/000091 (GO 43.283, 23/12/2025): **transcrita y verificada** en `datos/calendario/spe_2026/` ([12](analisis/12-analisis-calendarioapi.md)). Falta la norma para contribuyentes ordinarios (A40) |

**También confirmados como módulos futuros** (27/09/2026):

| Módulo | Qué respondería | Fuente oficial |
|---|---|---|
| **Unidad Tributaria** | Valor vigente de la U.T. e histórico | Providencia del SENIAT que fija cada valor, publicada en Gaceta Oficial |
| **IGTF** | Cálculo del 3 % sobre pagos en divisas o criptoactivos | Ley de Impuesto a las Grandes Transacciones Financieras (reforma 2022) |
| **Validación del RIF** | ¿El RIF tiene un formato válido? (tipo V/E/J/G/P/C, 8 dígitos y dígito verificador) | Normativa del Registro Único de Información Fiscal |

**Descartado por ahora:** retenciones de IVA (75 % / 100 %).

**Receta para agregar un módulo nuevo** (así cada uno se agrega igual y el ecosistema se mantiene ordenado):

1. Carpeta `modules/<nombre>/` y esquema propio `<nombre>` en PostgreSQL.
2. Rutas bajo `/api/v1/<nombre>/`.
3. Etiqueta propia en el Swagger.
4. Permiso propio en las API keys (`<nombre>`).
5. Sección en la UI de administración si tiene datos editables, con auditoría.
6. Base legal y fuente oficial documentadas (premisa 10).
7. Documento propio en `docs/`.
