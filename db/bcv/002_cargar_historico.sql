-- =============================================================================
-- El Renglón · Módulo BCV · Carga incremental del histórico (salida de extraer_historico_bcv.py)
--
-- Se ejecuta con herramientas/bcv/cargar_bcv.sh, en UNA transacción (psql -1, ON_ERROR_STOP).
-- Es idempotente: recargar los mismos archivos no duplica nada. Si un dato ya cargado difiere del
-- nuevo, la carga ABORTA (una tasa oficial nunca se sobrescribe en silencio).
-- __DIR__ es un marcador que el script reemplaza por el directorio de los CSV.
-- =============================================================================
\set ON_ERROR_STOP on

CREATE TEMP TABLE s_fuente (archivo text, sha256 text, periodo text, hojas int) ON COMMIT DROP;
CREATE TEMP TABLE s_moneda (codigo text, pais text, codigo_iso text, nota text) ON COMMIT DROP;
CREATE TEMP TABLE s_publicacion (fecha_valor date, fecha_operacion date, publicado_en timestamptz,
    fuente_archivo text, hoja text) ON COMMIT DROP;
CREATE TEMP TABLE s_tasa (fecha_valor date, moneda text, compra_bs numeric, venta_bs numeric,
    cotizacion_compra numeric, cotizacion_venta numeric) ON COMMIT DROP;
CREATE TEMP TABLE s_observacion (tipo text, fecha_valor date, moneda text, detalle text) ON COMMIT DROP;

\copy s_fuente FROM '__DIR__/fuente.csv' CSV HEADER
\copy s_moneda FROM '__DIR__/moneda.csv' CSV HEADER
\copy s_publicacion FROM '__DIR__/publicacion.csv' CSV HEADER
\copy s_tasa FROM '__DIR__/tasa.csv' CSV HEADER
\copy s_observacion FROM '__DIR__/observacion.csv' CSV HEADER

SELECT set_config('renglon.esp_pub', :'esperado_publicaciones', true),
       set_config('renglon.esp_tasas', :'esperado_tasas', true),
       set_config('renglon.ult_fecha', :'ultima_fecha', true),
       set_config('renglon.ult_usd', :'ultima_usd', true);

DO $$
DECLARE
    conflictos text;
BEGIN
    -- V1. El lote coincide con su manifiesto
    IF (SELECT count(*) FROM s_publicacion) <> current_setting('renglon.esp_pub')::int THEN
        RAISE EXCEPTION 'V1: publicaciones del lote no coinciden con el manifiesto'; END IF;
    IF (SELECT count(*) FROM s_tasa) <> current_setting('renglon.esp_tasas')::int THEN
        RAISE EXCEPTION 'V1: tasas del lote no coinciden con el manifiesto'; END IF;

    -- V2. Nada de lo ya cargado se contradice (una tasa oficial no se sobrescribe)
    SELECT string_agg(s.fecha_valor || ' ' || s.moneda || ': cargada ' || t.venta_bs || ', nueva ' || s.venta_bs, '; ')
      INTO conflictos
      FROM s_tasa s JOIN bcv.tasa t ON t.fecha_valor = s.fecha_valor AND t.moneda = s.moneda
     WHERE (t.compra_bs, t.venta_bs, t.cotizacion_compra, t.cotizacion_venta)
           IS DISTINCT FROM (s.compra_bs, s.venta_bs, s.cotizacion_compra, s.cotizacion_venta);
    IF conflictos IS NOT NULL THEN RAISE EXCEPTION 'V2: tasas en conflicto con las ya cargadas: %', conflictos; END IF;
    SELECT string_agg(s.fecha_valor::text, ', ') INTO conflictos
      FROM s_publicacion s JOIN bcv.publicacion p ON p.fecha_valor = s.fecha_valor
     WHERE p.fecha_operacion <> s.fecha_operacion;
    IF conflictos IS NOT NULL THEN RAISE EXCEPTION 'V2: publicaciones con otra fecha de operación: %', conflictos; END IF;

    -- V3. Toda publicación del lote trae USD y EUR
    SELECT string_agg(p.fecha_valor::text, ', ') INTO conflictos FROM s_publicacion p
     WHERE (SELECT count(*) FROM s_tasa t WHERE t.fecha_valor = p.fecha_valor AND t.moneda IN ('USD', 'EUR')) <> 2;
    IF conflictos IS NOT NULL THEN RAISE EXCEPTION 'V3: publicaciones sin USD o EUR: %', conflictos; END IF;

    -- V4. La última tasa del lote es la del manifiesto (control de extremo a extremo)
    IF (SELECT venta_bs FROM s_tasa WHERE moneda = 'USD' AND fecha_valor = current_setting('renglon.ult_fecha')::date)
       IS DISTINCT FROM current_setting('renglon.ult_usd')::numeric THEN
        RAISE EXCEPTION 'V4: la última tasa USD no coincide con el manifiesto'; END IF;
END $$;

INSERT INTO bcv.fuente (tipo, archivo, sha256, periodo)
SELECT 'xls_historico', archivo, sha256, periodo FROM s_fuente
ON CONFLICT (archivo) DO NOTHING;

-- Un mismo nombre de archivo con otro contenido (SHA-256 distinto) es un error: el BCV lo republicó
DO $$
DECLARE c text;
BEGIN
    SELECT string_agg(f.archivo, ', ') INTO c FROM bcv.fuente f JOIN s_fuente s USING (archivo) WHERE f.sha256 <> s.sha256;
    IF c IS NOT NULL THEN RAISE EXCEPTION 'V5: archivos ya cargados con contenido distinto (revisar republicación del BCV): %', c; END IF;
END $$;

INSERT INTO bcv.moneda SELECT codigo, pais, codigo_iso, NULLIF(nota, '') FROM s_moneda
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO bcv.publicacion (fecha_valor, fecha_operacion, publicado_en, fuente_id, hoja)
SELECT s.fecha_valor, s.fecha_operacion, s.publicado_en, f.id, s.hoja
FROM s_publicacion s JOIN bcv.fuente f ON f.archivo = s.fuente_archivo
ON CONFLICT (fecha_valor) DO NOTHING;

INSERT INTO bcv.tasa SELECT fecha_valor, moneda, compra_bs, venta_bs, cotizacion_compra, cotizacion_venta FROM s_tasa
ON CONFLICT (fecha_valor, moneda) DO NOTHING;

INSERT INTO bcv.dia_sin_publicacion (fecha)
SELECT fecha_valor FROM s_observacion WHERE tipo = 'dia_habil_sin_fecha_valor'
ON CONFLICT (fecha) DO NOTHING;

INSERT INTO bcv.observacion (tipo, fecha_valor, moneda, detalle)
SELECT o.tipo, o.fecha_valor, NULLIF(o.moneda, ''), COALESCE(o.detalle, '') FROM s_observacion o
WHERE o.tipo <> 'dia_habil_sin_fecha_valor'
  AND NOT EXISTS (SELECT 1 FROM bcv.observacion b WHERE b.tipo = o.tipo AND b.fecha_valor IS NOT DISTINCT FROM o.fecha_valor
                  AND b.moneda IS NOT DISTINCT FROM NULLIF(o.moneda, ''));

-- V6. Un día marcado sin publicación no puede tener fecha valor (coherencia tras cargas sucesivas)
DO $$
DECLARE c text;
BEGIN
    SELECT string_agg(d.fecha::text, ', ') INTO c FROM bcv.dia_sin_publicacion d JOIN bcv.publicacion p ON p.fecha_valor = d.fecha;
    IF c IS NOT NULL THEN RAISE EXCEPTION 'V6: días marcados sin publicación que sí tienen fecha valor: %', c; END IF;
    RAISE NOTICE 'Validaciones V1..V6 superadas';
END $$;

SELECT 'fuentes' AS tabla, count(*) FROM bcv.fuente
UNION ALL SELECT 'monedas', count(*) FROM bcv.moneda
UNION ALL SELECT 'publicaciones', count(*) FROM bcv.publicacion
UNION ALL SELECT 'tasas', count(*) FROM bcv.tasa
UNION ALL SELECT 'dias_sin_publicacion', count(*) FROM bcv.dia_sin_publicacion
UNION ALL SELECT 'observaciones', count(*) FROM bcv.observacion;
