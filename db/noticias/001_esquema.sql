-- Noticiero: titulares de medios venezolanos leídos cada hora (RSS, API de WordPress o WorldNewsAPI).
-- Idempotente: se puede volver a aplicar; las fuentes se actualizan sin tocar si están activas.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS noticias;

CREATE TABLE IF NOT EXISTS noticias.fuente (
    id               text        PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
    nombre           text        NOT NULL,
    sitio            text        NOT NULL CHECK (sitio ~ '^https://[a-z0-9.-]+$'),   -- los artículos deben ser de este dominio
    metodo           text        NOT NULL CHECK (metodo IN ('rss', 'wordpress', 'worldnews')),
    url_lectura      text        CHECK (url_lectura IS NULL OR url_lectura ~ '^https://'),
    activa           boolean     NOT NULL DEFAULT true,
    orden            int         NOT NULL DEFAULT 0,
    ultima_lectura   timestamptz,
    ultimo_exito     timestamptz,
    ultimo_error     text,
    errores_seguidos int         NOT NULL DEFAULT 0,
    CHECK ((metodo = 'worldnews') = (url_lectura IS NULL))
);

CREATE TABLE IF NOT EXISTS noticias.articulo (
    id             bigserial   PRIMARY KEY,
    fuente_id      text        NOT NULL REFERENCES noticias.fuente (id) ON DELETE CASCADE,
    url            text        NOT NULL UNIQUE CHECK (url ~ '^https?://'),
    titulo         text        NOT NULL CHECK (length(titulo) BETWEEN 1 AND 400),
    resumen        text        CHECK (length(resumen) <= 600),
    imagen         text        CHECK (imagen IS NULL OR imagen ~ '^https://'),
    autor          text,
    categoria      text,
    publicado_en   timestamptz NOT NULL,
    huella         text        NOT NULL,             -- sha256 de título, resumen e imagen: detecta cambios
    visible        boolean     NOT NULL DEFAULT true,
    ocultado_por   text,
    obtenido_en    timestamptz NOT NULL DEFAULT now(),
    actualizado_en timestamptz NOT NULL DEFAULT now()
);
-- Titulares sin imagen en el feed: se busca la og:image del artículo una sola vez (poco a poco, con límite por lectura)
ALTER TABLE noticias.articulo ADD COLUMN IF NOT EXISTS imagen_buscada boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS articulo_recientes ON noticias.articulo (publicado_en DESC) WHERE visible;
CREATE INDEX IF NOT EXISTS articulo_fuente ON noticias.articulo (fuente_id, publicado_en DESC);

-- Una fila por lectura (programador, panel o consola), con el resultado de cada fuente en "detalle"
CREATE TABLE IF NOT EXISTS noticias.lectura (
    id           bigserial   PRIMARY KEY,
    origen       text        NOT NULL,
    iniciada     timestamptz NOT NULL DEFAULT now(),
    terminada    timestamptz,
    nuevos       int         NOT NULL DEFAULT 0,
    actualizados int         NOT NULL DEFAULT 0,
    errores      int         NOT NULL DEFAULT 0,
    detalle      jsonb       NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS lectura_reciente ON noticias.lectura (iniciada DESC);

-- Fuentes (docs/20). WorldNewsAPI solo para TalCual: su Cloudflare responde 403 a las IP de centros de datos
-- (el servidor de producción). Alertas24 sí entrega su RSS desde ahí. La cuota gratuita (50 puntos/día) alcanza
-- para una consulta por hora.
INSERT INTO noticias.fuente (id, nombre, sitio, metodo, url_lectura, orden) VALUES
    ('efectococuyo',  'Efecto Cocuyo',    'https://efectococuyo.com',      'rss',       'https://efectococuyo.com/feed/', 1),
    ('elpitazo',      'El Pitazo',        'https://elpitazo.net',          'rss',       'https://elpitazo.net/feed/', 2),
    ('runrunes',      'Runrun.es',        'https://runrun.es',             'rss',       'https://runrun.es/feed/', 3),
    ('talcual',       'TalCual',          'https://talcualdigital.com',    'worldnews', NULL, 4),
    ('cronicauno',    'Crónica Uno',      'https://cronica.uno',           'rss',       'https://cronica.uno/feed/', 5),
    ('caraotadigital','Caraota Digital',  'https://www.caraotadigital.net','rss',       'https://www.caraotadigital.net/feed/', 6),
    ('monitoreamos',  'Monitoreamos',     'https://monitoreamos.com',      'rss',       'https://monitoreamos.com/feed/', 7),
    ('elestimulo',    'El Estímulo',      'https://elestimulo.com',        'rss',       'https://elestimulo.com/feed/', 8),
    ('laiguana',      'La Iguana TV',     'https://www.laiguana.tv',       'wordpress', 'https://www.laiguana.tv/wp-json/wp/v2/posts', 9),
    ('alertas24',     'Alertas24',        'https://alertas24.com',         'rss',       'https://alertas24.com/feed/', 10)
ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, sitio = EXCLUDED.sitio, metodo = EXCLUDED.metodo,
    url_lectura = EXCLUDED.url_lectura, orden = EXCLUDED.orden;

-- Permiso "noticias" para las API keys (GET /api/v1/noticias)
ALTER TABLE core.api_key DROP CONSTRAINT IF EXISTS api_key_permisos_check;
ALTER TABLE core.api_key ADD CONSTRAINT api_key_permisos_check
    CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif','noticias','comparador','admin'] AND cardinality(permisos) > 0);
ALTER TABLE core.solicitud_api_key DROP CONSTRAINT IF EXISTS solicitud_api_key_permisos_check;
ALTER TABLE core.solicitud_api_key ADD CONSTRAINT solicitud_api_key_permisos_check
    CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif','noticias','comparador'] AND cardinality(permisos) > 0);

-- Metabase (si está instalado) también puede leer el noticiero
DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA noticias TO metabase_lectura;
    GRANT SELECT ON ALL TABLES IN SCHEMA noticias TO metabase_lectura;
  END IF;
END $$;
