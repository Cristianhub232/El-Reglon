-- =============================================================================
-- El Renglón · Módulo Arancel · Esquema PostgreSQL (16+)
-- Fuente: Arancel de Aduanas, Decreto N° 4.944 (GO Ext. N° 6.804, 25/04/2024) y reformas.
-- La jerarquía se basa en CLAVES NATURALES (códigos), nunca en IDs por orden de inserción.
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE SCHEMA IF NOT EXISTS arancel;

-- Versión normativa cargada (decreto base y cada reforma)
CREATE TABLE IF NOT EXISTS arancel.version (
    id                 serial PRIMARY KEY,
    instrumento        text        NOT NULL,              -- p. ej. 'Decreto N° 4.944'
    gaceta             text        NOT NULL,              -- p. ej. 'GO Ext. N° 6.804'
    fecha_publicacion  date        NOT NULL,
    vigente_desde      date,
    descripcion        text,
    fuente_archivo     text        NOT NULL,
    fuente_sha256      char(64)    NOT NULL CHECK (fuente_sha256 ~ '^[0-9a-f]{64}$'),
    cargado_en         timestamptz NOT NULL DEFAULT now(),
    UNIQUE (instrumento, gaceta)
);

CREATE TABLE IF NOT EXISTS arancel.seccion (
    numero          smallint PRIMARY KEY CHECK (numero BETWEEN 1 AND 22),
    romano          text     NOT NULL UNIQUE,
    titulo          text     NOT NULL,
    capitulo_desde  char(2)  NOT NULL,
    capitulo_hasta  char(2)  NOT NULL,
    CHECK (capitulo_desde <= capitulo_hasta)
);

CREATE TABLE IF NOT EXISTS arancel.capitulo (
    codigo     char(2)  PRIMARY KEY CHECK (codigo ~ '^\d{2}$'),
    seccion    smallint NOT NULL REFERENCES arancel.seccion (numero),
    titulo     text     NOT NULL,
    reservado  boolean  NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS arancel.partida (
    codigo              char(4) PRIMARY KEY CHECK (codigo ~ '^\d{4}$'),
    capitulo            char(2) NOT NULL REFERENCES arancel.capitulo (codigo),
    descripcion         text    NOT NULL,
    origen_descripcion  text    NOT NULL CHECK (origen_descripcion IN ('encabezado', 'linea_unica')),
    CHECK (left(codigo, 2) = capitulo)
);

-- Tabla oficial "Unidades Físicas (U.F.) por subpartida" del Decreto
CREATE TABLE IF NOT EXISTS arancel.unidad_fisica (
    sigla     text PRIMARY KEY,
    nombre    text NOT NULL,
    magnitud  text NOT NULL
);

-- Art. 21 del Decreto (códigos 1..21)
CREATE TABLE IF NOT EXISTS arancel.regimen_legal (
    codigo       smallint PRIMARY KEY CHECK (codigo BETWEEN 1 AND 21),
    descripcion  text NOT NULL
);

-- Reglas Generales para la Interpretación (RGI 1..6) y Reglas Generales Complementarias (art. 37)
CREATE TABLE IF NOT EXISTS arancel.regla_interpretacion (
    orden          smallint PRIMARY KEY,
    tipo           text     NOT NULL CHECK (tipo IN ('general', 'complementaria')),
    numero         smallint NOT NULL CHECK (numero BETWEEN 0 AND 6),   -- 0 = preámbulo
    literal        char(1)  CHECK (literal IN ('a', 'b', 'c')),         -- NULL = texto principal de la regla
    texto          text     NOT NULL,
    pagina_gaceta  smallint NOT NULL,
    UNIQUE (tipo, numero, literal)
);

-- "Abreviaturas y Símbolos" usados en las descripciones de la nomenclatura
CREATE TABLE IF NOT EXISTS arancel.abreviatura (
    sigla          text     PRIMARY KEY,
    significado    text     NOT NULL,
    pagina_gaceta  smallint NOT NULL
);

-- "Tabla de conversión de las principales unidades físicas de medida"
CREATE TABLE IF NOT EXISTS arancel.conversion_unidad (
    orden               smallint PRIMARY KEY,
    magnitud            text     NOT NULL CHECK (magnitud IN ('Longitud', 'Masa', 'Superficie', 'Volumen')),
    unidad              text     NOT NULL UNIQUE,          -- p. ej. '1 Libra (UK, USA)'
    equivalencia        numeric  NOT NULL CHECK (equivalencia > 0),
    unidad_equivalente  text     NOT NULL CHECK (unidad_equivalente IN ('m', 'kg', 'm²', 'm³', 'l')),
    equivalencia_texto  text     NOT NULL,                 -- tal como figura en la Gaceta
    nota                text,
    pagina_gaceta       smallint NOT NULL
);

-- Nodos del árbol: agrupaciones y líneas terminales (declarables)
CREATE TABLE IF NOT EXISTS arancel.subpartida (
    codigo               varchar(10) PRIMARY KEY CHECK (codigo ~ '^\d{4,10}$'),
    codigo_formateado    text        NOT NULL,                 -- como aparece en la Gaceta
    partida              char(4)     NOT NULL REFERENCES arancel.partida (codigo),
    padre                varchar(10) REFERENCES arancel.subpartida (codigo) DEFERRABLE INITIALLY DEFERRED,
    nivel                smallint    NOT NULL CHECK (nivel BETWEEN 0 AND 8),  -- guiones en la Gaceta
    orden                integer     NOT NULL UNIQUE,          -- orden de aparición en la Gaceta
    descripcion          text        NOT NULL,
    es_terminal          boolean     NOT NULL,
    aec                  numeric(5,2) CHECK (aec BETWEEN 0 AND 100),
    marca_aec            text        CHECK (marca_aec IN ('BK', 'BIT')),
    exaec                numeric(5,2) CHECK (exaec BETWEEN 0 AND 100),
    marca_exaec          text        CHECK (marca_exaec IN ('A', 'E', 'E,A', '±DV')),
    regimen_importacion  smallint[]  NOT NULL DEFAULT '{}' CHECK (regimen_importacion <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21}'::smallint[]),
    regimen_exportacion  smallint[]  NOT NULL DEFAULT '{}' CHECK (regimen_exportacion <@ '{1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21}'::smallint[]),
    unidad               text        REFERENCES arancel.unidad_fisica (sigla),
    pagina_gaceta        smallint    NOT NULL,
    version_id           integer     NOT NULL REFERENCES arancel.version (id),
    CHECK (left(codigo, 4) = partida),
    CHECK (NOT es_terminal OR length(codigo) = 10),
    CHECK (padre IS NULL OR codigo LIKE rtrim(padre, '0') || '%')
);
CREATE INDEX IF NOT EXISTS subpartida_partida_idx ON arancel.subpartida (partida);
CREATE INDEX IF NOT EXISTS subpartida_padre_idx   ON arancel.subpartida (padre);
CREATE INDEX IF NOT EXISTS subpartida_desc_trgm   ON arancel.subpartida USING gin (descripcion gin_trgm_ops);

-- Vacíos e incoherencias de la propia Gaceta, registrados para revisión humana (nunca se corrigen solos)
CREATE TABLE IF NOT EXISTS arancel.observacion_fuente (
    id            serial  PRIMARY KEY,
    codigo        varchar(10) NOT NULL,
    tipo          text    NOT NULL,
    detalle       text    NOT NULL DEFAULT '',
    valor_fuente  text    NOT NULL DEFAULT '',
    version_id    integer NOT NULL REFERENCES arancel.version (id),
    revisada      boolean NOT NULL DEFAULT false
);

-- Registro de cada cambio introducido por las reformas (antes -> después), con su base legal
CREATE TABLE IF NOT EXISTS arancel.cambio (
    id          serial  PRIMARY KEY,
    version_id  integer NOT NULL REFERENCES arancel.version (id),
    articulo    text    NOT NULL,
    tipo        text    NOT NULL,     -- crea | elimina | modifica | exaec | regimen | partida | regimen_legal
    codigo      varchar(10) NOT NULL,
    campo       text    NOT NULL DEFAULT '',
    antes       text    NOT NULL DEFAULT '',
    despues     text    NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS cambio_codigo_idx ON arancel.cambio (codigo);

-- Ruta jerárquica completa (resuelve los "Los demás": Capítulo > Partida > ... > hoja)
CREATE OR REPLACE VIEW arancel.v_subpartida_ruta AS
WITH RECURSIVE arbol AS (
    SELECT s.codigo, s.padre, s.descripcion::text AS ruta, 1 AS profundidad
    FROM arancel.subpartida s
    WHERE s.padre IS NULL
    UNION ALL
    SELECT h.codigo, h.padre, a.ruta || ' > ' || h.descripcion, a.profundidad + 1
    FROM arancel.subpartida h
    JOIN arbol a ON h.padre = a.codigo
)
SELECT s.codigo, s.codigo_formateado, s.es_terminal,
       c.codigo AS capitulo, s.partida,
       p.descripcion || ' > ' || a.ruta AS ruta,
       s.aec, s.marca_aec, s.exaec, s.marca_exaec,
       s.regimen_importacion, s.regimen_exportacion, s.unidad
FROM arancel.subpartida s
JOIN arbol a            ON a.codigo = s.codigo
JOIN arancel.partida p  ON p.codigo = s.partida
JOIN arancel.capitulo c ON c.codigo = p.capitulo;
