-- Prospección comercial por correo (docs/26): empresas a las que se ofrece El Renglón, pocas por día y con cautela.
-- Remitente "El Renglón" (buzón ventas@ de Spacemail). Cada correo lleva enlace de baja; la baja es permanente.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS prospeccion;

CREATE TABLE IF NOT EXISTS prospeccion.prospecto (
    id            bigserial   PRIMARY KEY,
    empresa       text        NOT NULL CHECK (length(trim(empresa)) BETWEEN 2 AND 160),
    contacto      text        CHECK (length(contacto) <= 120),
    correo        text        NOT NULL CHECK (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(correo) <= 254),
    sector        text        NOT NULL DEFAULT 'general'
                              CHECK (sector IN ('general', 'comercio', 'farmacia', 'importador', 'contador', 'desarrollador')),
    origen        text        NOT NULL CHECK (length(trim(origen)) BETWEEN 2 AND 200),   -- de dónde salió el contacto
    notas         text        CHECK (length(notas) <= 1000),
    -- pendiente → contactado (1.er correo) → seguimiento (2.º y último) · respondio / descartado / baja / rebote detienen todo
    estado        text        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'contactado', 'seguimiento', 'respondio', 'descartado', 'baja', 'rebote')),
    token         text        NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),   -- enlace de baja
    envios        int         NOT NULL DEFAULT 0,
    ultimo_envio  timestamptz,
    creado_por    text,
    creado_en     timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS prospecto_correo ON prospeccion.prospecto (lower(correo));
CREATE INDEX IF NOT EXISTS prospecto_estado ON prospeccion.prospecto (estado, ultimo_envio);

-- Bajas: lista de supresión permanente por correo. Sobrevive aunque el prospecto se borre o se vuelva a cargar.
CREATE TABLE IF NOT EXISTS prospeccion.baja (
    correo   text        PRIMARY KEY CHECK (correo = lower(correo)),
    origen   text        NOT NULL CHECK (origen IN ('enlace', 'un_clic', 'panel')),
    en       timestamptz NOT NULL DEFAULT now()
);

-- Cada correo enviado (o intentado). "prueba" = envío desde el panel a un correo propio; no cuenta para el límite.
CREATE TABLE IF NOT EXISTS prospeccion.envio (
    id            bigserial   PRIMARY KEY,
    prospecto_id  bigint      REFERENCES prospeccion.prospecto (id) ON DELETE SET NULL,
    correo        text        NOT NULL,
    tipo          text        NOT NULL CHECK (tipo IN ('inicial', 'seguimiento', 'prueba')),
    sector        text        NOT NULL,
    asunto        text        NOT NULL,
    resultado     text        NOT NULL CHECK (resultado IN ('enviado', 'error')),
    error         text        CHECK (length(error) <= 500),
    message_id    text,
    creado_por    text,                                       -- correo del usuario (pruebas) o "programador"
    enviado_en    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS envio_reciente ON prospeccion.envio (enviado_en DESC);

-- Ajustes (una sola fila). El límite diario nunca pasa de 30: prospección cautelosa, no envío masivo.
CREATE TABLE IF NOT EXISTS prospeccion.ajuste (
    id                boolean     PRIMARY KEY DEFAULT true CHECK (id),
    activo            boolean     NOT NULL DEFAULT false,       -- arranca en pausa: se activa desde el panel
    limite_diario     int         NOT NULL DEFAULT 5 CHECK (limite_diario BETWEEN 1 AND 30),
    hora_inicio       int         NOT NULL DEFAULT 9 CHECK (hora_inicio BETWEEN 7 AND 18),
    hora_fin          int         NOT NULL DEFAULT 17 CHECK (hora_fin BETWEEN 8 AND 20),
    dias_seguimiento  int         NOT NULL DEFAULT 5 CHECK (dias_seguimiento BETWEEN 3 AND 30),
    proximo_envio     timestamptz,                              -- lo calcula el programador para espaciar los envíos
    actualizado_por   text,
    actualizado_en    timestamptz,
    CHECK (hora_fin > hora_inicio)
);
INSERT INTO prospeccion.ajuste DEFAULT VALUES ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA prospeccion TO metabase_lectura;
    GRANT SELECT ON prospeccion.envio, prospeccion.baja, prospeccion.ajuste TO metabase_lectura;
    -- Sin el token: con él cualquiera podría dar de baja a un prospecto
    GRANT SELECT (id, empresa, contacto, correo, sector, origen, notas, estado, envios, ultimo_envio, creado_por, creado_en, actualizado_en)
      ON prospeccion.prospecto TO metabase_lectura;
  END IF;
END $$;
