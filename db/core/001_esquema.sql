-- =============================================================================
-- El Renglón · Núcleo · API keys y auditoría de administración
-- Las claves se guardan solo como SHA-256; el token completo se muestra una única vez al crearlo.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS core;

CREATE TABLE IF NOT EXISTS core.api_key (
    id                 serial PRIMARY KEY,
    nombre             text        NOT NULL,
    prefijo            char(8)     NOT NULL UNIQUE,        -- identifica la clave sin revelarla
    hash_sha256        char(64)    NOT NULL UNIQUE,
    permisos           text[]      NOT NULL CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif','noticias','admin']
                                                   AND cardinality(permisos) > 0),
    limite_por_minuto  integer     NOT NULL DEFAULT 60 CHECK (limite_por_minuto BETWEEN 1 AND 10000),
    activa             boolean     NOT NULL DEFAULT true,
    creada_en          timestamptz NOT NULL DEFAULT now(),
    revocada_en        timestamptz,
    ultimo_uso         timestamptz,
    CHECK (activa OR revocada_en IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS core.auditoria (
    id          bigserial PRIMARY KEY,
    ocurrido_en timestamptz NOT NULL DEFAULT now(),
    actor       text NOT NULL,                  -- 'cli', prefijo de la API key, etc.
    accion      text NOT NULL,
    detalle     jsonb NOT NULL DEFAULT '{}'
);
