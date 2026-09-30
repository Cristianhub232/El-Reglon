-- =============================================================================
-- El Renglón · Módulo Calendario · Carga de la semilla (una transacción; ON_ERROR_STOP)
-- __DIR__ lo reemplaza herramientas/calendario/cargar_calendario.sh
-- =============================================================================
\set ON_ERROR_STOP on

TRUNCATE calendario.vencimiento, calendario.obligacion, calendario.condicion, calendario.instrumento;
-- Los días agregados desde el panel se conservan; los de la semilla se reemplazan
DELETE FROM calendario.dia_inhabil WHERE origen = 'semilla';

INSERT INTO calendario.condicion (codigo, descripcion) VALUES
 ('MINERIA_HIDROCARBUROS', 'Actividades mineras o de hidrocarburos y conexas, no perceptor de regalías (Providencia 000091, arts. 2 y 5)'),
 ('SOLO_EXENTO_EXONERADO', 'Realiza exclusivamente actividades exentas o exoneradas de IVA (art. 3)'),
 ('JUEGOS_AZAR',           'Actividades de juegos de envite o azar (art. 1 lit. d)'),
 ('LOTERIA',               'Agente de retención de ISLR sobre premios de lotería (art. 1 lit. e)'),
 ('EJERCICIO_IRREGULAR',   'Ejercicio fiscal distinto del año calendario (art. 1 lit. g; art. 4)'),
 ('GRANDES_PATRIMONIOS',   'Sujeto al Impuesto a los Grandes Patrimonios (art. 1 lit. h)'),
 ('ENTE_PUBLICO',          'Servicio desconcentrado, autónomo o ente descentralizado sujeto al aporte del 70 % (art. 1 lit. i)');

CREATE TEMP TABLE s_instrumento (codigo text, nombre text, gaceta text, fecha_publicacion date, fuente_archivo text, fuente_sha256 text) ON COMMIT DROP;
CREATE TEMP TABLE s_obligacion (codigo text, instrumento text, tipo_contribuyente text, base_legal text, nombre text,
    aplica_a text, requiere text, excluye text, nota text) ON COMMIT DROP;
CREATE TEMP TABLE s_vencimiento (obligacion text, terminal smallint, fecha date, fecha_prorrogada date, periodo_desde date, periodo_hasta date) ON COMMIT DROP;
CREATE TEMP TABLE s_dia_inhabil (fecha date, descripcion text, tipo text, base_legal text) ON COMMIT DROP;
\copy s_instrumento FROM '__DIR__/instrumento.csv' CSV HEADER
\copy s_obligacion FROM '__DIR__/obligacion.csv' CSV HEADER
\copy s_vencimiento FROM '__DIR__/vencimiento.csv' CSV HEADER
\copy s_dia_inhabil FROM '__DIR__/dia_inhabil.csv' CSV HEADER

INSERT INTO calendario.instrumento SELECT codigo, nombre, gaceta, fecha_publicacion, NULLIF(fuente_archivo, ''), NULLIF(fuente_sha256, '') FROM s_instrumento;
INSERT INTO calendario.obligacion SELECT codigo, instrumento, tipo_contribuyente, base_legal, nombre, aplica_a,
    NULLIF(requiere, ''), NULLIF(excluye, ''), NULLIF(nota, '') FROM s_obligacion;
INSERT INTO calendario.vencimiento SELECT * FROM s_vencimiento;
INSERT INTO calendario.dia_inhabil (fecha, descripcion, tipo, base_legal, origen) SELECT fecha, descripcion, tipo, base_legal, 'semilla' FROM s_dia_inhabil
    ON CONFLICT (fecha) DO UPDATE SET descripcion = EXCLUDED.descripcion, tipo = EXCLUDED.tipo, base_legal = EXCLUDED.base_legal, origen = 'semilla';

-- Prórrogas con todos los días inhábiles, incluidos los agregados desde el panel
SELECT calendario.recalcular_prorrogas() AS vencimientos_recalculados;

SELECT set_config('renglon.esp_obl', :'esperado_obligaciones', true), set_config('renglon.esp_ven', :'esperado_vencimientos', true);

DO $$
DECLARE n bigint; x text;
BEGIN
    -- V1. Conteos del manifiesto
    IF (SELECT count(*) FROM calendario.obligacion) <> current_setting('renglon.esp_obl')::int
       OR (SELECT count(*) FROM calendario.vencimiento) <> current_setting('renglon.esp_ven')::int THEN
        RAISE EXCEPTION 'V1: conteos distintos al manifiesto';
    END IF;
    -- V2. Ninguna fecha de la norma en sábado, domingo ni feriado nacional (un día bancario sí puede ocurrir: se prorroga)
    SELECT string_agg(DISTINCT v.obligacion || ' ' || v.fecha, ', ') INTO x FROM calendario.vencimiento v
     WHERE extract(isodow FROM v.fecha) >= 6 OR v.fecha IN (SELECT fecha FROM calendario.dia_inhabil WHERE tipo = 'NACIONAL' AND origen = 'semilla');
    IF x IS NOT NULL THEN RAISE EXCEPTION 'V2: vencimientos en día inhábil: %', x; END IF;
    -- V8. Prórroga (COT art. 10): existe si y solo si la fecha es inhábil, y es el primer día hábil siguiente
    SELECT string_agg(DISTINCT v.obligacion || ' ' || v.fecha, ', ') INTO x FROM calendario.vencimiento v
     WHERE (v.fecha_prorrogada IS NOT NULL) <> (v.fecha IN (SELECT fecha FROM calendario.dia_inhabil))
        OR v.fecha_prorrogada <> (SELECT min(d)::date FROM generate_series(v.fecha + 1, v.fecha + 10, interval '1 day') d
                                   WHERE extract(isodow FROM d) < 6 AND d::date NOT IN (SELECT fecha FROM calendario.dia_inhabil));
    IF x IS NOT NULL THEN RAISE EXCEPTION 'V8: prórrogas incoherentes: %', x; END IF;
    -- V3. Cada obligación mensual tiene exactamente una fecha por terminal y por mes de vencimiento
    SELECT string_agg(obligacion || ' t' || terminal || ' ' || mes, ', ') INTO x FROM (
        SELECT obligacion, terminal, date_trunc('month', fecha) mes FROM calendario.vencimiento
        GROUP BY 1, 2, 3 HAVING count(*) > 1) d;
    IF x IS NOT NULL THEN RAISE EXCEPTION 'V3: más de un vencimiento por terminal y mes: %', x; END IF;
    -- V4. Cada obligación cubre los 10 terminales en cada mes (la anual de ISLR, una sola vez en el año)
    SELECT string_agg(DISTINCT obligacion, ', ') INTO x FROM (
        SELECT obligacion, date_trunc('month', fecha) FROM calendario.vencimiento WHERE obligacion <> 'ISLR_ANUAL_2025'
        GROUP BY 1, 2 HAVING count(DISTINCT terminal) <> 10
        UNION ALL
        SELECT obligacion, NULL FROM calendario.vencimiento WHERE obligacion = 'ISLR_ANUAL_2025'
        GROUP BY 1 HAVING count(DISTINCT terminal) <> 10 OR count(*) <> 10) d;
    IF x IS NOT NULL THEN RAISE EXCEPTION 'V4: terminales incompletos en: %', x; END IF;
    -- V5. Quincenas: la 1ª vence desde el 16 del mismo mes; la 2ª hasta el 16 del mes siguiente al período
    SELECT count(*) INTO n FROM calendario.vencimiento
     WHERE (obligacion LIKE '%\_P1' AND (extract(day FROM fecha) < 16 OR date_trunc('month', periodo_desde) <> date_trunc('month', fecha)))
        OR (obligacion LIKE '%\_P2' AND (extract(day FROM fecha) > 16 OR date_trunc('month', periodo_hasta) <> date_trunc('month', fecha) - interval '1 month'));
    IF n > 0 THEN RAISE EXCEPTION 'V5: % quincenas incoherentes', n; END IF;
    -- V6. Ordinarios: vencen el día 15 del mes siguiente al período, o el primer día hábil posterior (Regl. IVA art. 60; COT art. 10)
    SELECT string_agg(fecha::text, ', ') INTO x FROM (
        SELECT DISTINCT v.fecha, v.periodo_hasta FROM calendario.vencimiento v WHERE v.obligacion = 'IVA_MENSUAL_ORDINARIO') o
     WHERE fecha <> (SELECT min(d)::date FROM generate_series((o.periodo_hasta + 15), (o.periodo_hasta + 30), interval '1 day') d
                     WHERE extract(isodow FROM d) < 6 AND d::date NOT IN (SELECT fecha FROM calendario.dia_inhabil));
    IF x IS NOT NULL THEN RAISE EXCEPTION 'V6: vencimientos de ordinarios mal calculados: %', x; END IF;
    -- V7. Las tablas del art. 2 (IVA minería), art. 1 lit. b (estimadas) e i (aporte 70 %) son idénticas en la Gaceta
    SELECT count(*) INTO n FROM (
        (SELECT terminal, fecha FROM calendario.vencimiento WHERE obligacion = 'ISLR_ESTIMADAS'
         EXCEPT SELECT terminal, fecha FROM calendario.vencimiento WHERE obligacion = 'IVA_MENSUAL_MINERIA_HIDROCARBUROS')
        UNION ALL
        (SELECT terminal, fecha FROM calendario.vencimiento WHERE obligacion = 'APORTE_70'
         EXCEPT SELECT terminal, fecha FROM calendario.vencimiento WHERE obligacion = 'ISLR_ESTIMADAS')) d;
    IF n > 0 THEN RAISE EXCEPTION 'V7: las tablas b), i) y art. 2 no coinciden (% diferencias)', n; END IF;
    RAISE NOTICE 'Validaciones V1..V8 superadas';
END $$;

SELECT 'obligaciones' tabla, count(*) FROM calendario.obligacion
UNION ALL SELECT 'vencimientos', count(*) FROM calendario.vencimiento
UNION ALL SELECT 'dias_inhabiles', count(*) FROM calendario.dia_inhabil
UNION ALL SELECT 'con_prorroga', count(*) FROM calendario.vencimiento WHERE fecha_prorrogada IS NOT NULL;
