-- Pulso oficial: últimas publicaciones de los entes (SENIAT, BCV, SAREN…) para el carrusel de la portada.
-- Instagram se lee con la API oficial de Meta (Instagram Graph API, Business Discovery); los sitios web, por RSS o
-- leyendo su página de notas de prensa. Las imágenes se guardan aquí: las URL de Instagram caducan. Ver docs/21.
SET client_min_messages = warning;

CREATE TABLE IF NOT EXISTS noticias.pulso_cuenta (
    id               text        PRIMARY KEY CHECK (id ~ '^[a-z0-9-]+$'),
    ente             text        NOT NULL,                  -- sigla que se muestra: SENIAT, BCV, SAREN
    ente_nombre      text        NOT NULL,
    metodo           text        NOT NULL CHECK (metodo IN ('instagram', 'rss', 'bcv_prensa')),
    usuario          text        CHECK (usuario IS NULL OR usuario ~ '^[A-Za-z0-9._]{1,30}$'),   -- cuenta de Instagram
    url_lectura      text        CHECK (url_lectura IS NULL OR url_lectura ~ '^https://'),
    sitio            text        NOT NULL CHECK (sitio ~ '^https://[a-z0-9.-]+$'),               -- dominio de los enlaces
    activa           boolean     NOT NULL DEFAULT true,
    orden            int         NOT NULL DEFAULT 0,
    ultima_lectura   timestamptz,
    ultimo_exito     timestamptz,
    ultimo_error     text,
    CHECK (metodo <> 'instagram' OR usuario IS NOT NULL OR NOT activa),
    CHECK (metodo = 'instagram' OR url_lectura IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS noticias.pulso_publicacion (
    id             bigserial   PRIMARY KEY,
    cuenta_id      text        NOT NULL REFERENCES noticias.pulso_cuenta (id) ON DELETE CASCADE,
    id_externo     text        NOT NULL,                     -- id de Instagram o URL de la nota
    url            text        NOT NULL CHECK (url ~ '^https://'),
    titulo         text        NOT NULL CHECK (length(titulo) BETWEEN 1 AND 300),
    texto          text        CHECK (length(texto) <= 800),
    imagen_origen  text,
    imagen         bytea       CHECK (imagen IS NULL OR length(imagen) <= 3000000),
    imagen_tipo    text        CHECK (imagen_tipo IS NULL OR imagen_tipo IN ('image/jpeg', 'image/png', 'image/webp', 'image/gif')),
    publicado_en   timestamptz NOT NULL,
    visible        boolean     NOT NULL DEFAULT true,
    ocultado_por   text,
    obtenido_en    timestamptz NOT NULL DEFAULT now(),
    UNIQUE (cuenta_id, id_externo)
);
CREATE INDEX IF NOT EXISTS pulso_recientes ON noticias.pulso_publicacion (publicado_en DESC) WHERE visible;

-- Cuentas iniciales. Las de Instagram de BCV y SAREN quedan sin usuario y pausadas hasta confirmarlo en el panel
-- (Instagram no muestra perfiles sin iniciar sesión, así que no se pudieron verificar al instalar).
INSERT INTO noticias.pulso_cuenta (id, ente, ente_nombre, metodo, usuario, url_lectura, sitio, activa, orden) VALUES
    ('seniat-instagram', 'SENIAT', 'Servicio Nacional Integrado de Administración Aduanera y Tributaria', 'instagram', 'seniatoficial', NULL, 'https://www.instagram.com', true, 1),
    ('bcv-instagram',    'BCV',    'Banco Central de Venezuela', 'instagram', NULL, NULL, 'https://www.instagram.com', false, 2),
    ('saren-instagram',  'SAREN',  'Servicio Autónomo de Registros y Notarías', 'instagram', NULL, NULL, 'https://www.instagram.com', false, 3),
    ('bcv-prensa',       'BCV',    'Banco Central de Venezuela', 'bcv_prensa', NULL, 'https://www.bcv.org.ve/comunicados-de-prensa/notas-de-prensa', 'https://www.bcv.org.ve', true, 4),
    ('saren-web',        'SAREN',  'Servicio Autónomo de Registros y Notarías', 'rss', NULL, 'https://www.saren.gob.ve/feed/', 'https://www.saren.gob.ve', true, 5)
ON CONFLICT (id) DO UPDATE SET ente = EXCLUDED.ente, ente_nombre = EXCLUDED.ente_nombre, metodo = EXCLUDED.metodo,
    url_lectura = EXCLUDED.url_lectura, sitio = EXCLUDED.sitio, orden = EXCLUDED.orden;   -- usuario y activa se editan en el panel

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT SELECT ON noticias.pulso_cuenta TO metabase_lectura;
    GRANT SELECT (id, cuenta_id, id_externo, url, titulo, texto, publicado_en, visible, obtenido_en) ON noticias.pulso_publicacion TO metabase_lectura;
  END IF;
END $$;
