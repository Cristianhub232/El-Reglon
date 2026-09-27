-- =============================================================================
-- El Renglón · Módulo IVA · Esquema PostgreSQL (16+)
-- Ley de IVA (texto reformado, GO Ext. N° 6.507 del 29/01/2020) y decretos vigentes.
-- El catálogo (base legal, reglas, opciones, relación con el arancel) se carga con
-- scripts/iva-cargar-catalogo.ts desde datos/iva/catalogo.json, en una sola transacción.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS iva;

-- Componentes de alícuota por vigencia (se cambian por decreto: nunca van fijos en el código)
CREATE TABLE IF NOT EXISTS iva.alicuota (
    codigo         text    NOT NULL CHECK (codigo IN ('GENERAL', 'REDUCIDA', 'ADICIONAL_SUNTUARIA')),
    porcentaje     numeric(5,2) NOT NULL CHECK (porcentaje >= 0 AND porcentaje <= 100),
    vigente_desde  date    NOT NULL,
    vigente_hasta  date,
    instrumento    text    NOT NULL,
    PRIMARY KEY (codigo, vigente_desde),
    CHECK (vigente_hasta IS NULL OR vigente_hasta >= vigente_desde)
);

CREATE TABLE IF NOT EXISTS iva.categoria (
    codigo                text PRIMARY KEY,
    denominacion          text NOT NULL,         -- terminología SENIAT (docs/06)
    componentes           text[] NOT NULL,       -- componentes de iva.alicuota que suma
    marca_exento          boolean NOT NULL,      -- "(E)" en la factura (Providencia SNAT/2011/00071)
    concepto_nacional     text NOT NULL,         -- renglón de la declaración (a verificar, B18)
    concepto_importacion  text NOT NULL
);

CREATE TABLE IF NOT EXISTS iva.catalogo_version (
    id           serial PRIMARY KEY,
    version      text NOT NULL UNIQUE,           -- SHA-256 corto del catalogo.json
    cargado_en   timestamptz NOT NULL DEFAULT now(),
    estado       text NOT NULL DEFAULT 'pendiente_validacion_asesor',
    nota         text,
    validaciones jsonb
);

CREATE TABLE IF NOT EXISTS iva.base_legal (
    id        text PRIMARY KEY,                  -- p. ej. LIVA-18-1-c
    norma     text NOT NULL,
    gaceta    text NOT NULL,
    articulo  text NOT NULL,
    numeral   text,
    literal   text,
    texto     text NOT NULL,                     -- texto literal
    fuente_pdf text,                             -- PDF de la Gaceta en fuentes/ (NULL: sin fuente oficial a mano)
    verificado boolean NOT NULL                  -- true: el cargador comprobó el texto contra el PDF de la Gaceta
);

CREATE TABLE IF NOT EXISTS iva.regla (
    id                text PRIMARY KEY,
    tipo              text NOT NULL CHECK (tipo IN ('BIEN', 'SERVICIO')),
    nombre            text NOT NULL,
    prioridad         smallint NOT NULL CHECK (prioridad BETWEEN 1 AND 100),  -- mayor gana
    patrones_incluir  text[] NOT NULL DEFAULT '{}',   -- regex sobre el texto normalizado (minúsculas, sin acentos)
    patrones_excluir  text[] NOT NULL DEFAULT '{}',
    patrones_todos    text[] NOT NULL DEFAULT '{}',   -- además, TODOS estos deben coincidir (p. ej. 'tomate' y 'congelado')
    categorias_off    text[] NOT NULL DEFAULT '{}',   -- categorías de Open Food Facts (en:...)
    zona_gris         boolean NOT NULL DEFAULT false,
    nota              text
);

CREATE TABLE IF NOT EXISTS iva.opcion_regla (
    regla_id        text NOT NULL REFERENCES iva.regla (id) ON DELETE CASCADE,
    orden           smallint NOT NULL,
    categoria       text NOT NULL REFERENCES iva.categoria (codigo),
    base_legal      text[] NOT NULL,             -- ids de iva.base_legal
    condicion       text,                        -- texto para el usuario (NULL: sin condición)
    condicion_eval  jsonb,                       -- {"campo":"precio_usd","op":">=","valor":300}; campos: precio_usd, peso_g, uso, cliente
    PRIMARY KEY (regla_id, orden)
);

-- Relación prefijo arancelario → regla (gana el prefijo más largo)
CREATE TABLE IF NOT EXISTS iva.regla_arancel (
    prefijo   varchar(10) PRIMARY KEY CHECK (prefijo ~ '^\d{2,10}$'),
    regla_id  text NOT NULL REFERENCES iva.regla (id) ON DELETE CASCADE,
    nota      text
);

-- Decretos que modifican el tratamiento según la operación y la fecha
CREATE TABLE IF NOT EXISTS iva.decreto (
    codigo         text PRIMARY KEY,
    nombre         text NOT NULL,
    gaceta         text NOT NULL,
    efecto         text NOT NULL CHECK (efecto IN ('SUSPENDE_EXENCION_IMPORTACION')),
    vigente_desde  date NOT NULL,
    vigente_hasta  date,
    base_legal     text NOT NULL REFERENCES iva.base_legal (id),
    nota           text
);

-- Caché de productos identificados por código de barras (Open Food Facts y otras fuentes)
CREATE TABLE IF NOT EXISTS iva.producto_cache (
    codigo         text PRIMARY KEY,
    encontrado     boolean NOT NULL,
    nombre         text,
    marca          text,
    cantidad       text,
    categorias     text[] NOT NULL DEFAULT '{}',
    fuente         text NOT NULL,
    consultado_en  timestamptz NOT NULL DEFAULT now()
);

-- Minería de precios (análisis internos; sin datos personales)
CREATE TABLE IF NOT EXISTS iva.observacion_precio (
    id                 bigserial PRIMARY KEY,
    observado_en       timestamptz NOT NULL DEFAULT now(),
    fecha_operacion    date NOT NULL,
    codigo_barras      text,
    codigo_arancelario varchar(10),
    nombre_normalizado text,
    regla_id           text,
    precio_compra      numeric(20,4) CHECK (precio_compra > 0),
    precio_venta       numeric(20,4) CHECK (precio_venta > 0),
    moneda             char(3) NOT NULL CHECK (moneda IN ('VES', 'USD')),
    precio_compra_bs   numeric(24,4), precio_venta_bs numeric(24,4),
    precio_compra_usd  numeric(24,6), precio_venta_usd numeric(24,6),
    tasa_bcv           numeric(20,8),
    tasa_fecha_valor   date,
    ubicacion          text,
    api_key_id         integer,
    calidad            text NOT NULL DEFAULT 'ok' CHECK (calidad IN ('ok', 'atipico', 'duplicado')),
    CHECK (precio_compra IS NOT NULL OR precio_venta IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS observacion_precio_regla_idx ON iva.observacion_precio (regla_id, observado_en);

-- Consultas ambiguas o sin resolver, para mejorar el catálogo (RF-14)
CREATE TABLE IF NOT EXISTS iva.consulta_registro (
    id           bigserial PRIMARY KEY,
    ocurrido_en  timestamptz NOT NULL DEFAULT now(),
    estado       text NOT NULL CHECK (estado IN ('condicionado', 'no_determinado')),
    entrada      jsonb NOT NULL,
    reglas       text[] NOT NULL DEFAULT '{}',
    api_key_id   integer,
    revisada     boolean NOT NULL DEFAULT false
);

-- Alícuotas vigentes a una fecha
CREATE OR REPLACE FUNCTION iva.alicuotas_vigentes(p_fecha date)
RETURNS TABLE (codigo text, porcentaje numeric, instrumento text)
LANGUAGE sql STABLE AS $$
    SELECT a.codigo, a.porcentaje, a.instrumento FROM iva.alicuota a
    WHERE a.vigente_desde <= p_fecha AND (a.vigente_hasta IS NULL OR a.vigente_hasta >= p_fecha)
$$;
