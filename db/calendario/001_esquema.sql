-- =============================================================================
-- El Renglón · Módulo Calendario tributario · Esquema PostgreSQL (16+)
-- Especiales: Providencia SNAT/2025/000091 (GO 43.283). Ordinarios (IVA): art. 60 Reglamento
-- General de la Ley de IVA. Plazos en día inhábil: COT art. 10 (num. 3 y parágrafo único: los días en que
-- los bancos no abren al público son inhábiles para declarar y pagar). Requiere el esquema rif.
-- =============================================================================
CREATE SCHEMA IF NOT EXISTS calendario;

CREATE TABLE IF NOT EXISTS calendario.instrumento (
    codigo             text PRIMARY KEY,
    nombre             text NOT NULL,
    gaceta             text NOT NULL,
    fecha_publicacion  date NOT NULL,
    fuente_archivo     text,
    fuente_sha256      char(64) CHECK (fuente_sha256 ~ '^[0-9a-f]{64}$')
);

-- Condiciones que el contribuyente declara (no se deducen del RIF)
CREATE TABLE IF NOT EXISTS calendario.condicion (
    codigo       text PRIMARY KEY,
    descripcion  text NOT NULL
);

CREATE TABLE IF NOT EXISTS calendario.obligacion (
    codigo              text PRIMARY KEY,
    instrumento         text NOT NULL REFERENCES calendario.instrumento (codigo),
    tipo_contribuyente  text NOT NULL CHECK (tipo_contribuyente IN ('ESPECIAL', 'ORDINARIO')),
    base_legal          text NOT NULL,
    nombre              text NOT NULL,
    aplica_a            text NOT NULL,
    requiere            text REFERENCES calendario.condicion (codigo),   -- NULL: aplica a todo el tipo
    excluye             text REFERENCES calendario.condicion (codigo),
    nota                text
);

CREATE TABLE IF NOT EXISTS calendario.vencimiento (
    obligacion     text     NOT NULL REFERENCES calendario.obligacion (codigo),
    terminal       smallint NOT NULL CHECK (terminal BETWEEN 0 AND 9),   -- último dígito del RIF
    fecha          date     NOT NULL,                -- fecha fijada por la norma
    fecha_prorrogada date,                          -- si la fecha es inhábil: primer día hábil siguiente (COT art. 10)
    periodo_desde  date,
    periodo_hasta  date,
    PRIMARY KEY (obligacion, terminal, fecha),
    CHECK ((periodo_desde IS NULL) = (periodo_hasta IS NULL)),
    CHECK (periodo_desde <= periodo_hasta AND periodo_hasta < fecha),
    CHECK (fecha_prorrogada > fecha)
);
CREATE INDEX IF NOT EXISTS vencimiento_terminal_fecha_idx ON calendario.vencimiento (terminal, fecha);

-- Días inhábiles para declarar y pagar (COT art. 10): feriados nacionales (LOTTT art. 184) y días
-- bancarios no laborables del calendario de SUDEBAN
CREATE TABLE IF NOT EXISTS calendario.dia_inhabil (
    fecha        date PRIMARY KEY,
    descripcion  text NOT NULL,
    tipo         text NOT NULL CHECK (tipo IN ('NACIONAL', 'BANCARIO')),
    base_legal   text NOT NULL
);

-- Próximos deberes de un contribuyente.
--   p_tipo: 'ESPECIAL' u 'ORDINARIO' (la condición de especial la notifica el SENIAT; no se deduce del RIF)
--   p_condiciones: condiciones declaradas (ver calendario.condicion)
--   p_desde: por defecto HOY en America/Caracas
-- fecha = fecha de la norma; fecha_limite = fecha prorrogada por el COT art. 10 cuando la de la norma es inhábil.
DROP FUNCTION IF EXISTS calendario.proximos_deberes(text, text, text[], date, int);
CREATE OR REPLACE FUNCTION calendario.proximos_deberes(
    p_rif text, p_tipo text, p_condiciones text[] DEFAULT '{}',
    p_desde date DEFAULT (now() AT TIME ZONE 'America/Caracas')::date, p_limite int DEFAULT 10)
RETURNS TABLE (fecha date, fecha_limite date, dias_restantes int, obligacion text, nombre text, base_legal text,
               periodo_desde date, periodo_hasta date, aviso text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
    v record;
BEGIN
    SELECT * INTO v FROM rif.validar(p_rif);
    IF NOT v.valido THEN
        RAISE EXCEPTION 'RIF inválido (%): %', p_rif, v.mensaje USING ERRCODE = '22023';
    END IF;
    IF upper(p_tipo) NOT IN ('ESPECIAL', 'ORDINARIO') THEN
        RAISE EXCEPTION 'Tipo de contribuyente inválido: % (use ESPECIAL u ORDINARIO)', p_tipo USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(p_condiciones) c WHERE c NOT IN (SELECT codigo FROM calendario.condicion)) THEN
        RAISE EXCEPTION 'Condición desconocida en %', p_condiciones USING ERRCODE = '22023';
    END IF;
    RETURN QUERY
    SELECT ve.fecha, coalesce(ve.fecha_prorrogada, ve.fecha), (coalesce(ve.fecha_prorrogada, ve.fecha) - p_desde)::int,
           o.codigo, o.nombre, o.base_legal, ve.periodo_desde, ve.periodo_hasta,
           CASE WHEN ve.fecha_prorrogada IS NOT NULL THEN
               'La fecha de la norma (' || to_char(ve.fecha, 'DD/MM/YYYY') || ') es inhábil: ' || di.descripcion ||
               '. Por el COT art. 10 el plazo se entiende prorrogado hasta el ' || to_char(ve.fecha_prorrogada, 'DD/MM/YYYY') ||
               '. Se recomienda cumplir antes; confirme con su asesor.' END
    FROM calendario.vencimiento ve
    JOIN calendario.obligacion o ON o.codigo = ve.obligacion
    LEFT JOIN calendario.dia_inhabil di ON di.fecha = ve.fecha
    WHERE ve.terminal = v.terminal AND coalesce(ve.fecha_prorrogada, ve.fecha) >= p_desde
      AND o.tipo_contribuyente = upper(p_tipo)
      AND (o.requiere IS NULL OR o.requiere = ANY (p_condiciones))
      AND (o.excluye IS NULL OR NOT (o.excluye = ANY (p_condiciones)))
    ORDER BY coalesce(ve.fecha_prorrogada, ve.fecha), o.codigo
    LIMIT p_limite;
END $$;

-- ---------------------------------------------------------------------------
-- Días inhábiles agregados desde el panel (p. ej. un día no laborable decretado): sobreviven a la recarga de la
-- semilla, y las prórrogas se recalculan con ellos.
ALTER TABLE calendario.dia_inhabil ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'semilla' CHECK (origen IN ('semilla', 'panel'));
ALTER TABLE calendario.dia_inhabil ADD COLUMN IF NOT EXISTS agregado_por text;
ALTER TABLE calendario.dia_inhabil ADD COLUMN IF NOT EXISTS agregado_en timestamptz;

CREATE OR REPLACE FUNCTION calendario.es_habil(p date) RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT extract(isodow FROM p) < 6 AND NOT EXISTS (SELECT 1 FROM calendario.dia_inhabil WHERE fecha = p)
$$;

-- Primer día hábil a partir de p (incluido)
CREATE OR REPLACE FUNCTION calendario.habil_desde(p date) RETURNS date LANGUAGE sql STABLE AS $$
    SELECT min(d)::date FROM generate_series(p, p + 30, interval '1 day') d WHERE calendario.es_habil(d::date)
$$;

-- COT art. 10. Especiales: la fecha de la norma se conserva y, si es inhábil, se agrega la prorrogada.
-- Ordinarios (Reglamento IVA art. 60): el vencimiento es el primer día hábil desde el día 15 del mes siguiente al período.
-- Devuelve cuántos vencimientos cambiaron.
CREATE OR REPLACE FUNCTION calendario.recalcular_prorrogas() RETURNS integer LANGUAGE plpgsql AS $$
DECLARE n1 integer; n2 integer;
BEGIN
    UPDATE calendario.vencimiento v
       SET fecha_prorrogada = CASE WHEN calendario.es_habil(v.fecha) THEN NULL ELSE calendario.habil_desde(v.fecha + 1) END
      FROM calendario.obligacion o
     WHERE o.codigo = v.obligacion AND o.tipo_contribuyente = 'ESPECIAL'
       AND v.fecha_prorrogada IS DISTINCT FROM (CASE WHEN calendario.es_habil(v.fecha) THEN NULL ELSE calendario.habil_desde(v.fecha + 1) END);
    GET DIAGNOSTICS n1 = ROW_COUNT;
    UPDATE calendario.vencimiento v
       SET fecha = calendario.habil_desde((date_trunc('month', v.periodo_hasta) + interval '1 month' + interval '14 days')::date)
      FROM calendario.obligacion o
     WHERE o.codigo = v.obligacion AND o.tipo_contribuyente = 'ORDINARIO' AND v.periodo_hasta IS NOT NULL
       AND v.fecha <> calendario.habil_desde((date_trunc('month', v.periodo_hasta) + interval '1 month' + interval '14 days')::date);
    GET DIAGNOSTICS n2 = ROW_COUNT;
    RETURN n1 + n2;
END $$;
