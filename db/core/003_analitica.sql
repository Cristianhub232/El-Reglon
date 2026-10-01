-- Analítica del sitio público (docs/23): visitas con una cookie propia de visitante y RIF consultados en las
-- herramientas y la API. Datos personales (IP completa, RIF): solo los ve el superadministrador en el panel, Metabase
-- no lee la IP y todo se borra a los 12 meses (analitica.purgar(), la llama noticias-programador cada hora).
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS analitica;

-- Un visitante = un navegador con la cookie "renglon_visitante" (identificador aleatorio, no personal)
CREATE TABLE IF NOT EXISTS analitica.visitante (
    id             uuid        PRIMARY KEY,
    primera_visita timestamptz NOT NULL DEFAULT now(),
    ultima_visita  timestamptz NOT NULL DEFAULT now(),
    visitas        int         NOT NULL DEFAULT 0
);

-- Cada página vista en el sitio público (lo envía el navegador al cargar o cambiar de página)
CREATE TABLE IF NOT EXISTS analitica.visita (
    id           bigserial   PRIMARY KEY,
    visitante_id uuid        NOT NULL REFERENCES analitica.visitante (id) ON DELETE CASCADE,
    ocurrida_en  timestamptz NOT NULL DEFAULT now(),
    ruta         text        NOT NULL CHECK (length(ruta) <= 300),
    referente    text        CHECK (length(referente) <= 300),     -- dominio y ruta de donde llegó (sin parámetros)
    ip           inet,
    navegador    text,
    sistema      text,
    dispositivo  text        CHECK (dispositivo IN ('computadora', 'teléfono', 'tableta', 'otro')),
    idioma       text        CHECK (length(idioma) <= 20),
    pantalla     text        CHECK (length(pantalla) <= 20),
    agente       text        CHECK (length(agente) <= 400)
);
CREATE INDEX IF NOT EXISTS visita_fecha ON analitica.visita (ocurrida_en DESC);
CREATE INDEX IF NOT EXISTS visita_visitante ON analitica.visita (visitante_id, ocurrida_en DESC);

-- RIF consultados: herramienta "Mis deberes tributarios" (web) y API (calendario y validación de RIF)
CREATE TABLE IF NOT EXISTS analitica.rif_consultado (
    id           bigserial   PRIMARY KEY,
    ocurrida_en  timestamptz NOT NULL DEFAULT now(),
    rif          text        NOT NULL CHECK (rif ~ '^[VEJPGC]-\d{8}-\d$'),
    valido       boolean     NOT NULL,
    origen       text        NOT NULL CHECK (origen IN ('web', 'api')),
    herramienta  text        NOT NULL,                      -- deberes | calendario | rif
    tipo         text,                                      -- ESPECIAL | ORDINARIO
    condiciones  text[]      NOT NULL DEFAULT '{}',
    visitante_id uuid        REFERENCES analitica.visitante (id) ON DELETE SET NULL,
    api_key_id   int,
    ip           inet
);
CREATE INDEX IF NOT EXISTS rif_consultado_fecha ON analitica.rif_consultado (ocurrida_en DESC);
CREATE INDEX IF NOT EXISTS rif_consultado_rif ON analitica.rif_consultado (rif);

-- Conservación: 12 meses
CREATE OR REPLACE FUNCTION analitica.purgar() RETURNS int LANGUAGE sql AS $$
  WITH v AS (DELETE FROM analitica.visita WHERE ocurrida_en < now() - interval '12 months' RETURNING 1),
       r AS (DELETE FROM analitica.rif_consultado WHERE ocurrida_en < now() - interval '12 months' RETURNING 1),
       s AS (DELETE FROM analitica.visitante WHERE ultima_visita < now() - interval '12 months' RETURNING 1)
  SELECT ((SELECT count(*) FROM v) + (SELECT count(*) FROM r) + (SELECT count(*) FROM s))::int
$$;

-- Metabase puede contar visitas y RIF, pero nunca ve la IP
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA analitica TO metabase_lectura;
    GRANT SELECT ON analitica.visitante TO metabase_lectura;
    GRANT SELECT (id, visitante_id, ocurrida_en, ruta, referente, navegador, sistema, dispositivo, idioma, pantalla) ON analitica.visita TO metabase_lectura;
    GRANT SELECT (id, ocurrida_en, rif, valido, origen, herramienta, tipo, condiciones) ON analitica.rif_consultado TO metabase_lectura;
  END IF;
END $$;
