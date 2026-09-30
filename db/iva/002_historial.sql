-- =============================================================================
-- El Renglón · Módulo IVA · Historial de versiones de las reglas y casos de referencia
-- Cada regla lleva su historial: la carga del catálogo (origen 'carga') y las ediciones del panel (origen 'panel'),
-- con la Gaceta que respalda el cambio, el motivo y el contenido antes y después.
-- Los casos de referencia se guardan en la base para que el panel los ejecute antes de aceptar una edición.
-- =============================================================================
CREATE TABLE IF NOT EXISTS iva.regla_historial (
    id                bigserial PRIMARY KEY,
    regla_id          text NOT NULL,
    version           integer NOT NULL CHECK (version >= 1),
    ocurrido_en       timestamptz NOT NULL DEFAULT now(),
    actor             text NOT NULL,
    origen            text NOT NULL CHECK (origen IN ('carga', 'panel')),
    gaceta            text,
    motivo            text NOT NULL,
    antes             jsonb,
    despues           jsonb NOT NULL,
    catalogo_version  text,
    UNIQUE (regla_id, version)
);

CREATE TABLE IF NOT EXISTS iva.caso_prueba (
    orden  integer PRIMARY KEY,
    caso   jsonb NOT NULL
);
