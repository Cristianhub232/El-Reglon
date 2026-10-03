# Base de datos de El Renglón

> Generado por `herramientas/documentar_bd.py` el **03/10/2026 11:54** (hora de Caracas) a partir de la base en servicio y de los comentarios de `db/**/*.sql`. No editar a mano: se mejora el comentario SQL y se vuelve a generar. Solo describe la estructura y cuenta filas; **no contiene datos**.

## Resumen

- **Motor:** PostgreSQL 16.14 (contenedor `db`, imagen `postgres:16.14-alpine`, volumen `elrenglon-pgdata`; escucha en `127.0.0.1:55432`).
- **Bases:** elrenglon (411 MB), metabase (25 MB), postgres (7519 kB). `metabase` es la base interna de Metabase (sus preguntas, tableros y usuarios) y no se documenta aquí.
- **Tamaño de `elrenglon`:** 411 MB.
- **Extensiones:** pg_trgm 1.6, unaccent 1.1 (`pg_trgm`: búsqueda por similitud; `unaccent`: búsqueda sin tildes).
- **Instalación:** `herramientas/instalar_bd.sh` crea todos los esquemas y carga todas las semillas; es idempotente y cada carga va en una transacción con validaciones. Metabase: `herramientas/instalar_metabase.sh`.
- **Respaldos:** `pg_dump -Fc` antes de cada despliegue, en `~/respaldos/` del servidor (ver docs/19).
- **Convenciones:** fechas `date`/`timestamptz` (la app trabaja en hora de Caracas); montos y tasas `numeric` (la API los devuelve como texto decimal exacto); RIF con guiones (`J-12345678-9`).

| Esquema | Para qué | Tablas | Filas | Tamaño | Lo escribe | Docs |
|---|---|---:|---:|---:|---|---|
| [`core`](#esquema-core) | Núcleo: API keys, usuarios del panel, sesiones, solicitudes de API key, uso diario y auditoría | 6 | 173 | 344 kB | La app (panel y API) | [15](docs/15-plataforma.md), [18](docs/18-interfaz-pwa-panel.md) |
| [`iva`](#esquema-iva) | Clasificador de IVA: catálogo legal de reglas, alícuotas, base legal, decretos, consultas y productos no encontrados | 14 | 741 | 1 MB | Cargador `scripts/iva-cargar-catalogo.ts` y la app | [16](docs/16-clasificador-iva.md) |
| [`arancel`](#esquema-arancel) | Arancel de Aduanas (Decreto 4.944 y reformas 2025): secciones, capítulos, partidas, subpartidas, régimen legal y detección por nombre comercial | 17 + 2 vistas | 23.555 | 24.7 MB | Cargadores `herramientas/arancel` y `scripts/arancel-cargar-sinonimos.ts` | [09](docs/09-semilla-arancel.md), [17](docs/17-deteccion-arancelaria.md) |
| [`bcv`](#esquema-bcv) | Tasas oficiales del BCV: publicaciones, tasas por moneda, observaciones y fuentes | 6 + 1 vista | 9.266 | 1.1 MB | Cargador histórico y `bcv-programador` (8, 14 y 20 h) | [11](docs/11-historico-tasas-bcv.md), [15](docs/15-plataforma.md) |
| [`calendario`](#esquema-calendario) | Calendario tributario: obligaciones, vencimientos por terminal de RIF, condiciones y días inhábiles | 5 | 1.519 | 456 kB | Cargador `herramientas/calendario` | [13](docs/13-modulo-calendario.md) |
| [`rif`](#esquema-rif) | Validación del RIF con dígito verificador (solo funciones) | 0 | 0 | 0 B | Cargador `herramientas/calendario` | [13](docs/13-modulo-calendario.md) |
| [`noticias`](#esquema-noticias) | Noticiero: fuentes, titulares y lecturas | 3 | 860 | 1.1 MB | `noticias-programador` (cada hora) | [20](docs/20-noticiero.md) |
| [`comparador`](#esquema-comparador) | Comparador de precios: tiendas, sucursales, productos, precios observados, búsquedas e índice por sitemaps | 7 | 110.889 | 40.6 MB | Contenedor `comparador` (PM2, un proceso por tienda) | [22](docs/22-comparador.md) |
| [`analitica`](#esquema-analitica) | Analítica del sitio público: visitantes (cookie propia), visitas y RIF consultados; 12 meses | 3 | 201 | 216 kB | La app; purga en `noticias-programador` | [23](docs/23-analitica.md) |
| [`avisos`](#esquema-avisos) | Avisos push: suscripciones, RIF seguidos y envíos | 4 | 13 | 184 kB | La app y los programadores | [24](docs/24-avisos.md) |
| [`directorio`](#esquema-directorio) | Directorio de contribuyentes: empresas con contacto, importadores, sistemas de facturación y mayores pagadores (datos personales; semilla fuera del repositorio) | 6 | 2.032.640 | 330.1 MB | Cargador `herramientas/directorio` | [25](docs/25-directorio.md) |
| [`prospeccion`](#esquema-prospeccion) | Prospección comercial por correo: prospectos, bajas permanentes, envíos y ajustes | 4 | 654 | 536 kB | Panel y `noticias-programador` (cada 5 min) | [26](docs/26-prospeccion.md) |
| [`contacto`](#esquema-contacto) | Mensajes del botón flotante de contacto y cursor de lectura de los buzones | 2 | 1 | 80 kB | La app y `noticias-programador` | [27](docs/27-contacto-y-bandeja.md) |

## Roles y permisos

| Rol | Uso | Permisos |
|---|---|---|
| `elrenglon` (`POSTGRES_USER`) | La app, los programadores y los cargadores | Dueño de todos los esquemas |
| `metabase` | Metabase guarda su configuración | Dueño de la base `metabase` |
| `metabase_lectura` | Conexión de Metabase a los datos | **Solo lectura** (`default_transaction_read_only`, `statement_timeout` 120 s). Ver la columna «Metabase» de cada tabla |

Tablas con **datos personales** (marcadas con 🔒): correos, IP, RIF de personas, contraseñas o tokens en hash. En el panel solo las ve el superadministrador.

## Retención y limpieza

- `analitica.purgar()`: visitas y RIF consultados de más de 12 meses (cada hora, desde `noticias-programador`).
- `avisos.purgar()`: envíos de más de 12 meses y control de vencimientos ya pasados.
- Noticiero: titulares y lecturas de más de 90 días.
- `prospeccion.baja`: **nunca se borra** (lista de supresión permanente).

---

## Esquema `core`
<a id="esquema-core"></a>

El Renglón · Núcleo · API keys y auditoría de administración. Las claves se guardan solo como SHA-256; el token completo se muestra una única vez al crearlo.

**Lo escribe:** La app (panel y API) · **Documentación:** [15](docs/15-plataforma.md), [18](docs/18-interfaz-pwa-panel.md)

### `core.api_key` 🔒

*0 filas · 80 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `nombre` | text | no |  |  |
| `prefijo` | character(8) | no |  | identifica la clave sin revelarla |
| `hash_sha256` | character(64) | no |  |  |
| `permisos` | text[] | no |  |  |
| `limite_por_minuto` | integer | no | `60` |  |
| `activa` | boolean | no | `true` |  |
| `creada_en` | timestamptz | no | `now()` |  |
| `revocada_en` | timestamptz | sí |  |  |
| `ultimo_uso` | timestamptz | sí |  |  |
| `usuario_id` | integer | sí |  | → `core.usuario` · Dueño de cada API key (NULL: creada por la CLI) y quién la solicitó |
| `contacto` | text | sí |  |  |

- Regla `api_key_check`: `CHECK ((activa OR (revocada_en IS NOT NULL)))`
- Regla `api_key_limite_por_minuto_check`: `CHECK (((limite_por_minuto >= 1) AND (limite_por_minuto <= 10000)))`
- Regla `api_key_permisos_check`: `CHECK (((permisos <@ ARRAY['iva', 'bcv', 'arancel', 'calendario', 'rif', 'noticias', 'comparador', 'admin']) AND (cardinality(permisos) > 0)))`
- Única `api_key_hash_sha256_key`: `UNIQUE (hash_sha256)`
- Única `api_key_prefijo_key`: `UNIQUE (prefijo)`

### `core.auditoria` 🔒

*45 filas · 88 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `ocurrido_en` | timestamptz | no | `now()` |  |
| `actor` | text | no |  | 'cli', prefijo de la API key, etc. |
| `accion` | text | no |  |  |
| `detalle` | jsonb | no | `'{}'::jsonb` |  |

- Índice `auditoria_ocurrido_idx`: `USING btree (ocurrido_en DESC)`

### `core.sesion` 🔒

*0 filas · 48 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `token_hash` | character(64) | no |  | **PK** |
| `usuario_id` | integer | no |  | → `core.usuario` |
| `creada_en` | timestamptz | no | `now()` |  |
| `expira_en` | timestamptz | no |  |  |
| `ultimo_uso` | timestamptz | no | `now()` |  |
| `agente` | text | sí |  |  |

- Índice `sesion_usuario_idx`: `USING btree (usuario_id)`

### `core.solicitud_api_key` 🔒

*0 filas · 16 kB · Metabase: sí*

Solicitudes públicas de API key (formulario /solicitar-api-key); un administrador las aprueba o rechaza

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `creada_en` | timestamptz | no | `now()` |  |
| `nombre` | text | no |  |  |
| `correo` | text | no |  |  |
| `organizacion` | text | sí |  |  |
| `uso` | text | no |  |  |
| `permisos` | text[] | no |  |  |
| `estado` | text | no | `'pendiente'` |  |
| `atendida_por` | integer | sí |  | → `core.usuario` |
| `atendida_en` | timestamptz | sí |  |  |
| `api_key_id` | integer | sí |  | → `core.api_key` |

- Regla `solicitud_api_key_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente', 'aprobada', 'rechazada'])))`
- Regla `solicitud_api_key_permisos_check`: `CHECK (((permisos <@ ARRAY['iva', 'bcv', 'arancel', 'calendario', 'rif', 'noticias', 'comparador']) AND (cardinality(permisos) > 0)))`

### `core.uso_diario`

*127 filas · 64 kB · Metabase: sí*

Consultas por día, API key y módulo (0 = herramientas públicas sin API key). Se acumulan en memoria y se escriben cada 30 s: no guarda IP ni contenido de las consultas.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha` | date | no |  | **PK** |
| `api_key_id` | integer | no |  | **PK** |
| `modulo` | text | no |  | **PK** |
| `consultas` | integer | no | `0` |  |
| `errores` | integer | no | `0` | respuestas 4xx y 5xx (incluye los 429) |
| `limitadas` | integer | no | `0` | respuestas 429 (límite por minuto) |

### `core.usuario` 🔒

*1 filas · 48 kB · Metabase: sí*

El Renglón · Núcleo · Usuarios del panel, sesiones, solicitudes de API key y uso diario. Roles (resources/Admin.dc.html): super (acceso total), curador (catálogos IVA, arancel y calendario), dev (sus propias API keys) y lectura (consulta y reportes). Contraseñas con scrypt; sesiones en base de datos (el navegador solo guarda un token aleatorio y aquí se guarda su SHA-256); secreto TOTP cifrado con AES-256-GCM (clave derivada de APP_SECRETO).

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `nombre` | text | no |  |  |
| `correo` | text | no |  |  |
| `rol` | text | no |  |  |
| `clave_hash` | text | no |  |  |
| `debe_cambiar_clave` | boolean | no | `true` | la clave inicial la asigna un administrador |
| `totp_secreto` | text | sí |  | cifrado; NULL si no configuró la verificación en dos pasos |
| `totp_activo` | boolean | no | `false` |  |
| `activo` | boolean | no | `true` |  |
| `intentos_fallidos` | integer | no | `0` |  |
| `bloqueado_hasta` | timestamptz | sí |  |  |
| `creado_en` | timestamptz | no | `now()` |  |
| `ultimo_acceso` | timestamptz | sí |  |  |
| `notificaciones_vistas_en` | timestamptz | no | `now()` |  |

- Regla `usuario_check`: `CHECK (((NOT totp_activo) OR (totp_secreto IS NOT NULL)))`
- Regla `usuario_correo_check`: `CHECK ((correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'))`
- Regla `usuario_nombre_check`: `CHECK (((length(TRIM(BOTH FROM nombre)) >= 2) AND (length(TRIM(BOTH FROM nombre)) <= 120)))`
- Regla `usuario_rol_check`: `CHECK ((rol = ANY (ARRAY['super', 'curador', 'dev', 'lectura'])))`
- Índice único `usuario_correo_idx`: `USING btree (lower(correo))`

---

## Esquema `iva`
<a id="esquema-iva"></a>

El Renglón · Módulo IVA · Esquema PostgreSQL (16+). Ley de IVA (texto reformado, GO Ext. N° 6.507 del 29/01/2020) y decretos vigentes. El catálogo (base legal, reglas, opciones, relación con el arancel) se carga con scripts/iva-cargar-catalogo.ts desde datos/iva/catalogo.json, en una sola transacción.

**Lo escribe:** Cargador `scripts/iva-cargar-catalogo.ts` y la app · **Documentación:** [16](docs/16-clasificador-iva.md)

### `iva.alicuota`

*3 filas · 32 kB · Metabase: sí*

Componentes de alícuota por vigencia (se cambian por decreto: nunca van fijos en el código)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `porcentaje` | numeric(5,2) | no |  |  |
| `vigente_desde` | date | no |  | **PK** |
| `vigente_hasta` | date | sí |  |  |
| `instrumento` | text | no |  |  |

- Regla `alicuota_check`: `CHECK (((vigente_hasta IS NULL) OR (vigente_hasta >= vigente_desde)))`
- Regla `alicuota_codigo_check`: `CHECK ((codigo = ANY (ARRAY['GENERAL', 'REDUCIDA', 'ADICIONAL_SUNTUARIA'])))`
- Regla `alicuota_porcentaje_check`: `CHECK (((porcentaje >= (0)) AND (porcentaje <= (100))))`

### `iva.articulo_no_encontrado`

*4 filas · 64 kB · Metabase: sí*

El Renglón · Módulo IVA · Artículos que el clasificador no encontró (estado no_determinado). Registra qué se consultó y desde dónde, para completar el catálogo (curaduría). Lo aplica el cargador del catálogo.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `consultado_en` | timestamptz | no | `now()` |  |
| `texto` | text | sí |  | Qué se consultó nombre tal como lo escribió el usuario |
| `texto_normalizado` | text | sí |  | minúsculas y sin acentos, para agrupar consultas iguales |
| `codigos` | text[] | no | `'{}'` | códigos de barras, ISBN, SKU… enviados |
| `tipos_codigo` | text[] | no | `'{}'` | tipo detectado de cada código (EAN-13, SKU…) |
| `codigo_arancelario` | varchar(10) | sí |  |  |
| `producto_off` | text | sí |  | nombre del producto si Open Food Facts lo identificó |
| `operacion` | text | no |  |  |
| `tipo` | text | sí |  |  |
| `fecha_operacion` | date | sí |  |  |
| `canal` | text | no |  | Desde dónde API con API key o herramienta pública del sitio |
| `api_key_id` | integer | sí |  | quién (consultas por la API) |
| `ip` | inet | sí |  | IP del cliente (solo detrás del proxy, TRUST_PROXY=1) |
| `ubicacion` | text | sí |  | estado o ciudad declarada en la consulta (opcional) |
| `agente` | text | sí |  | navegador o cliente HTTP |
| `revisado` | boolean | no | `false` | Curaduría |
| `revisado_por` | text | sí |  |  |
| `revisado_en` | timestamptz | sí |  |  |
| `regla_asignada` | text | sí |  | regla del catálogo a la que corresponde (si se decidió) |
| `nota` | text | sí |  |  |

- Regla `articulo_no_encontrado_canal_check`: `CHECK ((canal = ANY (ARRAY['api', 'web'])))`
- Regla `articulo_no_encontrado_operacion_check`: `CHECK ((operacion = ANY (ARRAY['nacional', 'importacion'])))`
- Regla `articulo_no_encontrado_tipo_check`: `CHECK ((tipo = ANY (ARRAY['bien', 'servicio'])))`
- Índice `articulo_no_encontrado_pendiente_idx`: `USING btree (revisado, consultado_en DESC)`
- Índice `articulo_no_encontrado_texto_idx`: `USING btree (texto_normalizado)`

### `iva.base_legal`

*78 filas · 112 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | text | no |  | **PK** · p. ej. LIVA-18-1-c |
| `norma` | text | no |  |  |
| `gaceta` | text | no |  |  |
| `articulo` | text | no |  |  |
| `numeral` | text | sí |  |  |
| `literal` | text | sí |  |  |
| `texto` | text | no |  | texto literal |
| `fuente_pdf` | text | sí |  | PDF de la Gaceta en fuentes/ (NULL: sin fuente oficial a mano) |
| `verificado` | boolean | no |  | true: el cargador comprobó el texto contra el PDF de la Gaceta |

### `iva.caso_prueba`

*116 filas · 112 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `orden` | integer | no |  | **PK** |
| `caso` | jsonb | no |  |  |

### `iva.catalogo_version`

*1 filas · 80 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `version` | text | no |  | SHA-256 corto del catalogo.json |
| `cargado_en` | timestamptz | no | `now()` |  |
| `estado` | text | no | `'pendiente_validacion_asesor'` |  |
| `nota` | text | sí |  |  |
| `validaciones` | jsonb | sí |  |  |

- Única `catalogo_version_version_key`: `UNIQUE (version)`

### `iva.categoria`

*6 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `denominacion` | text | no |  | terminología SENIAT (docs/06) |
| `componentes` | text[] | no |  | componentes de iva.alicuota que suma |
| `marca_exento` | boolean | no |  | "(E)" en la factura (Providencia SNAT/2011/00071) |
| `concepto_nacional` | text | no |  | renglón de la declaración (a verificar, B18) |
| `concepto_importacion` | text | no |  |  |

### `iva.consulta_registro` 🔒

*21 filas · 32 kB · Metabase: sí*

Consultas ambiguas o sin resolver, para mejorar el catálogo (RF-14)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `ocurrido_en` | timestamptz | no | `now()` |  |
| `estado` | text | no |  |  |
| `entrada` | jsonb | no |  |  |
| `reglas` | text[] | no | `'{}'` |  |
| `api_key_id` | integer | sí |  |  |
| `revisada` | boolean | no | `false` |  |

- Regla `consulta_registro_estado_check`: `CHECK ((estado = ANY (ARRAY['condicionado', 'no_determinado'])))`

### `iva.decreto`

*1 filas · 32 kB · Metabase: sí*

Decretos que modifican el tratamiento según la operación y la fecha

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `nombre` | text | no |  |  |
| `gaceta` | text | no |  |  |
| `efecto` | text | no |  |  |
| `vigente_desde` | date | no |  |  |
| `vigente_hasta` | date | sí |  |  |
| `base_legal` | text | no |  | → `iva.base_legal` |
| `nota` | text | sí |  |  |

- Regla `decreto_efecto_check`: `CHECK ((efecto = 'SUSPENDE_EXENCION_IMPORTACION'))`

### `iva.observacion_precio`

*0 filas · 48 kB · Metabase: sí*

Minería de precios (análisis internos; sin datos personales)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `observado_en` | timestamptz | no | `now()` |  |
| `fecha_operacion` | date | no |  |  |
| `codigo_barras` | text | sí |  |  |
| `codigo_arancelario` | varchar(10) | sí |  |  |
| `nombre_normalizado` | text | sí |  |  |
| `regla_id` | text | sí |  |  |
| `precio_compra` | numeric(20,4) | sí |  |  |
| `precio_venta` | numeric(20,4) | sí |  |  |
| `moneda` | character(3) | no |  |  |
| `precio_compra_bs` | numeric(24,4) | sí |  |  |
| `precio_venta_bs` | numeric(24,4) | sí |  |  |
| `precio_compra_usd` | numeric(24,6) | sí |  |  |
| `precio_venta_usd` | numeric(24,6) | sí |  |  |
| `tasa_bcv` | numeric(20,8) | sí |  |  |
| `tasa_fecha_valor` | date | sí |  |  |
| `ubicacion` | text | sí |  |  |
| `api_key_id` | integer | sí |  |  |
| `calidad` | text | no | `'ok'` |  |

- Regla `observacion_precio_calidad_check`: `CHECK ((calidad = ANY (ARRAY['ok', 'atipico', 'duplicado'])))`
- Regla `observacion_precio_check`: `CHECK (((precio_compra IS NOT NULL) OR (precio_venta IS NOT NULL)))`
- Regla `observacion_precio_moneda_check`: `CHECK ((moneda = ANY (ARRAY['VES'::bpchar, 'USD'::bpchar])))`
- Regla `observacion_precio_precio_compra_check`: `CHECK ((precio_compra > (0)))`
- Regla `observacion_precio_precio_venta_check`: `CHECK ((precio_venta > (0)))`
- Índice `observacion_precio_regla_idx`: `USING btree (regla_id, observado_en)`

### `iva.opcion_regla`

*154 filas · 104 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `regla_id` | text | no |  | **PK** · → `iva.regla` |
| `orden` | smallint | no |  | **PK** |
| `categoria` | text | no |  | → `iva.categoria` |
| `base_legal` | text[] | no |  | ids de iva.base_legal |
| `condicion` | text | sí |  | texto para el usuario (NULL: sin condición) |
| `condicion_eval` | jsonb | sí |  | {"campo":"precio_usd","op":">=","valor":300}; campos: precio_usd, peso_g, uso, cliente |

### `iva.producto_cache`

*1 filas · 32 kB · Metabase: sí*

Caché de productos identificados por código de barras (Open Food Facts y otras fuentes)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `encontrado` | boolean | no |  |  |
| `nombre` | text | sí |  |  |
| `marca` | text | sí |  |  |
| `cantidad` | text | sí |  |  |
| `categorias` | text[] | no | `'{}'` |  |
| `fuente` | text | no |  |  |
| `consultado_en` | timestamptz | no | `now()` |  |

### `iva.regla`

*115 filas · 152 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | text | no |  | **PK** |
| `tipo` | text | no |  |  |
| `nombre` | text | no |  |  |
| `prioridad` | smallint | no |  | mayor gana |
| `patrones_incluir` | text[] | no | `'{}'` | regex sobre el texto normalizado (minúsculas, sin acentos) |
| `patrones_excluir` | text[] | no | `'{}'` |  |
| `patrones_todos` | text[] | no | `'{}'` | además, TODOS estos deben coincidir (p. ej. 'tomate' y 'congelado') |
| `categorias_off` | text[] | no | `'{}'` | categorías de Open Food Facts (en:...) |
| `zona_gris` | boolean | no | `false` |  |
| `nota` | text | sí |  |  |

- Regla `regla_prioridad_check`: `CHECK (((prioridad >= 1) AND (prioridad <= 100)))`
- Regla `regla_tipo_check`: `CHECK ((tipo = ANY (ARRAY['BIEN', 'SERVICIO'])))`

### `iva.regla_arancel`

*126 filas · 72 kB · Metabase: sí*

Relación prefijo arancelario → regla (gana el prefijo más largo)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `prefijo` | varchar(10) | no |  | **PK** |
| `regla_id` | text | no |  | → `iva.regla` |
| `nota` | text | sí |  |  |

- Regla `regla_arancel_prefijo_check`: `CHECK (((prefijo) ~ '^\d{2,10}$'))`

### `iva.regla_historial`

*115 filas · 152 kB · Metabase: sí*

El Renglón · Módulo IVA · Historial de versiones de las reglas y casos de referencia. Cada regla lleva su historial: la carga del catálogo (origen 'carga') y las ediciones del panel (origen 'panel'), con la Gaceta que respalda el cambio, el motivo y el contenido antes y después. Los casos de referencia se guardan en la base para que el panel los ejecute antes de aceptar una edición.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `regla_id` | text | no |  |  |
| `version` | integer | no |  |  |
| `ocurrido_en` | timestamptz | no | `now()` |  |
| `actor` | text | no |  |  |
| `origen` | text | no |  |  |
| `gaceta` | text | sí |  |  |
| `motivo` | text | no |  |  |
| `antes` | jsonb | sí |  |  |
| `despues` | jsonb | no |  |  |
| `catalogo_version` | text | sí |  |  |

- Regla `regla_historial_origen_check`: `CHECK ((origen = ANY (ARRAY['carga', 'panel'])))`
- Regla `regla_historial_version_check`: `CHECK ((version >= 1))`
- Única `regla_historial_regla_id_version_key`: `UNIQUE (regla_id, version)`

### Funciones de `iva`

- `iva.alicuotas_vigentes(p_fecha date)` → `TABLE(codigo text, porcentaje numeric, instrumento text)` (sql): Alícuotas vigentes a una fecha

---

## Esquema `arancel`
<a id="esquema-arancel"></a>

El Renglón · Módulo Arancel · Esquema PostgreSQL (16+). Fuente: Arancel de Aduanas, Decreto N° 4.944 (GO Ext. N° 6.804, 25/04/2024) y reformas. La jerarquía se basa en CLAVES NATURALES (códigos), nunca en IDs por orden de inserción.

**Lo escribe:** Cargadores `herramientas/arancel` y `scripts/arancel-cargar-sinonimos.ts` · **Documentación:** [09](docs/09-semilla-arancel.md), [17](docs/17-deteccion-arancelaria.md)

### `arancel.abreviatura`

*66 filas · 32 kB · Metabase: sí*

"Abreviaturas y Símbolos" usados en las descripciones de la nomenclatura

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `sigla` | text | no |  | **PK** |
| `significado` | text | no |  |  |
| `pagina_gaceta` | smallint | no |  |  |

### `arancel.cambio`

*5.301 filas · 760 kB · Metabase: sí*

Registro de cada cambio introducido por las reformas (antes -> después), con su base legal

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `version_id` | integer | no |  | → `arancel.version` |
| `articulo` | text | no |  |  |
| `tipo` | text | no |  | crea \| elimina \| modifica \| exaec \| regimen \| partida \| regimen_legal |
| `codigo` | varchar(10) | no |  |  |
| `campo` | text | no | `''` |  |
| `antes` | text | no | `''` |  |
| `despues` | text | no | `''` |  |

- Índice `cambio_codigo_idx`: `USING btree (codigo)`

### `arancel.capitulo`

*98 filas · 64 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | character(2) | no |  | **PK** |
| `seccion` | smallint | no |  | → `arancel.seccion` |
| `titulo` | text | no |  |  |
| `reservado` | boolean | no | `false` |  |

- Regla `capitulo_codigo_check`: `CHECK ((codigo ~ '^\d{2}$'))`

### `arancel.caso_deteccion`

*40 filas · 80 kB · Metabase: sí*

Casos de referencia de la detección, para validar en el panel los grupos nuevos antes de guardarlos

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `orden` | integer | no |  | **PK** |
| `caso` | jsonb | no |  |  |

### `arancel.conversion_unidad`

*20 filas · 48 kB · Metabase: sí*

"Tabla de conversión de las principales unidades físicas de medida"

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `orden` | smallint | no |  | **PK** |
| `magnitud` | text | no |  |  |
| `unidad` | text | no |  | p. ej. '1 Libra (UK, USA)' |
| `equivalencia` | numeric | no |  |  |
| `unidad_equivalente` | text | no |  |  |
| `equivalencia_texto` | text | no |  | tal como figura en la Gaceta |
| `nota` | text | sí |  |  |
| `pagina_gaceta` | smallint | no |  |  |

- Regla `conversion_unidad_equivalencia_check`: `CHECK ((equivalencia > (0)))`
- Regla `conversion_unidad_magnitud_check`: `CHECK ((magnitud = ANY (ARRAY['Longitud', 'Masa', 'Superficie', 'Volumen'])))`
- Regla `conversion_unidad_unidad_equivalente_check`: `CHECK ((unidad_equivalente = ANY (ARRAY['m', 'kg', 'm²', 'm³', 'l'])))`
- Única `conversion_unidad_unidad_key`: `UNIQUE (unidad)`

### `arancel.deteccion`

*0 filas · 48 kB · Metabase: sí*

Detecciones, para curaduría del diccionario (sin datos personales)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `ocurrido_en` | timestamptz | no | `now()` |  |
| `estado` | text | no |  |  |
| `entrada` | jsonb | no |  |  |
| `candidatos` | text[] | no | `'{}'` |  |
| `api_key_id` | integer | sí |  |  |
| `revisada` | boolean | no | `false` |  |

- Regla `deteccion_estado_check`: `CHECK ((estado = ANY (ARRAY['determinado', 'condicionado', 'no_determinado'])))`

### `arancel.indice_busqueda` (vista)

*13.9 MB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | varchar(10) | sí |  |  |
| `codigo_formateado` | text | sí |  |  |
| `capitulo` | character(2) | sí |  |  |
| `partida` | character(4) | sí |  |  |
| `es_terminal` | boolean | sí |  |  |
| `descripcion` | text | sí |  |  |
| `ruta` | text | sí |  |  |
| `documento` | tsvector | sí |  |  |

- Índice único `indice_busqueda_codigo_idx`: `USING btree (codigo)`
- Índice `indice_busqueda_documento_idx`: `USING gin (documento)`

### `arancel.observacion_fuente`

*49 filas · 32 kB · Metabase: sí*

Vacíos e incoherencias de la propia Gaceta, registrados para revisión humana (nunca se corrigen solos)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `codigo` | varchar(10) | no |  |  |
| `tipo` | text | no |  |  |
| `detalle` | text | no | `''` |  |
| `valor_fuente` | text | no | `''` |  |
| `version_id` | integer | no |  | → `arancel.version` |
| `revisada` | boolean | no | `false` |  |

### `arancel.partida`

*1.275 filas · 328 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | character(4) | no |  | **PK** |
| `capitulo` | character(2) | no |  | → `arancel.capitulo` |
| `descripcion` | text | no |  |  |
| `origen_descripcion` | text | no |  |  |

- Regla `partida_check`: `CHECK (("left"((codigo), 2) = (capitulo)))`
- Regla `partida_codigo_check`: `CHECK ((codigo ~ '^\d{4}$'))`
- Regla `partida_origen_descripcion_check`: `CHECK ((origen_descripcion = ANY (ARRAY['encabezado', 'linea_unica'])))`

### `arancel.regimen_legal`

*21 filas · 32 kB · Metabase: sí*

Art. 21 del Decreto (códigos 1..21)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | smallint | no |  | **PK** |
| `descripcion` | text | no |  |  |

- Regla `regimen_legal_codigo_check`: `CHECK (((codigo >= 1) AND (codigo <= 21)))`

### `arancel.regla_interpretacion`

*15 filas · 48 kB · Metabase: sí*

Reglas Generales para la Interpretación (RGI 1..6) y Reglas Generales Complementarias (art. 37)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `orden` | smallint | no |  | **PK** |
| `tipo` | text | no |  |  |
| `numero` | smallint | no |  | 0 = preámbulo |
| `literal` | character(1) | sí |  | NULL = texto principal de la regla |
| `texto` | text | no |  |  |
| `pagina_gaceta` | smallint | no |  |  |

- Regla `regla_interpretacion_literal_check`: `CHECK ((literal = ANY (ARRAY['a'::bpchar, 'b'::bpchar, 'c'::bpchar])))`
- Regla `regla_interpretacion_numero_check`: `CHECK (((numero >= 0) AND (numero <= 6)))`
- Regla `regla_interpretacion_tipo_check`: `CHECK ((tipo = ANY (ARRAY['general', 'complementaria'])))`
- Única `regla_interpretacion_tipo_numero_literal_key`: `UNIQUE (tipo, numero, literal)`

### `arancel.seccion`

*22 filas · 48 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `numero` | smallint | no |  | **PK** |
| `romano` | text | no |  |  |
| `titulo` | text | no |  |  |
| `capitulo_desde` | character(2) | no |  |  |
| `capitulo_hasta` | character(2) | no |  |  |

- Regla `seccion_check`: `CHECK ((capitulo_desde <= capitulo_hasta))`
- Regla `seccion_numero_check`: `CHECK (((numero >= 1) AND (numero <= 22)))`
- Única `seccion_romano_key`: `UNIQUE (romano)`

### `arancel.sinonimo`

*172 filas · 152 kB · Metabase: sí*

Diccionario de nombres comerciales → prefijos arancelarios (datos/arancel/sinonimos.json)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `grupo` | text | no |  |  |
| `terminos` | text[] | no |  | normalizados: minúsculas, sin acentos; admiten el plural simple |
| `excluir` | text[] | no | `'{}'` |  |
| `prefijos` | text[] | no |  |  |
| `categorias_off` | text[] | no | `'{}'` |  |
| `prioridad` | smallint | no |  |  |
| `nota` | text | sí |  |  |
| `origen` | text | no | `'archivo'` | Grupos agregados desde el panel: sobreviven a la recarga del archivo (el archivo gana si trae el mismo grupo) |
| `creado_por` | text | sí |  |  |
| `creado_en` | timestamptz | sí |  |  |

- Regla `sinonimo_origen_check`: `CHECK ((origen = ANY (ARRAY['archivo', 'panel'])))`
- Regla `sinonimo_prefijos_check`: `CHECK ((cardinality(prefijos) > 0))`
- Regla `sinonimo_prioridad_check`: `CHECK (((prioridad >= 1) AND (prioridad <= 100)))`
- Única `sinonimo_grupo_key`: `UNIQUE (grupo)`

### `arancel.sinonimo_version`

*1 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `version` | text | no |  | **PK** · SHA-256 corto de sinonimos.json |
| `cargado_en` | timestamptz | no | `now()` |  |
| `validaciones` | jsonb | sí |  |  |

### `arancel.subpartida`

*16.432 filas · 9 MB · Metabase: sí*

Nodos del árbol: agrupaciones y líneas terminales (declarables)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | varchar(10) | no |  | **PK** |
| `codigo_formateado` | text | no |  | como aparece en la Gaceta |
| `partida` | character(4) | no |  | → `arancel.partida` |
| `padre` | varchar(10) | sí |  | → `arancel.subpartida` |
| `nivel` | smallint | no |  | guiones en la Gaceta |
| `orden` | integer | no |  | orden de aparición en la Gaceta |
| `descripcion` | text | no |  |  |
| `es_terminal` | boolean | no |  |  |
| `aec` | numeric(5,2) | sí |  |  |
| `marca_aec` | text | sí |  |  |
| `exaec` | numeric(5,2) | sí |  |  |
| `marca_exaec` | text | sí |  |  |
| `regimen_importacion` | smallint[] | no | `'{}'` |  |
| `regimen_exportacion` | smallint[] | no | `'{}'` |  |
| `unidad` | text | sí |  | → `arancel.unidad_fisica` |
| `pagina_gaceta` | smallint | no |  |  |
| `version_id` | integer | no |  | → `arancel.version` |

- Regla `subpartida_aec_check`: `CHECK (((aec >= (0)) AND (aec <= (100))))`
- Regla `subpartida_check`: `CHECK (("left"((codigo), 4) = (partida)))`
- Regla `subpartida_check1`: `CHECK (((NOT es_terminal) OR (length((codigo)) = 10)))`
- Regla `subpartida_check2`: `CHECK (((padre IS NULL) OR ((codigo) ~~ (rtrim((padre), '0') \|\| '%'))))`
- Regla `subpartida_codigo_check`: `CHECK (((codigo) ~ '^\d{4,10}$'))`
- Regla `subpartida_exaec_check`: `CHECK (((exaec >= (0)) AND (exaec <= (100))))`
- Regla `subpartida_marca_aec_check`: `CHECK ((marca_aec = ANY (ARRAY['BK', 'BIT'])))`
- Regla `subpartida_marca_exaec_check`: `CHECK ((marca_exaec = ANY (ARRAY['A', 'E', 'E,A', '±DV'])))`
- Regla `subpartida_nivel_check`: `CHECK (((nivel >= 0) AND (nivel <= 8)))`
- Regla `subpartida_regimen_exportacion_check`: `CHECK ((regimen_exportacion <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21}'))`
- Regla `subpartida_regimen_importacion_check`: `CHECK ((regimen_importacion <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21}'))`
- Única `subpartida_orden_key`: `UNIQUE (orden)`
- Índice `subpartida_desc_trgm`: `USING gin (descripcion gin_trgm_ops)`
- Índice `subpartida_padre_idx`: `USING btree (padre)`
- Índice `subpartida_partida_idx`: `USING btree (partida)`

### `arancel.unidad_fisica`

*12 filas · 32 kB · Metabase: sí*

Tabla oficial "Unidades Físicas (U.F.) por subpartida" del Decreto

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `sigla` | text | no |  | **PK** |
| `nombre` | text | no |  |  |
| `magnitud` | text | no |  |  |

### `arancel.v_subpartida_ruta` (vista)

*0 B · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | varchar(10) | sí |  |  |
| `codigo_formateado` | text | sí |  |  |
| `es_terminal` | boolean | sí |  |  |
| `capitulo` | character(2) | sí |  |  |
| `partida` | character(4) | sí |  |  |
| `ruta` | text | sí |  |  |
| `aec` | numeric(5,2) | sí |  |  |
| `marca_aec` | text | sí |  |  |
| `exaec` | numeric(5,2) | sí |  |  |
| `marca_exaec` | text | sí |  |  |
| `regimen_importacion` | smallint[] | sí |  |  |
| `regimen_exportacion` | smallint[] | sí |  |  |
| `unidad` | text | sí |  |  |

### `arancel.version`

*4 filas · 48 kB · Metabase: sí*

Versión normativa cargada (decreto base y cada reforma)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `instrumento` | text | no |  | p. ej. 'Decreto N° 4.944' |
| `gaceta` | text | no |  | p. ej. 'GO Ext. N° 6.804' |
| `fecha_publicacion` | date | no |  |  |
| `vigente_desde` | date | sí |  |  |
| `descripcion` | text | sí |  |  |
| `fuente_archivo` | text | no |  |  |
| `fuente_sha256` | character(64) | no |  |  |
| `cargado_en` | timestamptz | no | `now()` |  |

- Regla `version_fuente_sha256_check`: `CHECK ((fuente_sha256 ~ '^[0-9a-f]{64}$'))`
- Única `version_instrumento_gaceta_key`: `UNIQUE (instrumento, gaceta)`

### `arancel.vocabulario`

*27 filas · 64 kB · Metabase: sí*

Vocabulario comercial → palabras del texto oficial ("blanco" → "blanqueado"), solo para afinar la subpartida

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `comercial` | text | no |  | **PK** |
| `oficial` | text | no |  |  |

### Funciones de `arancel`

- `arancel.puntuar_texto(p_texto text, p_prefijos text[], p_limite integer)` → `TABLE(codigo character varying, frase boolean, cobertura numeric, en_partida in…` (sql): Puntuación por texto de los códigos declarables: cobertura = fracción de las palabras (raíces en español) de la consulta que aparecen en la ruta; en_partida = cuántas aparecen en el texto de la partida; en_descripcion = cuántas aparecen en la descripción propia del código; frase = aparecen juntas y en orden ("cepillo de dientes" frente a "cepillar … dientes de engranajes"). Con p_prefijos, solo dentro de esos prefijos; sin ellos, todo el arancel salvo los capítulos 98 y 99 (regímenes especiales).

---

## Esquema `bcv`
<a id="esquema-bcv"></a>

El Renglón · Módulo BCV · Esquema PostgreSQL (16+). Tipo de Cambio de Referencia del BCV (Sistema de Mercado Cambiario). Tasa OFICIAL = venta_bs ("Venta (ASK)" en Bs./moneda), la misma que publica la portada del BCV. Base legal: Convenio Cambiario N° 1, art. 9, parágrafo primero; Resolución N° 19-05-01.

**Lo escribe:** Cargador histórico y `bcv-programador` (8, 14 y 20 h) · **Documentación:** [11](docs/11-historico-tasas-bcv.md), [15](docs/15-plataforma.md)

### `bcv.dia_sin_publicacion`

*35 filas · 32 kB · Metabase: sí*

Días hábiles (lunes a viernes) sin fecha valor: feriados bancarios observados en las publicaciones

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha` | date | no |  | **PK** |
| `motivo` | text | no | `'feriado bancario (inferido: día hábil sin fecha valor en l…` |  |

- Regla `dia_sin_publicacion_fecha_check`: `CHECK (((EXTRACT(isodow FROM fecha) >= (1)) AND (EXTRACT(isodow FROM fecha) <= (5))))`

### `bcv.fuente`

*11 filas · 48 kB · Metabase: sí*

Origen de cada dato: archivo histórico .xls, portada del BCV o migración de otro sistema

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `tipo` | text | no |  |  |
| `archivo` | text | no |  | nombre del archivo o URL |
| `sha256` | character(64) | sí |  |  |
| `periodo` | text | sí |  | p. ej. '2025-T1' |
| `cargado_en` | timestamptz | no | `now()` |  |

- Regla `fuente_sha256_check`: `CHECK ((sha256 ~ '^[0-9a-f]{64}$'))`
- Regla `fuente_tipo_check`: `CHECK ((tipo = ANY (ARRAY['xls_historico', 'portada', 'migracion'])))`
- Única `fuente_archivo_key`: `UNIQUE (archivo)`

### `bcv.moneda`

*21 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | character(3) | no |  | **PK** · tal como lo publica el BCV |
| `pais` | text | no |  |  |
| `codigo_iso` | character(3) | no |  | ISO 4217 (MXP -> MXN) |
| `nota` | text | sí |  |  |

- Regla `moneda_codigo_check`: `CHECK ((codigo ~ '^[A-Z]{3}$'))`

### `bcv.observacion`

*1 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `tipo` | text | no |  |  |
| `fecha_valor` | date | sí |  |  |
| `moneda` | character(3) | sí |  |  |
| `detalle` | text | no | `''` |  |
| `revisada` | boolean | no | `false` |  |

### `bcv.publicacion`

*421 filas · 96 kB · Metabase: sí*

Una publicación por FECHA VALOR (el día en que rige la tasa)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha_valor` | date | no |  | **PK** |
| `fecha_operacion` | date | sí |  | NULL si la fuente es la portada (no la informa) |
| `publicado_en` | timestamptz | sí |  | hora de publicación indicada en la hoja |
| `fuente_id` | integer | no |  | → `bcv.fuente` |
| `hoja` | text | sí |  |  |

- Regla `publicacion_check`: `CHECK (((fecha_operacion IS NULL) OR ((fecha_valor > fecha_operacion) AND (fecha_valor <= (fecha_operacion + 6)))))`

### `bcv.tasa`

*8.777 filas · 848 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha_valor` | date | no |  | **PK** · → `bcv.publicacion` |
| `moneda` | character(3) | no |  | **PK** · → `bcv.moneda` |
| `compra_bs` | numeric(20,8) | sí |  | NULL si la fuente es la portada |
| `venta_bs` | numeric(20,8) | no |  | TASA OFICIAL |
| `cotizacion_compra` | numeric(20,8) | sí |  | M.E./US$ (EUR: US$/EUR) |
| `cotizacion_venta` | numeric(20,8) | sí |  |  |

- Regla `tasa_check`: `CHECK (((compra_bs <= venta_bs) AND (cotizacion_compra <= cotizacion_venta)))`
- Regla `tasa_compra_bs_check`: `CHECK ((compra_bs > (0)))`
- Regla `tasa_cotizacion_compra_check`: `CHECK ((cotizacion_compra > (0)))`
- Regla `tasa_cotizacion_venta_check`: `CHECK ((cotizacion_venta > (0)))`
- Regla `tasa_venta_bs_check`: `CHECK ((venta_bs > (0)))`

### `bcv.v_tasa_oficial` (vista)

*0 B · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha_valor` | date | sí |  |  |
| `moneda` | character(3) | sí |  |  |
| `tasa_bs` | numeric(20,8) | sí |  |  |
| `fecha_operacion` | date | sí |  |  |
| `publicado_en` | timestamptz | sí |  |  |
| `fuente` | text | sí |  |  |
| `archivo` | text | sí |  |  |

### Funciones de `bcv`

- `bcv.moneda_mayor_valor(p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Caracas')))` → `TABLE(fecha_consultada date, fecha_valor date, moneda character, tasa_bs numeri…` (sql): COT arts. 91 y 92: las multas se expresan en "el tipo de cambio oficial de la moneda de mayor valor, publicado por el Banco Central de Venezuela". Devuelve esa moneda y su tasa para la fecha dada (la del día o, si es inhábil, la vigente el siguiente día hábil, como en tasa_aplicable).
- `bcv.tasa_aplicable(p_fecha date, p_moneda character DEFAULT 'USD'::bpchar)` → `TABLE(fecha_operacion_consultada date, fecha_valor date, moneda character, tasa…` (sql): Tasa APLICABLE a una operación (art. 25 de la Ley de IVA): la del día de la operación; si ese día no es hábil para el sector financiero, la vigente en el día hábil inmediatamente siguiente. Como solo los días hábiles tienen fecha valor, es la primera fecha valor >= fecha de la operación. No devuelve filas si la fecha es posterior a la última publicación (nunca se inventa una tasa).

---

## Esquema `calendario`
<a id="esquema-calendario"></a>

El Renglón · Módulo Calendario tributario · Esquema PostgreSQL (16+). Especiales: Providencia SNAT/2025/000091 (GO 43.283). Ordinarios (IVA): art. 60 Reglamento. General de la Ley de IVA. Plazos en día inhábil: COT art. 10 (num. 3 y parágrafo único: los días en que los bancos no abren al público son inhábiles para declarar y pagar). Requiere el esquema rif.

**Lo escribe:** Cargador `herramientas/calendario` · **Documentación:** [13](docs/13-modulo-calendario.md)

### `calendario.condicion`

*7 filas · 32 kB · Metabase: sí*

Condiciones que el contribuyente declara (no se deducen del RIF)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `descripcion` | text | no |  |  |

### `calendario.dia_inhabil`

*25 filas · 64 kB · Metabase: sí*

Días inhábiles para declarar y pagar (COT art. 10): feriados nacionales (LOTTT art. 184) y días bancarios no laborables del calendario de SUDEBAN

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `fecha` | date | no |  | **PK** |
| `descripcion` | text | no |  |  |
| `tipo` | text | no |  |  |
| `base_legal` | text | no |  |  |
| `origen` | text | no | `'semilla'` | --------------------------------------------------------------------------- Días inhábiles agregados desde el panel (p. ej. un día no laborable decretado): sobreviven a la recarga de la semilla, y las prórrogas se recalculan con ellos. |
| `agregado_por` | text | sí |  |  |
| `agregado_en` | timestamptz | sí |  |  |

- Regla `dia_inhabil_origen_check`: `CHECK ((origen = ANY (ARRAY['semilla', 'panel'])))`
- Regla `dia_inhabil_tipo_check`: `CHECK ((tipo = ANY (ARRAY['NACIONAL', 'BANCARIO'])))`

### `calendario.instrumento`

*3 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `nombre` | text | no |  |  |
| `gaceta` | text | no |  |  |
| `fecha_publicacion` | date | no |  |  |
| `fuente_archivo` | text | sí |  |  |
| `fuente_sha256` | character(64) | sí |  |  |

- Regla `instrumento_fuente_sha256_check`: `CHECK ((fuente_sha256 ~ '^[0-9a-f]{64}$'))`

### `calendario.obligacion`

*14 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `codigo` | text | no |  | **PK** |
| `instrumento` | text | no |  | → `calendario.instrumento` |
| `tipo_contribuyente` | text | no |  |  |
| `base_legal` | text | no |  |  |
| `nombre` | text | no |  |  |
| `aplica_a` | text | no |  |  |
| `requiere` | text | sí |  | → `calendario.condicion` · NULL: aplica a todo el tipo |
| `excluye` | text | sí |  | → `calendario.condicion` |
| `nota` | text | sí |  |  |

- Regla `obligacion_tipo_contribuyente_check`: `CHECK ((tipo_contribuyente = ANY (ARRAY['ESPECIAL', 'ORDINARIO'])))`

### `calendario.vencimiento`

*1.470 filas · 296 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `obligacion` | text | no |  | **PK** · → `calendario.obligacion` |
| `terminal` | smallint | no |  | **PK** · último dígito del RIF |
| `fecha` | date | no |  | **PK** · fecha fijada por la norma |
| `fecha_prorrogada` | date | sí |  | si la fecha es inhábil: primer día hábil siguiente (COT art. 10) |
| `periodo_desde` | date | sí |  |  |
| `periodo_hasta` | date | sí |  |  |

- Regla `vencimiento_check`: `CHECK (((periodo_desde IS NULL) = (periodo_hasta IS NULL)))`
- Regla `vencimiento_check1`: `CHECK (((periodo_desde <= periodo_hasta) AND (periodo_hasta < fecha)))`
- Regla `vencimiento_check2`: `CHECK ((fecha_prorrogada > fecha))`
- Regla `vencimiento_terminal_check`: `CHECK (((terminal >= 0) AND (terminal <= 9)))`
- Índice `vencimiento_terminal_fecha_idx`: `USING btree (terminal, fecha)`

### Funciones de `calendario`

- `calendario.es_habil(p date)` → `boolean` (sql)
- `calendario.habil_desde(p date)` → `date` (sql): Primer día hábil a partir de p (incluido)
- `calendario.proximos_deberes(p_rif text, p_tipo text, p_condiciones text[] DEFAULT '{}', p_desde date DEFAULT ((now() …)` → `TABLE(fecha date, fecha_limite date, dias_restantes integer, obligacion text, n…` (plpgsql)
- `calendario.recalcular_prorrogas()` → `integer` (plpgsql): COT art. 10. Especiales: la fecha de la norma se conserva y, si es inhábil, se agrega la prorrogada. Ordinarios (Reglamento IVA art. 60): el vencimiento es el primer día hábil desde el día 15 del mes siguiente al período. Devuelve cuántos vencimientos cambiaron.

---

## Esquema `rif`
<a id="esquema-rif"></a>

El Renglón · Módulo RIF · Validación del Registro Único de Información Fiscal. Formato: letra + 8 dígitos + dígito verificador (p. ej. J-00002961-0). Dígito verificador (módulo 11): prefijo (V=1, E=2, J=3, P=4, G=5) × 4 y los 8 dígitos por 3,2,7,6,5,4,3,2; dv = 11 − (suma mod 11), y 0 si el resultado es 10 u 11. Verificado con RIF públicos: J-00002961-0, G-20000303-0, J-07013380-5. El prefijo C (comunas y consejos comunales) se acepta sin verificar el dígito: su valor en el algoritmo no está confirmado.

**Lo escribe:** Cargador `herramientas/calendario` · **Documentación:** [13](docs/13-modulo-calendario.md)

### Funciones de `rif`

- `rif.validar(p_rif text)` → `TABLE(valido boolean, rif text, rif_formateado text, prefijo character, tipo_pe…` (plpgsql)

---

## Esquema `noticias`
<a id="esquema-noticias"></a>

Noticiero: titulares de medios venezolanos leídos cada hora (RSS, API de WordPress o WorldNewsAPI). Idempotente: se puede volver a aplicar; las fuentes se actualizan sin tocar si están activas.

**Lo escribe:** `noticias-programador` (cada hora) · **Documentación:** [20](docs/20-noticiero.md)

### `noticias.articulo`

*778 filas · 984 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `fuente_id` | text | no |  | → `noticias.fuente` |
| `url` | text | no |  |  |
| `titulo` | text | no |  |  |
| `resumen` | text | sí |  |  |
| `imagen` | text | sí |  |  |
| `autor` | text | sí |  |  |
| `categoria` | text | sí |  |  |
| `publicado_en` | timestamptz | no |  |  |
| `huella` | text | no |  | sha256 de título, resumen e imagen: detecta cambios |
| `visible` | boolean | no | `true` |  |
| `ocultado_por` | text | sí |  |  |
| `obtenido_en` | timestamptz | no | `now()` |  |
| `actualizado_en` | timestamptz | no | `now()` |  |
| `imagen_buscada` | boolean | no | `false` | Titulares sin imagen en el feed: se busca la og:image del artículo una sola vez (poco a poco, con límite por lectura) |

- Regla `articulo_imagen_check`: `CHECK (((imagen IS NULL) OR (imagen ~ '^https://')))`
- Regla `articulo_resumen_check`: `CHECK ((length(resumen) <= 600))`
- Regla `articulo_titulo_check`: `CHECK (((length(titulo) >= 1) AND (length(titulo) <= 400)))`
- Regla `articulo_url_check`: `CHECK ((url ~ '^https?://'))`
- Única `articulo_url_key`: `UNIQUE (url)`
- Índice `articulo_fuente`: `USING btree (fuente_id, publicado_en DESC)`
- Índice `articulo_recientes`: `USING btree (publicado_en DESC) WHERE visible`

### `noticias.fuente`

*10 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | text | no |  | **PK** |
| `nombre` | text | no |  |  |
| `sitio` | text | no |  | los artículos deben ser de este dominio |
| `metodo` | text | no |  |  |
| `url_lectura` | text | sí |  |  |
| `activa` | boolean | no | `true` |  |
| `orden` | integer | no | `0` |  |
| `ultima_lectura` | timestamptz | sí |  |  |
| `ultimo_exito` | timestamptz | sí |  |  |
| `ultimo_error` | text | sí |  |  |
| `errores_seguidos` | integer | no | `0` |  |

- Regla `fuente_check`: `CHECK (((metodo = 'worldnews') = (url_lectura IS NULL)))`
- Regla `fuente_id_check`: `CHECK ((id ~ '^[a-z0-9-]+$'))`
- Regla `fuente_metodo_check`: `CHECK ((metodo = ANY (ARRAY['rss', 'wordpress', 'worldnews'])))`
- Regla `fuente_sitio_check`: `CHECK ((sitio ~ '^https://[a-z0-9.-]+$'))`
- Regla `fuente_url_lectura_check`: `CHECK (((url_lectura IS NULL) OR (url_lectura ~ '^https://')))`

### `noticias.lectura`

*72 filas · 152 kB · Metabase: sí*

Una fila por lectura (programador, panel o consola), con el resultado de cada fuente en "detalle"

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `origen` | text | no |  |  |
| `iniciada` | timestamptz | no | `now()` |  |
| `terminada` | timestamptz | sí |  |  |
| `nuevos` | integer | no | `0` |  |
| `actualizados` | integer | no | `0` |  |
| `errores` | integer | no | `0` |  |
| `detalle` | jsonb | no | `'{}'::jsonb` |  |

- Índice `lectura_reciente`: `USING btree (iniciada DESC)`

---

## Esquema `comparador`
<a id="esquema-comparador"></a>

Comparador de precios (docs/22): lo que devuelven las tiendas en cada búsqueda queda guardado. No se descargan catálogos completos: la base crece solo con lo que la gente busca, y así se forma el historial de precios. Idempotente. Las tiendas se registran en datos/comparador/tiendas.json; aquí se sincronizan al arrancar cada servicio.

**Lo escribe:** Contenedor `comparador` (PM2, un proceso por tienda) · **Documentación:** [22](docs/22-comparador.md)

### `comparador.busqueda`

*59 filas · 48 kB · Metabase: sí*

Búsquedas (solo el término y el resultado, sin datos de quien busca): para el panel y para saber qué falta

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `termino` | text | no |  |  |
| `origen` | text | no |  |  |
| `ofertas` | integer | no |  |  |
| `grupos` | integer | no |  |  |
| `tiendas_ok` | integer | no |  |  |
| `tiendas_error` | integer | no |  |  |
| `duracion_ms` | integer | no |  |  |
| `realizada_en` | timestamptz | no | `now()` |  |

- Regla `busqueda_origen_check`: `CHECK ((origen = ANY (ARRAY['web', 'api'])))`
- Regla `busqueda_termino_check`: `CHECK (((length(termino) >= 1) AND (length(termino) <= 100)))`
- Índice `busqueda_reciente`: `USING btree (realizada_en DESC)`

### `comparador.indice_estado`

*3 filas · 72 kB · Metabase: sí*

Estado del recorrido de cada tienda (para el panel)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `tienda_id` | text | no |  | **PK** · → `comparador.tienda` |
| `sitemap_leido_en` | timestamptz | sí |  |  |
| `urls` | integer | no | `0` |  |
| `pausa_ms` | integer | no | `0` | espera entre páginas (la mayor entre la nuestra y su Crawl-delay) |
| `en_espera_hasta` | timestamptz | sí |  | si la tienda respondió 429/403/5xx: espera creciente |
| `errores_seguidos` | integer | no | `0` |  |
| `ultimo_error` | text | sí |  |  |

### `comparador.indice_url`

*24.380 filas · 17.2 MB · Metabase: sí*

Páginas de producto de cada tienda por índice (salen de su sitemap) y el resultado de su última lectura

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `tienda_id` | text | no |  | **PK** · → `comparador.tienda` |
| `url` | text | no |  | **PK** |
| `en_sitemap` | boolean | no | `true` | false: ya no aparece en el sitemap (no se vuelve a leer) |
| `ultimo_intento` | timestamptz | sí |  |  |
| `ultimo_ok` | timestamptz | sí |  |  |
| `estado` | text | sí |  | ok \| http_404 \| sin_datos \| robots \| error: … |
| `producto_id` | bigint | sí |  | → `comparador.producto` |
| `prioridad` | timestamptz | sí |  | Prioridad: cuando alguien busca algo que aún no está leído (o está viejo), sus páginas pasan al frente de la fila (solo tiendas cuyas URL llevan el nombre del producto: Farmatodo y Gama). El ritmo no cambia. |

- Regla `indice_url_url_check`: `CHECK ((url ~ '^https://'))`
- Índice `indice_url_prioridad`: `USING btree (tienda_id, prioridad DESC) WHERE (prioridad IS NOT NULL)`
- Índice `indice_url_turno`: `USING btree (tienda_id, ultimo_intento NULLS FIRST) WHERE en_sitemap`

### `comparador.precio`

*61.296 filas · 6.1 MB · Metabase: sí*

Historial: una fila cuando el precio o la existencia cambian, o como mucho una por día si no cambian

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `producto_id` | bigint | no |  | **PK** · → `comparador.producto` |
| `observado_en` | timestamptz | no | `now()` | **PK** |
| `precio` | numeric(18,2) | no |  |  |
| `precio_lista` | numeric(18,2) | sí |  |  |
| `moneda` | text | no |  |  |
| `disponible` | boolean | no |  |  |

- Regla `precio_moneda_check`: `CHECK ((moneda = ANY (ARRAY['VES', 'USD'])))`
- Regla `precio_precio_check`: `CHECK ((precio > (0)))`

### `comparador.producto`

*25.111 filas · 17.1 MB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `sucursal_id` | integer | no |  | → `comparador.sucursal` |
| `id_externo` | text | no |  |  |
| `nombre` | text | no |  |  |
| `marca` | text | sí |  |  |
| `ean` | text | sí |  | solo códigos de barras válidos |
| `url` | text | no |  |  |
| `imagen` | text | sí |  |  |
| `visto_primero` | timestamptz | no | `now()` |  |
| `visto_ultimo` | timestamptz | no | `now()` |  |
| `nombre_busqueda` | text | sí |  | Nombre normalizado (minúsculas, sin acentos) para buscar, y cuándo se leyó la página por última vez |
| `leido_en` | timestamptz | sí |  |  |

- Regla `producto_ean_check`: `CHECK (((ean IS NULL) OR (ean ~ '^\d{8,14}$')))`
- Regla `producto_imagen_check`: `CHECK (((imagen IS NULL) OR (imagen ~ '^https://')))`
- Regla `producto_nombre_check`: `CHECK (((length(nombre) >= 1) AND (length(nombre) <= 300)))`
- Regla `producto_url_check`: `CHECK ((url ~ '^https://'))`
- Única `producto_sucursal_id_id_externo_key`: `UNIQUE (sucursal_id, id_externo)`
- Índice `producto_busqueda`: `USING gin (nombre_busqueda gin_trgm_ops) WHERE (nombre_busqueda IS NOT NULL)`
- Índice `producto_ean`: `USING btree (ean) WHERE (ean IS NOT NULL)`

### `comparador.sucursal`

*28 filas · 48 kB · Metabase: sí*

Sede o sucursal. Cada tienda tiene al menos la "en línea" (clave NULL); las que muestran catálogo por sucursal (Central Madeirense por ruta, Plazas por subdominio) tendrán una fila por sucursal con su clave.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no | autonumérico | **PK** |
| `tienda_id` | text | no |  | → `comparador.tienda` |
| `nombre` | text | no |  |  |
| `clave` | text | sí |  | segmento de URL, subdominio o canal de venta |
| `estado` | text | sí |  |  |
| `ciudad` | text | sí |  |  |
| `activa` | boolean | no | `true` |  |

- Índice único `sucursal_unica`: `USING btree (tienda_id, COALESCE(clave, ''))`

### `comparador.tienda`

*12 filas · 32 kB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | text | no |  | **PK** |
| `nombre` | text | no |  |  |
| `sitio` | text | no |  |  |
| `plataforma` | text | no |  |  |
| `moneda` | text | no |  |  |
| `rubros` | text[] | no | `'{}'` |  |
| `activa` | boolean | no | `true` | se pausa desde el panel |
| `ultima_respuesta` | timestamptz | sí |  |  |
| `ultimo_error` | text | sí |  |  |
| `ultimo_error_en` | timestamptz | sí |  |  |
| `errores_seguidos` | integer | no | `0` |  |

- Regla `tienda_id_check`: `CHECK ((id ~ '^[a-z0-9-]+$'))`
- Regla `tienda_moneda_check`: `CHECK ((moneda = ANY (ARRAY['VES', 'USD'])))`
- Regla `tienda_sitio_check`: `CHECK ((sitio ~ '^https://'))`

---

## Esquema `analitica`
<a id="esquema-analitica"></a>

**Lo escribe:** La app; purga en `noticias-programador` · **Documentación:** [23](docs/23-analitica.md)

### `analitica.rif_consultado` 🔒

*110 filas · 96 kB · Metabase: algunas columnas*

RIF consultados: herramienta "Mis deberes tributarios" (web) y API (calendario y validación de RIF)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `ocurrida_en` | timestamptz | no | `now()` |  |
| `rif` | text | no |  |  |
| `valido` | boolean | no |  |  |
| `origen` | text | no |  |  |
| `herramienta` | text | no |  | deberes \| calendario \| rif |
| `tipo` | text | sí |  | ESPECIAL \| ORDINARIO |
| `condiciones` | text[] | no | `'{}'` |  |
| `visitante_id` | uuid | sí |  | → `analitica.visitante` · oculta a Metabase |
| `api_key_id` | integer | sí |  | oculta a Metabase |
| `ip` | inet | sí |  | oculta a Metabase |

- Regla `rif_consultado_origen_check`: `CHECK ((origen = ANY (ARRAY['web', 'api'])))`
- Regla `rif_consultado_rif_check`: `CHECK ((rif ~ '^[VEJPGC]-\d{8}-\d$'))`
- Índice `rif_consultado_fecha`: `USING btree (ocurrida_en DESC)`
- Índice `rif_consultado_rif`: `USING btree (rif)`

### `analitica.visita` 🔒

*52 filas · 96 kB · Metabase: algunas columnas*

Cada página vista en el sitio público (lo envía el navegador al cargar o cambiar de página)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `visitante_id` | uuid | no |  | → `analitica.visitante` |
| `ocurrida_en` | timestamptz | no | `now()` |  |
| `ruta` | text | no |  |  |
| `referente` | text | sí |  | dominio y ruta de donde llegó (sin parámetros) |
| `ip` | inet | sí |  | oculta a Metabase |
| `navegador` | text | sí |  |  |
| `sistema` | text | sí |  |  |
| `dispositivo` | text | sí |  |  |
| `idioma` | text | sí |  |  |
| `pantalla` | text | sí |  |  |
| `agente` | text | sí |  | oculta a Metabase |

- Regla `visita_agente_check`: `CHECK ((length(agente) <= 400))`
- Regla `visita_dispositivo_check`: `CHECK ((dispositivo = ANY (ARRAY['computadora', 'teléfono', 'tableta', 'otro'])))`
- Regla `visita_idioma_check`: `CHECK ((length(idioma) <= 20))`
- Regla `visita_pantalla_check`: `CHECK ((length(pantalla) <= 20))`
- Regla `visita_referente_check`: `CHECK ((length(referente) <= 300))`
- Regla `visita_ruta_check`: `CHECK ((length(ruta) <= 300))`
- Índice `visita_fecha`: `USING btree (ocurrida_en DESC)`
- Índice `visita_visitante`: `USING btree (visitante_id, ocurrida_en DESC)`

### `analitica.visitante` 🔒

*39 filas · 24 kB · Metabase: sí*

Un visitante = un navegador con la cookie "renglon_visitante" (identificador aleatorio, no personal)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | uuid | no |  | **PK** |
| `primera_visita` | timestamptz | no | `now()` |  |
| `ultima_visita` | timestamptz | no | `now()` |  |
| `visitas` | integer | no | `0` |  |

### Funciones de `analitica`

- `analitica.purgar()` → `integer` (sql): Conservación: 12 meses

---

## Esquema `avisos`
<a id="esquema-avisos"></a>

**Lo escribe:** La app y los programadores · **Documentación:** [24](docs/24-avisos.md)

### `avisos.envio`

*11 filas · 64 kB · Metabase: sí*

Cada envío (automático, desde el panel o de prueba); "clave" evita repetir el mismo aviso automático

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `tema` | text | no |  |  |
| `clave` | text | sí |  |  |
| `titulo` | text | no |  |  |
| `cuerpo` | text | sí |  |  |
| `url` | text | sí |  |  |
| `origen` | text | no |  |  |
| `creado_por` | text | sí |  |  |
| `creado_en` | timestamptz | no | `now()` |  |
| `destinatarios` | integer | no | `0` |  |
| `entregados` | integer | no | `0` |  |
| `fallidos` | integer | no | `0` |  |

- Regla `envio_cuerpo_check`: `CHECK ((length(cuerpo) <= 400))`
- Regla `envio_origen_check`: `CHECK ((origen = ANY (ARRAY['automatico', 'panel', 'prueba'])))`
- Regla `envio_tema_check`: `CHECK ((tema = ANY (ARRAY['tasa', 'noticias', 'deberes', 'novedades', 'bienvenida'])))`
- Regla `envio_titulo_check`: `CHECK ((length(titulo) <= 120))`
- Regla `envio_url_check`: `CHECK ((url ~ '^/'))`
- Única `envio_clave_key`: `UNIQUE (clave)`
- Índice `envio_reciente`: `USING btree (creado_en DESC)`

### `avisos.envio_deber` 🔒

*0 filas · 16 kB · Metabase: no*

Avisos de vencimiento ya enviados: uno por dispositivo, RIF, obligación, fecha y momento (3 días antes / el día)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `suscripcion_id` | bigint | no |  | **PK** · → `avisos.suscripcion` |
| `rif` | text | no |  | **PK** |
| `obligacion` | text | no |  | **PK** |
| `fecha_limite` | date | no |  | **PK** |
| `momento` | text | no |  | **PK** |
| `enviado_en` | timestamptz | no | `now()` |  |

- Regla `envio_deber_momento_check`: `CHECK ((momento = ANY (ARRAY['3_dias', 'hoy'])))`

### `avisos.suscripcion` 🔒

*2 filas · 72 kB · Metabase: algunas columnas*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `endpoint` | text | no |  | oculta a Metabase |
| `p256dh` | text | no |  | oculta a Metabase |
| `auth` | text | no |  | oculta a Metabase |
| `temas` | text[] | no | `'{}'` |  |
| `visitante_id` | uuid | sí |  | oculta a Metabase · cookie de analítica, si la hay |
| `agente` | text | sí |  | oculta a Metabase |
| `creada_en` | timestamptz | no | `now()` |  |
| `actualizada_en` | timestamptz | no | `now()` |  |
| `ultimo_envio` | timestamptz | sí |  |  |
| `fallos` | integer | no | `0` |  |

- Regla `suscripcion_agente_check`: `CHECK ((length(agente) <= 400))`
- Regla `suscripcion_auth_check`: `CHECK ((auth ~ '^[A-Za-z0-9_-]{16,32}$'))`
- Regla `suscripcion_endpoint_check`: `CHECK (((endpoint ~ '^https://') AND (length(endpoint) <= 1000)))`
- Regla `suscripcion_p256dh_check`: `CHECK ((p256dh ~ '^[A-Za-z0-9_-]{80,100}$'))`
- Regla `suscripcion_temas_check`: `CHECK ((temas <@ ARRAY['tasa', 'noticias', 'deberes', 'novedades']))`
- Única `suscripcion_endpoint_key`: `UNIQUE (endpoint)`
- Índice `suscripcion_temas`: `USING gin (temas)`

### `avisos.suscripcion_rif` 🔒

*0 filas · 32 kB · Metabase: no*

RIF que sigue cada dispositivo (tema "deberes"); como mucho 5 por dispositivo (lo controla la API)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `suscripcion_id` | bigint | no |  | **PK** · → `avisos.suscripcion` |
| `rif` | text | no |  | **PK** |
| `tipo` | text | no |  |  |
| `condiciones` | text[] | no | `'{}'` |  |

- Regla `suscripcion_rif_rif_check`: `CHECK ((rif ~ '^[VEJPGC]-\d{8}-\d$'))`
- Regla `suscripcion_rif_tipo_check`: `CHECK ((tipo = ANY (ARRAY['ESPECIAL', 'ORDINARIO'])))`

### Funciones de `avisos`

- `avisos.purgar()` → `integer` (sql): Limpieza: envíos de más de 12 meses y control de vencimientos ya pasados

---

## Esquema `directorio`
<a id="esquema-directorio"></a>

Directorio de contribuyentes (docs/25): empresas y personas con su contacto, importadores con su CIF y sistemas de facturación declarados. Datos personales (RIF V y E, correos, teléfonos): solo el superadministrador; Metabase no los ve. La semilla se genera con herramientas/directorio/sanear_directorio.py y no va al repositorio.

**Lo escribe:** Cargador `herramientas/directorio` · **Documentación:** [25](docs/25-directorio.md)

### `directorio.contribuyente` 🔒

*14.862 filas · 7.8 MB · Metabase: sí*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `rif` | text | no |  | **PK** |
| `razon_social` | text | no |  |  |
| `correo` | text | sí |  |  |
| `ult_periodo_islr` | character(6) | sí |  | último período declarado (AAAAMM) |
| `ult_periodo_iva` | character(6) | sí |  |  |
| `venc_certificado` | date | sí |  | vencimiento del certificado del RIF |
| `rif_valido` | boolean | no |  | dígito verificador correcto (rif.validar) |
| `terminal` | smallint | sí | `("right"(rif, 1))` | generada |
| `fuentes` | text[] | no |  |  |
| `cargado_en` | timestamptz | no | `now()` |  |

- Regla `contribuyente_fuentes_check`: `CHECK ((fuentes <@ ARRAY['importadores', 'software']))`
- Regla `contribuyente_rif_check`: `CHECK ((rif ~ '^[VEJPGC]-\d{8}-\d$'))`
- Regla `contribuyente_ult_periodo_islr_check`: `CHECK ((ult_periodo_islr ~ '^\d{4}(0[1-9]\|1[0-2])$'))`
- Regla `contribuyente_ult_periodo_iva_check`: `CHECK ((ult_periodo_iva ~ '^\d{4}(0[1-9]\|1[0-2])$'))`
- Índice `contribuyente_razon_trgm`: `USING gin (razon_social gin_trgm_ops)`

### `directorio.direccion` 🔒

*15.287 filas · 2.9 MB · Metabase: sí*

Direcciones y teléfonos (una empresa con sucursales tiene varias); sin repetir

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `rif` | text | no |  | → `directorio.contribuyente` |
| `vialidad` | text | sí |  |  |
| `sector` | text | sí |  |  |
| `edificacion` | text | sí |  |  |
| `local` | text | sí |  |  |
| `telefono` | text | sí |  |  |
| `telefono_2` | text | sí |  |  |
| `correo` | text | sí |  |  |
| `web` | text | sí |  |  |

- Regla `direccion_telefono_2_check`: `CHECK ((telefono_2 ~ '^0\d{3}-\d{7}$'))`
- Regla `direccion_telefono_check`: `CHECK ((telefono ~ '^0\d{3}-\d{7}$'))`
- Índice `direccion_rif`: `USING btree (rif)`

### `directorio.importador` 🔒

*14.862 filas · 2.7 MB · Metabase: sí*

Importadores: CIF total (dólares y bolívares, según la fuente); "nombres" son los nombres declarados como consignatario

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `rif` | text | no |  | **PK** · → `directorio.contribuyente` |
| `nombres` | text[] | no |  |  |
| `cif_usd` | numeric(18,2) | no |  |  |
| `cif_bs` | numeric(20,2) | no |  |  |
| `registros` | integer | no |  | filas de la fuente que se unieron |

- Regla `importador_cif_bs_check`: `CHECK ((cif_bs >= (0)))`
- Regla `importador_cif_usd_check`: `CHECK ((cif_usd >= (0)))`
- Regla `importador_registros_check`: `CHECK ((registros >= 1))`
- Índice `importador_cif`: `USING btree (cif_usd DESC)`

### `directorio.pagador` 🔒

*938.997 filas · 197.9 MB · Metabase: sí*

Pagadores: monto total pagado por contribuyente según la exportación "Mejores pagadores" (cortada en las 1.048.575 filas de mayor monto; ver docs/25). No todos están en contribuyente: es otra fuente, sin contacto.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `rif` | text | no |  | **PK** |
| `nombre` | text | sí |  | razón social, o apellidos si es persona natural (5 sin nombre) |
| `id_fuente` | bigint | no |  | "ID Contribuyente Pago" de la fuente |
| `monto` | numeric(20,2) | no |  |  |
| `puesto` | integer | no |  | 1 = el que más pagó |
| `regiones` | smallint | no |  |  |
| `especial` | boolean | no |  | pagó en la Región de Contribuyentes Especiales |
| `rif_valido` | boolean | no |  |  |
| `terminal` | smallint | sí | `("right"(rif, 1))` | generada |

- Regla `pagador_monto_check`: `CHECK ((monto > (0)))`
- Regla `pagador_regiones_check`: `CHECK ((regiones >= 1))`
- Regla `pagador_rif_check`: `CHECK ((rif ~ '^[VEJPGC]-\d{8}-\d$'))`
- Única `pagador_id_fuente_key`: `UNIQUE (id_fuente)`
- Índice `pagador_puesto`: `USING btree (puesto)`
- Índice `pagador_terminal`: `USING btree (terminal, puesto)`

### `directorio.pago_region` 🔒

*1.048.575 filas · 118.7 MB · Metabase: sí*

Desglose por región de recaudación (NULL: la fuente no la indica)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `rif` | text | no |  | → `directorio.pagador` |
| `region` | text | sí |  |  |
| `monto` | numeric(20,2) | no |  |  |

- Regla `pago_region_monto_check`: `CHECK ((monto > (0)))`
- Única `pago_region_rif_region_key`: `UNIQUE NULLS NOT DISTINCT (rif, region)`

### `directorio.software` 🔒

*57 filas · 96 kB · Metabase: sí*

Sistemas de facturación declarados por cada empresa (id de la fuente)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | integer | no |  | **PK** |
| `rif` | text | no |  | → `directorio.contribuyente` |
| `empresa` | text | no |  | nombre declarado en el registro del sistema |
| `sistema` | text | no |  |  |
| `version` | text | no |  |  |
| `medios` | text[] | no | `'{}'` |  |
| `categoria` | text | no |  |  |
| `descripcion` | text | sí |  |  |
| `fecha_lanzamiento` | date | sí |  |  |
| `modalidad` | text | no |  |  |
| `pdf_archivo` | text | sí |  |  |

- Regla `software_medios_check`: `CHECK ((medios <@ ARRAY['Forma libre', 'Imprenta digital', 'Máquina fiscal']))`
- Regla `software_modalidad_check`: `CHECK ((modalidad = ANY (ARRAY['exclusivo', 'distribuido'])))`
- Única `software_rif_sistema_version_key`: `UNIQUE (rif, sistema, version)`
- Índice `software_rif`: `USING btree (rif)`

---

## Esquema `prospeccion`
<a id="esquema-prospeccion"></a>

Prospección comercial por correo (docs/26): empresas a las que se ofrece El Renglón, pocas por día y con cautela. Remitente "El Renglón" (buzón ventas@ de Spacemail). Cada correo lleva enlace de baja; la baja es permanente.

**Lo escribe:** Panel y `noticias-programador` (cada 5 min) · **Documentación:** [26](docs/26-prospeccion.md)

### `prospeccion.ajuste`

*1 filas · 32 kB · Metabase: sí*

Ajustes (una sola fila). El límite diario nunca pasa de 30: prospección cautelosa, no envío masivo.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | boolean | no | `true` | **PK** |
| `activo` | boolean | no | `false` | arranca en pausa: se activa desde el panel |
| `limite_diario` | integer | no | `5` |  |
| `hora_inicio` | integer | no | `9` |  |
| `hora_fin` | integer | no | `17` |  |
| `dias_seguimiento` | integer | no | `5` |  |
| `proximo_envio` | timestamptz | sí |  | lo calcula el programador para espaciar los envíos |
| `actualizado_por` | text | sí |  |  |
| `actualizado_en` | timestamptz | sí |  |  |

- Regla `ajuste_check`: `CHECK ((hora_fin > hora_inicio))`
- Regla `ajuste_dias_seguimiento_check`: `CHECK (((dias_seguimiento >= 3) AND (dias_seguimiento <= 30)))`
- Regla `ajuste_hora_fin_check`: `CHECK (((hora_fin >= 8) AND (hora_fin <= 20)))`
- Regla `ajuste_hora_inicio_check`: `CHECK (((hora_inicio >= 7) AND (hora_inicio <= 18)))`
- Regla `ajuste_id_check`: `CHECK (id)`
- Regla `ajuste_limite_diario_check`: `CHECK (((limite_diario >= 1) AND (limite_diario <= 30)))`

### `prospeccion.baja` 🔒

*0 filas · 32 kB · Metabase: sí*

Bajas: lista de supresión permanente por correo. Sobrevive aunque el prospecto se borre o se vuelva a cargar.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `correo` | text | no |  | **PK** |
| `origen` | text | no |  | valores: restricción baja_origen_check (abajo) |
| `en` | timestamptz | no | `now()` |  |

- Regla `baja_correo_check`: `CHECK ((correo = lower(correo)))`
- Regla `baja_origen_check`: `CHECK ((origen = ANY (ARRAY['enlace', 'un_clic', 'panel', 'respuesta'])))`

### `prospeccion.envio` 🔒

*14 filas · 48 kB · Metabase: sí*

Cada correo enviado (o intentado). "prueba" = envío desde el panel a un correo propio; no cuenta para el límite.

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `prospecto_id` | bigint | sí |  | → `prospeccion.prospecto` |
| `correo` | text | no |  |  |
| `tipo` | text | no |  |  |
| `sector` | text | no |  |  |
| `asunto` | text | no |  |  |
| `resultado` | text | no |  |  |
| `error` | text | sí |  |  |
| `message_id` | text | sí |  |  |
| `creado_por` | text | sí |  | correo del usuario (pruebas) o "programador" |
| `enviado_en` | timestamptz | no | `now()` |  |

- Regla `envio_error_check`: `CHECK ((length(error) <= 500))`
- Regla `envio_resultado_check`: `CHECK ((resultado = ANY (ARRAY['enviado', 'error'])))`
- Regla `envio_tipo_check`: `CHECK ((tipo = ANY (ARRAY['inicial', 'seguimiento', 'prueba'])))`
- Índice `envio_reciente`: `USING btree (enviado_en DESC)`

### `prospeccion.prospecto` 🔒

*639 filas · 424 kB · Metabase: algunas columnas*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `empresa` | text | no |  |  |
| `contacto` | text | sí |  |  |
| `correo` | text | no |  |  |
| `sector` | text | no | `'general'` | valores: restricción prospecto_sector_check (abajo) |
| `origen` | text | no |  | de dónde salió el contacto |
| `notas` | text | sí |  |  |
| `estado` | text | no | `'pendiente'` | pendiente → contactado (1.er correo) → seguimiento (2.º y último) · respondio / descartado / baja / rebote detienen todo |
| `token` | text | no | `replace((gen_random_uuid()), '-', '')` | oculta a Metabase · enlace de baja |
| `envios` | integer | no | `0` |  |
| `ultimo_envio` | timestamptz | sí |  |  |
| `creado_por` | text | sí |  |  |
| `creado_en` | timestamptz | no | `now()` |  |
| `actualizado_en` | timestamptz | no | `now()` |  |
| `rif` | text | sí |  | 03/10/2026: contribuyentes especiales (con RIF: el correo muestra sus próximos deberes) y personas naturales (comparador de precios; solo con consentimiento: escribirle a particulares sin permiso es spam) |
| `consentimiento` | boolean | no | `false` |  |

- Regla `prospecto_consumidor_consentimiento`: `CHECK (((sector <> 'consumidor') OR consentimiento))`
- Regla `prospecto_contacto_check`: `CHECK ((length(contacto) <= 120))`
- Regla `prospecto_correo_check`: `CHECK (((correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') AND (length(correo) <= 254)))`
- Regla `prospecto_empresa_check`: `CHECK (((length(TRIM(BOTH FROM empresa)) >= 2) AND (length(TRIM(BOTH FROM empresa)) <= 160)))`
- Regla `prospecto_especial_rif`: `CHECK (((sector <> 'especial') OR (rif IS NOT NULL)))`
- Regla `prospecto_estado_check`: `CHECK ((estado = ANY (ARRAY['pendiente', 'contactado', 'seguimiento', 'respondio', 'descartado', 'baja', 'rebote'])))`
- Regla `prospecto_notas_check`: `CHECK ((length(notas) <= 1000))`
- Regla `prospecto_origen_check`: `CHECK (((length(TRIM(BOTH FROM origen)) >= 2) AND (length(TRIM(BOTH FROM origen)) <= 200)))`
- Regla `prospecto_rif_check`: `CHECK ((rif ~ '^[VEJPGC]-\d{8}-\d$'))`
- Regla `prospecto_sector_check`: `CHECK ((sector = ANY (ARRAY['general', 'comercio', 'farmacia', 'importador', 'contador', 'desarrollador', 'especial', 'consumidor'])))`
- Única `prospecto_token_key`: `UNIQUE (token)`
- Índice único `prospecto_correo`: `USING btree (lower(correo))`
- Índice `prospecto_estado`: `USING btree (estado, ultimo_envio)`

---

## Esquema `contacto`
<a id="esquema-contacto"></a>

Contacto (docs/27): mensajes del botón flotante del sitio y lectura de los buzones ventas@ y soporte@ (Spacemail). Los mensajes tienen datos personales (correo, IP): solo los ve el superadministrador; Metabase solo ve conteos.

**Lo escribe:** La app y `noticias-programador` · **Documentación:** [27](docs/27-contacto-y-bandeja.md)

### `contacto.cursor_buzon`

*1 filas · 32 kB · Metabase: no*

Último correo revisado de cada buzón (para detectar respuestas de prospectos sin procesarlas dos veces)

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `buzon` | text | no |  | **PK** |
| `uid_validez` | bigint | sí |  |  |
| `ultimo_uid` | bigint | no | `0` |  |
| `revisado_en` | timestamptz | sí |  |  |

- Regla `cursor_buzon_buzon_check`: `CHECK ((buzon = ANY (ARRAY['ventas', 'soporte'])))`

### `contacto.mensaje` 🔒

*0 filas · 48 kB · Metabase: algunas columnas*

| Columna | Tipo | Nulo | Predeterminado | Notas |
|---|---|:---:|---|---|
| `id` | bigint | no | autonumérico | **PK** |
| `correo` | text | no |  | oculta a Metabase |
| `nombre` | text | sí |  | oculta a Metabase |
| `mensaje` | text | no |  | oculta a Metabase |
| `pagina` | text | sí |  | desde qué página escribió |
| `novedades` | boolean | no | `false` | marcó «Quiero recibir novedades» |
| `estado` | text | no | `'nuevo'` |  |
| `notificado` | boolean | no | `false` | se avisó por correo a soporte@ |
| `visitante_id` | uuid | sí |  | oculta a Metabase · cookie de analítica, si la hay |
| `ip` | text | sí |  | oculta a Metabase |
| `agente` | text | sí |  | oculta a Metabase |
| `creado_en` | timestamptz | no | `now()` |  |
| `atendido_por` | text | sí |  | oculta a Metabase |
| `atendido_en` | timestamptz | sí |  |  |

- Regla `mensaje_agente_check`: `CHECK ((length(agente) <= 400))`
- Regla `mensaje_correo_check`: `CHECK (((correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') AND (length(correo) <= 254)))`
- Regla `mensaje_estado_check`: `CHECK ((estado = ANY (ARRAY['nuevo', 'atendido', 'spam'])))`
- Regla `mensaje_mensaje_check`: `CHECK (((length(TRIM(BOTH FROM mensaje)) >= 3) AND (length(TRIM(BOTH FROM mensaje)) <= 2000)))`
- Regla `mensaje_nombre_check`: `CHECK ((length(nombre) <= 120))`
- Regla `mensaje_pagina_check`: `CHECK ((length(pagina) <= 300))`
- Índice `mensaje_reciente`: `USING btree (creado_en DESC)`

