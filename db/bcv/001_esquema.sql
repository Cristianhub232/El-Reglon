-- =============================================================================
-- El Renglón · Módulo BCV · Esquema PostgreSQL (16+)
-- Tipo de Cambio de Referencia del BCV (Sistema de Mercado Cambiario).
-- Tasa OFICIAL = venta_bs ("Venta (ASK)" en Bs./moneda), la misma que publica la portada del BCV.
-- Base legal: Convenio Cambiario N° 1, art. 9, parágrafo primero; Resolución N° 19-05-01.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS bcv;

-- Origen de cada dato: archivo histórico .xls, portada del BCV o migración de otro sistema
CREATE TABLE IF NOT EXISTS bcv.fuente (
    id           serial PRIMARY KEY,
    tipo         text   NOT NULL CHECK (tipo IN ('xls_historico', 'portada', 'migracion')),
    archivo      text   NOT NULL UNIQUE,          -- nombre del archivo o URL
    sha256       char(64) CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    periodo      text,                            -- p. ej. '2025-T1'
    cargado_en   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bcv.moneda (
    codigo      char(3) PRIMARY KEY CHECK (codigo ~ '^[A-Z]{3}$'),   -- tal como lo publica el BCV
    pais        text    NOT NULL,
    codigo_iso  char(3) NOT NULL,                                     -- ISO 4217 (MXP -> MXN)
    nota        text
);

-- Una publicación por FECHA VALOR (el día en que rige la tasa)
CREATE TABLE IF NOT EXISTS bcv.publicacion (
    fecha_valor      date PRIMARY KEY,
    fecha_operacion  date,                        -- NULL si la fuente es la portada (no la informa)
    publicado_en     timestamptz,                 -- hora de publicación indicada en la hoja
    fuente_id        integer NOT NULL REFERENCES bcv.fuente (id),
    hoja             text,
    CHECK (fecha_operacion IS NULL OR (fecha_valor > fecha_operacion AND fecha_valor <= fecha_operacion + 6))
);

CREATE TABLE IF NOT EXISTS bcv.tasa (
    fecha_valor        date         NOT NULL REFERENCES bcv.publicacion (fecha_valor),
    moneda             char(3)      NOT NULL REFERENCES bcv.moneda (codigo),
    compra_bs          numeric(20,8) CHECK (compra_bs > 0),         -- NULL si la fuente es la portada
    venta_bs           numeric(20,8) NOT NULL CHECK (venta_bs > 0),     -- TASA OFICIAL
    cotizacion_compra  numeric(20,8) CHECK (cotizacion_compra > 0),  -- M.E./US$ (EUR: US$/EUR)
    cotizacion_venta   numeric(20,8) CHECK (cotizacion_venta > 0),
    PRIMARY KEY (fecha_valor, moneda),
    CHECK (compra_bs <= venta_bs AND cotizacion_compra <= cotizacion_venta)
);
COMMENT ON COLUMN bcv.tasa.venta_bs IS 'Tasa oficial del BCV en Bs. por unidad de moneda (Venta ASK); es la publicada en la portada';

-- Idempotente en bases creadas antes de admitir datos de la portada
ALTER TABLE bcv.publicacion ALTER COLUMN fecha_operacion DROP NOT NULL;
ALTER TABLE bcv.tasa ALTER COLUMN compra_bs DROP NOT NULL,
                     ALTER COLUMN cotizacion_compra DROP NOT NULL,
                     ALTER COLUMN cotizacion_venta DROP NOT NULL;

-- Días hábiles (lunes a viernes) sin fecha valor: feriados bancarios observados en las publicaciones
CREATE TABLE IF NOT EXISTS bcv.dia_sin_publicacion (
    fecha   date PRIMARY KEY CHECK (extract(isodow FROM fecha) BETWEEN 1 AND 5),
    motivo  text NOT NULL DEFAULT 'feriado bancario (inferido: día hábil sin fecha valor en las publicaciones del BCV)'
);

CREATE TABLE IF NOT EXISTS bcv.observacion (
    id           serial PRIMARY KEY,
    tipo         text NOT NULL,
    fecha_valor  date,
    moneda       char(3),
    detalle      text NOT NULL DEFAULT '',
    revisada     boolean NOT NULL DEFAULT false
);

-- Tasa oficial por fecha valor (lo que publica el BCV)
CREATE OR REPLACE VIEW bcv.v_tasa_oficial AS
SELECT t.fecha_valor, t.moneda, t.venta_bs AS tasa_bs, p.fecha_operacion, p.publicado_en, f.tipo AS fuente, f.archivo
FROM bcv.tasa t
JOIN bcv.publicacion p ON p.fecha_valor = t.fecha_valor
JOIN bcv.fuente f      ON f.id = p.fuente_id;

-- Tasa APLICABLE a una operación (art. 25 de la Ley de IVA): la del día de la operación; si ese día
-- no es hábil para el sector financiero, la vigente en el día hábil inmediatamente siguiente.
-- Como solo los días hábiles tienen fecha valor, es la primera fecha valor >= fecha de la operación.
-- No devuelve filas si la fecha es posterior a la última publicación (nunca se inventa una tasa).
CREATE OR REPLACE FUNCTION bcv.tasa_aplicable(p_fecha date, p_moneda char(3) DEFAULT 'USD')
RETURNS TABLE (fecha_operacion_consultada date, fecha_valor date, moneda char(3), tasa_bs numeric,
               dias_diferidos integer, motivo text)
LANGUAGE sql STABLE AS $$
    SELECT p_fecha, t.fecha_valor, t.moneda, t.venta_bs, (t.fecha_valor - p_fecha),
           CASE WHEN t.fecha_valor = p_fecha THEN 'tasa del día de la operación'
                ELSE 'día no hábil: tasa vigente en el día hábil inmediatamente siguiente (art. 25 Ley IVA)' END
    FROM bcv.tasa t
    WHERE t.moneda = upper(p_moneda) AND t.fecha_valor >= p_fecha
      AND t.fecha_valor <= p_fecha + 10          -- evita saltar huecos largos de datos
    ORDER BY t.fecha_valor
    LIMIT 1
$$;

-- COT arts. 91 y 92: las multas se expresan en "el tipo de cambio oficial de la moneda de mayor valor,
-- publicado por el Banco Central de Venezuela". Devuelve esa moneda y su tasa para la fecha dada
-- (la del día o, si es inhábil, la vigente el siguiente día hábil, como en tasa_aplicable).
CREATE OR REPLACE FUNCTION bcv.moneda_mayor_valor(p_fecha date DEFAULT (now() AT TIME ZONE 'America/Caracas')::date)
RETURNS TABLE (fecha_consultada date, fecha_valor date, moneda char(3), tasa_bs numeric)
LANGUAGE sql STABLE AS $$
    SELECT p_fecha, t.fecha_valor, t.moneda, t.venta_bs
    FROM bcv.tasa t
    WHERE t.fecha_valor = (SELECT min(fecha_valor) FROM bcv.publicacion WHERE fecha_valor >= p_fecha AND fecha_valor <= p_fecha + 10)
    ORDER BY t.venta_bs DESC
    LIMIT 1
$$;
