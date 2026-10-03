-- Contacto (docs/27): mensajes del botón flotante del sitio y lectura de los buzones ventas@ y soporte@ (Spacemail).
-- Los mensajes tienen datos personales (correo, IP): solo los ve el superadministrador; Metabase solo ve conteos.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS contacto;

CREATE TABLE IF NOT EXISTS contacto.mensaje (
    id            bigserial   PRIMARY KEY,
    correo        text        NOT NULL CHECK (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(correo) <= 254),
    nombre        text        CHECK (length(nombre) <= 120),
    mensaje       text        NOT NULL CHECK (length(trim(mensaje)) BETWEEN 3 AND 2000),
    pagina        text        CHECK (length(pagina) <= 300),          -- desde qué página escribió
    novedades     boolean     NOT NULL DEFAULT false,                 -- marcó «Quiero recibir novedades»
    estado        text        NOT NULL DEFAULT 'nuevo' CHECK (estado IN ('nuevo', 'atendido', 'spam')),
    notificado    boolean     NOT NULL DEFAULT false,                 -- se avisó por correo a soporte@
    visitante_id  uuid,                                               -- cookie de analítica, si la hay
    ip            text,
    agente        text        CHECK (length(agente) <= 400),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    atendido_por  text,
    atendido_en   timestamptz
);
CREATE INDEX IF NOT EXISTS mensaje_reciente ON contacto.mensaje (creado_en DESC);

-- Último correo revisado de cada buzón (para detectar respuestas de prospectos sin procesarlas dos veces)
CREATE TABLE IF NOT EXISTS contacto.cursor_buzon (
    buzon        text        PRIMARY KEY CHECK (buzon IN ('ventas', 'soporte')),
    uid_validez  bigint,
    ultimo_uid   bigint      NOT NULL DEFAULT 0,
    revisado_en  timestamptz
);

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA contacto TO metabase_lectura;
    GRANT SELECT (id, novedades, estado, notificado, pagina, creado_en, atendido_en) ON contacto.mensaje TO metabase_lectura;
  END IF;
END $$;
