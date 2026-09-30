-- =============================================================================
-- El Renglón · Módulo Arancel · Detección de la clasificación arancelaria (docs/07 §4)
-- "Tengo este producto, ¿qué código le corresponde?". Fin propio, independiente del IVA.
-- Lo aplica scripts/arancel-cargar-sinonimos.ts (una transacción) después de cargar el arancel.
-- =============================================================================

-- Índice de búsqueda: ruta jerárquica de cada código con su vector de texto en español.
-- Peso A = texto de la partida (dice QUÉ es el producto); B = descripción propia del código; C = resto de la ruta.
-- Se recrea en cada carga de los sinónimos y se refresca al recargar el arancel (002_cargar_semilla.sql).
DROP FUNCTION IF EXISTS arancel.puntuar_texto(text, text[], int);
DROP MATERIALIZED VIEW IF EXISTS arancel.indice_busqueda;
CREATE MATERIALIZED VIEW arancel.indice_busqueda AS
SELECT r.codigo, r.codigo_formateado, r.capitulo, r.partida, r.es_terminal, s.descripcion, r.ruta,
       setweight(to_tsvector('spanish', unaccent(p.descripcion)), 'A') ||
       setweight(to_tsvector('spanish', unaccent(s.descripcion)), 'B') ||
       setweight(to_tsvector('spanish', unaccent(r.ruta)), 'C') AS documento
  FROM arancel.v_subpartida_ruta r
  JOIN arancel.subpartida s ON s.codigo = r.codigo
  JOIN arancel.partida p ON p.codigo = r.partida;
CREATE UNIQUE INDEX indice_busqueda_codigo_idx ON arancel.indice_busqueda (codigo);
CREATE INDEX indice_busqueda_documento_idx ON arancel.indice_busqueda USING gin (documento);

-- Diccionario de nombres comerciales → prefijos arancelarios (datos/arancel/sinonimos.json)
CREATE TABLE IF NOT EXISTS arancel.sinonimo (
    id              serial PRIMARY KEY,
    grupo           text NOT NULL UNIQUE,
    terminos        text[] NOT NULL,          -- normalizados: minúsculas, sin acentos; admiten el plural simple
    excluir         text[] NOT NULL DEFAULT '{}',
    prefijos        text[] NOT NULL CHECK (cardinality(prefijos) > 0),
    categorias_off  text[] NOT NULL DEFAULT '{}',
    prioridad       smallint NOT NULL CHECK (prioridad BETWEEN 1 AND 100),
    nota            text
);

-- Vocabulario comercial → palabras del texto oficial ("blanco" → "blanqueado"), solo para afinar la subpartida
CREATE TABLE IF NOT EXISTS arancel.vocabulario (
    comercial  text PRIMARY KEY,
    oficial    text NOT NULL
);

CREATE TABLE IF NOT EXISTS arancel.sinonimo_version (
    version       text PRIMARY KEY,           -- SHA-256 corto de sinonimos.json
    cargado_en    timestamptz NOT NULL DEFAULT now(),
    validaciones  jsonb
);

-- Detecciones, para curaduría del diccionario (sin datos personales)
CREATE TABLE IF NOT EXISTS arancel.deteccion (
    id           bigserial PRIMARY KEY,
    ocurrido_en  timestamptz NOT NULL DEFAULT now(),
    estado       text NOT NULL CHECK (estado IN ('determinado', 'condicionado', 'no_determinado')),
    entrada      jsonb NOT NULL,
    candidatos   text[] NOT NULL DEFAULT '{}',
    api_key_id   integer,
    revisada     boolean NOT NULL DEFAULT false
);

-- Puntuación por texto de los códigos declarables: cobertura = fracción de las palabras (raíces en español)
-- de la consulta que aparecen en la ruta; en_partida = cuántas aparecen en el texto de la partida;
-- en_descripcion = cuántas aparecen en la descripción propia del código; frase = aparecen juntas y en orden
-- ("cepillo de dientes" frente a "cepillar … dientes de engranajes").
-- Con p_prefijos, solo dentro de esos prefijos; sin ellos, todo el arancel salvo los capítulos 98 y 99
-- (regímenes especiales).
CREATE FUNCTION arancel.puntuar_texto(p_texto text, p_prefijos text[], p_limite int)
RETURNS TABLE (codigo varchar, frase boolean, cobertura numeric, en_partida int, en_descripcion int, rango real)
LANGUAGE sql STABLE AS $$
    WITH lex AS (SELECT DISTINCT lexeme FROM unnest(to_tsvector('spanish', unaccent(coalesce(p_texto, ''))))),
         n AS (SELECT count(*) AS total FROM lex),
         q AS (SELECT string_agg(quote_literal(lexeme), ' | ')::tsquery AS tq FROM lex)
    SELECT i.codigo,
           i.documento @@ phraseto_tsquery('spanish', unaccent(p_texto)),
           round((SELECT count(*) FROM lex WHERE i.documento @@ quote_literal(lex.lexeme)::tsquery)::numeric / n.total, 3),
           (SELECT count(*) FROM lex WHERE i.documento @@ (quote_literal(lex.lexeme) || ':A')::tsquery)::int,
           (SELECT count(*) FROM lex WHERE i.documento @@ (quote_literal(lex.lexeme) || ':B')::tsquery)::int,
           ts_rank(i.documento, q.tq, 2)   -- normalizado por longitud: prefiere las partidas específicas
      FROM arancel.indice_busqueda i, q, n
     WHERE n.total > 0 AND i.es_terminal AND i.documento @@ q.tq
       AND (CASE WHEN p_prefijos IS NULL THEN i.capitulo NOT IN ('98', '99')
                 ELSE i.codigo LIKE ANY (SELECT unnest(p_prefijos) || '%') END)
     ORDER BY 2 DESC, 3 DESC, 4 DESC, 5 DESC, 6 DESC, i.codigo
     LIMIT p_limite
$$;

-- Grupos agregados desde el panel: sobreviven a la recarga del archivo (el archivo gana si trae el mismo grupo)
ALTER TABLE arancel.sinonimo ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'archivo' CHECK (origen IN ('archivo', 'panel'));
ALTER TABLE arancel.sinonimo ADD COLUMN IF NOT EXISTS creado_por text;
ALTER TABLE arancel.sinonimo ADD COLUMN IF NOT EXISTS creado_en timestamptz;

-- Casos de referencia de la detección, para validar en el panel los grupos nuevos antes de guardarlos
CREATE TABLE IF NOT EXISTS arancel.caso_deteccion (
    orden  integer PRIMARY KEY,
    caso   jsonb NOT NULL
);
