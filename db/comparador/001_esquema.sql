-- Comparador de precios (docs/22): lo que devuelven las tiendas en cada búsqueda queda guardado. No se descargan
-- catálogos completos: la base crece solo con lo que la gente busca, y así se forma el historial de precios.
-- Idempotente. Las tiendas se registran en datos/comparador/tiendas.json; aquí se sincronizan al arrancar cada servicio.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS comparador;

CREATE TABLE IF NOT EXISTS comparador.tienda (
    id               text        PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
    nombre           text        NOT NULL,
    sitio            text        NOT NULL CHECK (sitio ~ '^https://'),
    plataforma       text        NOT NULL,
    moneda           text        NOT NULL CHECK (moneda IN ('VES', 'USD')),
    rubros           text[]      NOT NULL DEFAULT '{}',
    activa           boolean     NOT NULL DEFAULT true,              -- se pausa desde el panel
    ultima_respuesta timestamptz,
    ultimo_error     text,
    ultimo_error_en  timestamptz,
    errores_seguidos int         NOT NULL DEFAULT 0
);

-- Sede o sucursal. Cada tienda tiene al menos la "en línea" (clave NULL); las que muestran catálogo por sucursal
-- (Central Madeirense por ruta, Plazas por subdominio) tendrán una fila por sucursal con su clave.
CREATE TABLE IF NOT EXISTS comparador.sucursal (
    id        serial PRIMARY KEY,
    tienda_id text   NOT NULL REFERENCES comparador.tienda (id) ON DELETE CASCADE,
    nombre    text   NOT NULL,
    clave     text,                                   -- segmento de URL, subdominio o canal de venta
    estado    text,
    ciudad    text,
    activa    boolean NOT NULL DEFAULT true
);
CREATE UNIQUE INDEX IF NOT EXISTS sucursal_unica ON comparador.sucursal (tienda_id, coalesce(clave, ''));

CREATE TABLE IF NOT EXISTS comparador.producto (
    id             bigserial   PRIMARY KEY,
    sucursal_id    int         NOT NULL REFERENCES comparador.sucursal (id) ON DELETE CASCADE,
    id_externo     text        NOT NULL,
    nombre         text        NOT NULL CHECK (length(nombre) BETWEEN 1 AND 300),
    marca          text,
    ean            text        CHECK (ean IS NULL OR ean ~ '^\d{8,14}$'),       -- solo códigos de barras válidos
    url            text        NOT NULL CHECK (url ~ '^https://'),
    imagen         text        CHECK (imagen IS NULL OR imagen ~ '^https://'),
    visto_primero  timestamptz NOT NULL DEFAULT now(),
    visto_ultimo   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (sucursal_id, id_externo)
);
CREATE INDEX IF NOT EXISTS producto_ean ON comparador.producto (ean) WHERE ean IS NOT NULL;

-- Historial: una fila cuando el precio o la existencia cambian, o como mucho una por día si no cambian
CREATE TABLE IF NOT EXISTS comparador.precio (
    producto_id   bigint        NOT NULL REFERENCES comparador.producto (id) ON DELETE CASCADE,
    observado_en  timestamptz   NOT NULL DEFAULT now(),
    precio        numeric(18,2) NOT NULL CHECK (precio > 0),
    precio_lista  numeric(18,2),
    moneda        text          NOT NULL CHECK (moneda IN ('VES', 'USD')),
    disponible    boolean       NOT NULL,
    PRIMARY KEY (producto_id, observado_en)
);

-- Búsquedas (solo el término y el resultado, sin datos de quien busca): para el panel y para saber qué falta
CREATE TABLE IF NOT EXISTS comparador.busqueda (
    id           bigserial   PRIMARY KEY,
    termino      text        NOT NULL CHECK (length(termino) BETWEEN 1 AND 100),
    origen       text        NOT NULL CHECK (origen IN ('web', 'api')),
    ofertas      int         NOT NULL,
    grupos       int         NOT NULL,
    tiendas_ok   int         NOT NULL,
    tiendas_error int        NOT NULL,
    duracion_ms  int         NOT NULL,
    realizada_en timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS busqueda_reciente ON comparador.busqueda (realizada_en DESC);

-- Permiso "comparador" para las API keys (GET /api/v1/comparador/buscar)
ALTER TABLE core.api_key DROP CONSTRAINT IF EXISTS api_key_permisos_check;
ALTER TABLE core.api_key ADD CONSTRAINT api_key_permisos_check
    CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif','noticias','comparador','admin'] AND cardinality(permisos) > 0);
ALTER TABLE core.solicitud_api_key DROP CONSTRAINT IF EXISTS solicitud_api_key_permisos_check;
ALTER TABLE core.solicitud_api_key ADD CONSTRAINT solicitud_api_key_permisos_check
    CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif','noticias','comparador'] AND cardinality(permisos) > 0);

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA comparador TO metabase_lectura;
    GRANT SELECT ON ALL TABLES IN SCHEMA comparador TO metabase_lectura;
  END IF;
END $$;
