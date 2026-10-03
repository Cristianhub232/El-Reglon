-- =============================================================================
-- El Renglón · Directorio de contribuyentes · Carga de la semilla (una transacción; ON_ERROR_STOP)
-- __DIR__ lo reemplaza herramientas/directorio/cargar_directorio.sh. Reemplaza todo el directorio.
-- =============================================================================
\set ON_ERROR_STOP on

TRUNCATE directorio.pago_region, directorio.pagador, directorio.software, directorio.importador, directorio.direccion, directorio.contribuyente RESTART IDENTITY;

CREATE TEMP TABLE s_contribuyente (rif text, razon_social text, correo text, ult_periodo_islr text, ult_periodo_iva text,
    venc_certificado text, fuentes text[]) ON COMMIT DROP;
CREATE TEMP TABLE s_direccion (rif text, vialidad text, sector text, edificacion text, local text, telefono text,
    telefono_2 text, correo text, web text) ON COMMIT DROP;
CREATE TEMP TABLE s_importador (rif text, nombres text[], cif_usd numeric, cif_bs numeric, registros int) ON COMMIT DROP;
CREATE TEMP TABLE s_software (id int, rif text, empresa text, sistema text, version text, medios text[], categoria text,
    descripcion text, fecha_lanzamiento text, modalidad text, pdf_archivo text) ON COMMIT DROP;
CREATE TEMP TABLE s_pagador (rif text, nombre text, id_fuente bigint, monto numeric, regiones smallint) ON COMMIT DROP;
CREATE TEMP TABLE s_pago_region (rif text, region text, monto numeric) ON COMMIT DROP;
\copy s_contribuyente FROM '__DIR__/contribuyente.csv' CSV HEADER
\copy s_direccion FROM '__DIR__/direccion.csv' CSV HEADER
\copy s_importador FROM '__DIR__/importador.csv' CSV HEADER
\copy s_software FROM '__DIR__/software.csv' CSV HEADER
\copy s_pagador FROM '__DIR__/pagador.csv' CSV HEADER
\copy s_pago_region FROM '__DIR__/pago_region.csv' CSV HEADER

INSERT INTO directorio.contribuyente (rif, razon_social, correo, ult_periodo_islr, ult_periodo_iva, venc_certificado, rif_valido, fuentes)
SELECT s.rif, s.razon_social, NULLIF(s.correo, ''), NULLIF(s.ult_periodo_islr, ''), NULLIF(s.ult_periodo_iva, ''),
       NULLIF(s.venc_certificado, '')::date, coalesce((SELECT v.valido FROM rif.validar(s.rif) v), false), s.fuentes
  FROM s_contribuyente s;
INSERT INTO directorio.direccion (rif, vialidad, sector, edificacion, local, telefono, telefono_2, correo, web)
SELECT rif, NULLIF(vialidad, ''), NULLIF(sector, ''), NULLIF(edificacion, ''), NULLIF(local, ''), NULLIF(telefono, ''),
       NULLIF(telefono_2, ''), NULLIF(correo, ''), NULLIF(web, '') FROM s_direccion;
INSERT INTO directorio.importador SELECT * FROM s_importador;
INSERT INTO directorio.software SELECT id, rif, empresa, sistema, version, medios, categoria, NULLIF(descripcion, ''),
       NULLIF(fecha_lanzamiento, '')::date, modalidad, NULLIF(pdf_archivo, '') FROM s_software;

INSERT INTO directorio.pagador (rif, nombre, id_fuente, monto, puesto, regiones, especial, rif_valido)
SELECT p.rif, NULLIF(p.nombre, ''), p.id_fuente, p.monto, rank() OVER (ORDER BY p.monto DESC)::int, p.regiones,
       EXISTS (SELECT 1 FROM s_pago_region r WHERE r.rif = p.rif AND r.region = 'Región de Contribuyentes Especiales'),
       coalesce((SELECT v.valido FROM rif.validar(p.rif) v), false)
  FROM s_pagador p;
INSERT INTO directorio.pago_region SELECT rif, NULLIF(region, ''), monto FROM s_pago_region;

SELECT set_config('renglon.esp_pag', :'esperado_pagadores', true), set_config('renglon.esp_pre', :'esperado_pagos_region', true);
SELECT set_config('renglon.esp_con', :'esperado_contribuyentes', true), set_config('renglon.esp_dir', :'esperado_direcciones', true),
       set_config('renglon.esp_imp', :'esperado_importadores', true), set_config('renglon.esp_sof', :'esperado_software', true);

DO $$
DECLARE n bigint;
BEGIN
    -- V1. Conteos del manifiesto
    IF (SELECT count(*) FROM directorio.contribuyente) <> current_setting('renglon.esp_con')::int
       OR (SELECT count(*) FROM directorio.direccion) <> current_setting('renglon.esp_dir')::int
       OR (SELECT count(*) FROM directorio.importador) <> current_setting('renglon.esp_imp')::int
       OR (SELECT count(*) FROM directorio.software) <> current_setting('renglon.esp_sof')::int THEN
        RAISE EXCEPTION 'V1: conteos distintos al manifiesto';
    END IF;
    IF (SELECT count(*) FROM directorio.pagador) <> current_setting('renglon.esp_pag')::int
       OR (SELECT count(*) FROM directorio.pago_region) <> current_setting('renglon.esp_pre')::int THEN
        RAISE EXCEPTION 'V1: conteos de pagadores distintos al manifiesto';
    END IF;
    -- V2. Sin direcciones repetidas por RIF
    SELECT count(*) INTO n FROM (SELECT 1 FROM directorio.direccion
        GROUP BY rif, upper(coalesce(vialidad, '')), upper(coalesce(sector, '')), upper(coalesce(edificacion, '')), upper(coalesce(local, '')),
                 coalesce(telefono, ''), coalesce(telefono_2, '') HAVING count(*) > 1) d;
    IF n > 0 THEN RAISE EXCEPTION 'V2: % direcciones repetidas', n; END IF;
    -- V3. Cada contribuyente viene de al menos una fuente y tiene su fila en ella
    SELECT count(*) INTO n FROM directorio.contribuyente c
     WHERE ('importadores' = ANY (c.fuentes)) <> EXISTS (SELECT 1 FROM directorio.importador i WHERE i.rif = c.rif)
        OR ('software' = ANY (c.fuentes)) <> EXISTS (SELECT 1 FROM directorio.software s WHERE s.rif = c.rif);
    IF n > 0 THEN RAISE EXCEPTION 'V3: % contribuyentes sin su fila de origen', n; END IF;
    -- V4. El total de cada pagador es la suma de sus regiones
    SELECT count(*) INTO n FROM directorio.pagador p
     WHERE p.monto <> (SELECT sum(r.monto) FROM directorio.pago_region r WHERE r.rif = p.rif)
        OR p.regiones <> (SELECT count(*) FROM directorio.pago_region r WHERE r.rif = p.rif);
    IF n > 0 THEN RAISE EXCEPTION 'V4: % pagadores no cuadran con su desglose por región', n; END IF;
    RAISE NOTICE 'Validaciones V1-V4 superadas';
END $$;

SELECT count(*) FILTER (WHERE NOT rif_valido) AS rif_con_digito_incorrecto, count(*) AS contribuyentes FROM directorio.contribuyente;
SELECT count(*) FILTER (WHERE NOT rif_valido) AS rif_con_digito_incorrecto, count(*) FILTER (WHERE especial) AS especiales,
       count(*) AS pagadores FROM directorio.pagador;
