-- Comparador · tiendas por índice (docs/22): Farmatodo, Plan Suárez y Gama prohíben en su robots.txt la búsqueda
-- automática, pero permiten sus páginas de producto y las publican en su sitemap. Para ellas, su servicio recorre el
-- sitemap sin prisa (una página a la vez, respetando su Crawl-delay) y la búsqueda se resuelve contra este índice.
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Nombre normalizado (minúsculas, sin acentos) para buscar, y cuándo se leyó la página por última vez
ALTER TABLE comparador.producto ADD COLUMN IF NOT EXISTS nombre_busqueda text;
ALTER TABLE comparador.producto ADD COLUMN IF NOT EXISTS leido_en timestamptz;
CREATE INDEX IF NOT EXISTS producto_busqueda ON comparador.producto USING gin (nombre_busqueda gin_trgm_ops) WHERE nombre_busqueda IS NOT NULL;

-- Páginas de producto de cada tienda por índice (salen de su sitemap) y el resultado de su última lectura
CREATE TABLE IF NOT EXISTS comparador.indice_url (
    tienda_id      text        NOT NULL REFERENCES comparador.tienda (id) ON DELETE CASCADE,
    url            text        NOT NULL CHECK (url ~ '^https://'),
    en_sitemap     boolean     NOT NULL DEFAULT true,        -- false: ya no aparece en el sitemap (no se vuelve a leer)
    ultimo_intento timestamptz,
    ultimo_ok      timestamptz,
    estado         text,                                     -- ok | http_404 | sin_datos | robots | error: …
    producto_id    bigint      REFERENCES comparador.producto (id) ON DELETE SET NULL,
    PRIMARY KEY (tienda_id, url)
);
CREATE INDEX IF NOT EXISTS indice_url_turno ON comparador.indice_url (tienda_id, ultimo_intento NULLS FIRST) WHERE en_sitemap;

-- Estado del recorrido de cada tienda (para el panel)
CREATE TABLE IF NOT EXISTS comparador.indice_estado (
    tienda_id        text        PRIMARY KEY REFERENCES comparador.tienda (id) ON DELETE CASCADE,
    sitemap_leido_en timestamptz,
    urls             int         NOT NULL DEFAULT 0,
    pausa_ms         int         NOT NULL DEFAULT 0,         -- espera entre páginas (la mayor entre la nuestra y su Crawl-delay)
    en_espera_hasta  timestamptz,                            -- si la tienda respondió 429/403/5xx: espera creciente
    errores_seguidos int         NOT NULL DEFAULT 0,
    ultimo_error     text
);

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT SELECT ON comparador.indice_url, comparador.indice_estado TO metabase_lectura;
  END IF;
END $$;

-- Prioridad: cuando alguien busca algo que aún no está leído (o está viejo), sus páginas pasan al frente de la fila
-- (solo tiendas cuyas URL llevan el nombre del producto: Farmatodo y Gama). El ritmo no cambia.
ALTER TABLE comparador.indice_url ADD COLUMN IF NOT EXISTS prioridad timestamptz;
CREATE INDEX IF NOT EXISTS indice_url_prioridad ON comparador.indice_url (tienda_id, prioridad DESC) WHERE prioridad IS NOT NULL;
