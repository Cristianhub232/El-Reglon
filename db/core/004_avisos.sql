-- Avisos push (docs/24): suscripciones de cada dispositivo con sus temas, RIF seguidos para los deberes,
-- historial de envíos y control para no repetir un aviso de vencimiento.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS avisos;

CREATE TABLE IF NOT EXISTS avisos.suscripcion (
    id             bigserial   PRIMARY KEY,
    endpoint       text        NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
    p256dh         text        NOT NULL CHECK (p256dh ~ '^[A-Za-z0-9_-]{80,100}$'),
    auth           text        NOT NULL CHECK (auth ~ '^[A-Za-z0-9_-]{16,32}$'),
    temas          text[]      NOT NULL DEFAULT '{}' CHECK (temas <@ ARRAY['tasa','noticias','deberes','novedades']),
    visitante_id   uuid,                                       -- cookie de analítica, si la hay
    agente         text        CHECK (length(agente) <= 400),
    creada_en      timestamptz NOT NULL DEFAULT now(),
    actualizada_en timestamptz NOT NULL DEFAULT now(),
    ultimo_envio   timestamptz,
    fallos         int         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS suscripcion_temas ON avisos.suscripcion USING gin (temas);

-- RIF que sigue cada dispositivo (tema "deberes"); como mucho 5 por dispositivo (lo controla la API)
CREATE TABLE IF NOT EXISTS avisos.suscripcion_rif (
    suscripcion_id bigint NOT NULL REFERENCES avisos.suscripcion (id) ON DELETE CASCADE,
    rif            text   NOT NULL CHECK (rif ~ '^[VEJPGC]-\d{8}-\d$'),
    tipo           text   NOT NULL CHECK (tipo IN ('ESPECIAL', 'ORDINARIO')),
    condiciones    text[] NOT NULL DEFAULT '{}',
    PRIMARY KEY (suscripcion_id, rif)
);

-- Cada envío (automático, desde el panel o de prueba); "clave" evita repetir el mismo aviso automático
CREATE TABLE IF NOT EXISTS avisos.envio (
    id            bigserial   PRIMARY KEY,
    tema          text        NOT NULL CHECK (tema IN ('tasa', 'noticias', 'deberes', 'novedades', 'bienvenida')),
    clave         text        UNIQUE,
    titulo        text        NOT NULL CHECK (length(titulo) <= 120),
    cuerpo        text        CHECK (length(cuerpo) <= 400),
    url           text        CHECK (url ~ '^/'),
    origen        text        NOT NULL CHECK (origen IN ('automatico', 'panel', 'prueba')),
    creado_por    text,
    creado_en     timestamptz NOT NULL DEFAULT now(),
    destinatarios int         NOT NULL DEFAULT 0,
    entregados    int         NOT NULL DEFAULT 0,
    fallidos      int         NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS envio_reciente ON avisos.envio (creado_en DESC);

-- Avisos de vencimiento ya enviados: uno por dispositivo, RIF, obligación, fecha y momento (3 días antes / el día)
CREATE TABLE IF NOT EXISTS avisos.envio_deber (
    suscripcion_id bigint      NOT NULL REFERENCES avisos.suscripcion (id) ON DELETE CASCADE,
    rif            text        NOT NULL,
    obligacion     text        NOT NULL,
    fecha_limite   date        NOT NULL,
    momento        text        NOT NULL CHECK (momento IN ('3_dias', 'hoy')),
    enviado_en     timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (suscripcion_id, rif, obligacion, fecha_limite, momento)
);

-- Limpieza: envíos de más de 12 meses y control de vencimientos ya pasados
CREATE OR REPLACE FUNCTION avisos.purgar() RETURNS int LANGUAGE sql AS $$
  WITH e AS (DELETE FROM avisos.envio WHERE creado_en < now() - interval '12 months' RETURNING 1),
       d AS (DELETE FROM avisos.envio_deber WHERE fecha_limite < current_date - 7 RETURNING 1)
  SELECT ((SELECT count(*) FROM e) + (SELECT count(*) FROM d))::int
$$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA avisos TO metabase_lectura;
    GRANT SELECT ON avisos.envio TO metabase_lectura;
    GRANT SELECT (id, temas, creada_en, actualizada_en, ultimo_envio, fallos) ON avisos.suscripcion TO metabase_lectura;
  END IF;
END $$;
