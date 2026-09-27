-- =============================================================================
-- El Renglón · Módulo Arancel · Carga de una semilla (base 2024 o vigente con reformas)
--
-- Se ejecuta con herramientas/arancel/cargar_arancel.sh, que pasa estas variables de psql:
--   __DIR__      (marcador) directorio de la semilla dentro del contenedor; lo reemplaza el script
--   esperado_*   conteos del manifiesto
--
-- Todo ocurre en UNA transacción (psql -1) con ON_ERROR_STOP: cualquier error o validación
-- fallida revierte la carga completa. Nada se inserta a medias.
-- =============================================================================
\set ON_ERROR_STOP on

-- La carga base reemplaza los datos existentes del módulo (dentro de la misma transacción).
TRUNCATE arancel.regla_interpretacion, arancel.abreviatura, arancel.conversion_unidad,
         arancel.cambio, arancel.observacion_fuente, arancel.subpartida, arancel.partida, arancel.capitulo,
         arancel.seccion, arancel.unidad_fisica, arancel.regimen_legal, arancel.version
         RESTART IDENTITY CASCADE;

-- ---------------------------------------------------------------- staging
CREATE TEMP TABLE s_version (instrumento text, gaceta text, fecha_publicacion date, fuente_archivo text,
    fuente_sha256 text, descripcion text) ON COMMIT DROP;
CREATE TEMP TABLE s_cambio (version text, articulo text, tipo text, codigo text, campo text, antes text, despues text) ON COMMIT DROP;
CREATE TEMP TABLE s_regla (orden smallint, tipo text, numero smallint, literal text, texto text, pagina_gaceta smallint) ON COMMIT DROP;
CREATE TEMP TABLE s_abreviatura (sigla text, significado text, pagina_gaceta smallint) ON COMMIT DROP;
CREATE TEMP TABLE s_conversion (orden smallint, magnitud text, unidad text, equivalencia numeric, unidad_equivalente text,
    equivalencia_texto text, nota text, pagina_gaceta smallint) ON COMMIT DROP;
CREATE TEMP TABLE s_seccion (numero smallint, romano text, titulo text, capitulo_desde char(2), capitulo_hasta char(2)) ON COMMIT DROP;
CREATE TEMP TABLE s_capitulo (codigo char(2), seccion smallint, titulo text, reservado boolean) ON COMMIT DROP;
CREATE TEMP TABLE s_partida (codigo char(4), capitulo char(2), descripcion text, origen_descripcion text) ON COMMIT DROP;
CREATE TEMP TABLE s_unidad (sigla text, nombre text, magnitud text) ON COMMIT DROP;
CREATE TEMP TABLE s_regimen (codigo smallint, descripcion text) ON COMMIT DROP;
CREATE TEMP TABLE s_subpartida (codigo text, codigo_formateado text, partida text, nivel smallint, padre text, orden int,
    descripcion text, es_terminal boolean, aec text, marca_aec text, exaec text, marca_exaec text,
    regimen_importacion text, regimen_exportacion text, unidad text, pagina smallint, version text) ON COMMIT DROP;
CREATE TEMP TABLE s_observacion (codigo text, tipo text, detalle text, valor_fuente text, version text) ON COMMIT DROP;

\copy s_version FROM '__DIR__/version.csv' CSV HEADER
\copy s_cambio FROM '__DIR__/cambio.csv' CSV HEADER
\copy s_regla FROM '__DIR__/regla_interpretacion.csv' CSV HEADER
\copy s_abreviatura FROM '__DIR__/abreviatura.csv' CSV HEADER
\copy s_conversion FROM '__DIR__/conversion_unidad.csv' CSV HEADER
\copy s_seccion FROM '__DIR__/seccion.csv' CSV HEADER
\copy s_capitulo FROM '__DIR__/capitulo.csv' CSV HEADER
\copy s_partida FROM '__DIR__/partida.csv' CSV HEADER
\copy s_unidad FROM '__DIR__/unidad_fisica.csv' CSV HEADER
\copy s_regimen FROM '__DIR__/regimen_legal.csv' CSV HEADER
\copy s_subpartida FROM '__DIR__/subpartida.csv' CSV HEADER
\copy s_observacion FROM '__DIR__/observacion_fuente.csv' CSV HEADER

-- ---------------------------------------------------------------- carga
INSERT INTO arancel.version (instrumento, gaceta, fecha_publicacion, descripcion, fuente_archivo, fuente_sha256)
SELECT instrumento, gaceta, fecha_publicacion, descripcion, fuente_archivo, fuente_sha256 FROM s_version;
INSERT INTO arancel.regla_interpretacion SELECT orden, tipo, numero, NULLIF(literal, ''), texto, pagina_gaceta FROM s_regla;
INSERT INTO arancel.abreviatura SELECT * FROM s_abreviatura;
INSERT INTO arancel.conversion_unidad SELECT orden, magnitud, unidad, equivalencia, unidad_equivalente, equivalencia_texto,
       NULLIF(nota, ''), pagina_gaceta FROM s_conversion;
INSERT INTO arancel.seccion SELECT * FROM s_seccion;
INSERT INTO arancel.capitulo SELECT * FROM s_capitulo;
INSERT INTO arancel.partida SELECT * FROM s_partida;
INSERT INTO arancel.unidad_fisica SELECT * FROM s_unidad;
INSERT INTO arancel.regimen_legal SELECT * FROM s_regimen;
INSERT INTO arancel.subpartida (codigo, codigo_formateado, partida, padre, nivel, orden, descripcion, es_terminal,
        aec, marca_aec, exaec, marca_exaec, regimen_importacion, regimen_exportacion, unidad, pagina_gaceta, version_id)
SELECT s.codigo, s.codigo_formateado, s.partida, NULLIF(s.padre, ''), s.nivel, s.orden, s.descripcion, s.es_terminal,
       NULLIF(s.aec, '')::numeric, NULLIF(s.marca_aec, ''), NULLIF(s.exaec, '')::numeric, NULLIF(s.marca_exaec, ''),
       COALESCE(string_to_array(NULLIF(s.regimen_importacion, ''), ',')::smallint[], '{}'),
       COALESCE(string_to_array(NULLIF(s.regimen_exportacion, ''), ',')::smallint[], '{}'),
       NULLIF(s.unidad, ''), COALESCE(s.pagina, 0), v.id
FROM s_subpartida s JOIN arancel.version v ON v.gaceta = s.version;
INSERT INTO arancel.observacion_fuente (codigo, tipo, detalle, valor_fuente, version_id)
SELECT o.codigo, o.tipo, COALESCE(o.detalle, ''), COALESCE(o.valor_fuente, ''), v.id
FROM s_observacion o JOIN arancel.version v ON v.gaceta = o.version;
INSERT INTO arancel.cambio (version_id, articulo, tipo, codigo, campo, antes, despues)
SELECT v.id, c.articulo, c.tipo, c.codigo, COALESCE(c.campo, ''), COALESCE(c.antes, ''), COALESCE(c.despues, '')
FROM s_cambio c JOIN arancel.version v ON v.gaceta = c.version;

-- ---------------------------------------------------------------- validaciones (abortan la carga)
SELECT set_config('renglon.esp_sec', :'esperado_secciones', true), set_config('renglon.esp_cap', :'esperado_capitulos', true),
       set_config('renglon.esp_par', :'esperado_partidas', true), set_config('renglon.esp_sub', :'esperado_subpartidas', true),
       set_config('renglon.esp_ter', :'esperado_terminales', true);

DO $$
DECLARE
    n bigint;
    faltan text;
BEGIN
    -- V0. Nada se pierde al resolver versiones (cada fila apunta a una versión cargada)
    IF (SELECT count(*) FROM arancel.subpartida) <> (SELECT count(*) FROM s_subpartida) THEN RAISE EXCEPTION 'V0: subpartidas con versión desconocida'; END IF;
    IF (SELECT count(*) FROM arancel.observacion_fuente) <> (SELECT count(*) FROM s_observacion) THEN RAISE EXCEPTION 'V0: observaciones con versión desconocida'; END IF;
    IF (SELECT count(*) FROM arancel.cambio) <> (SELECT count(*) FROM s_cambio) THEN RAISE EXCEPTION 'V0: cambios con versión desconocida'; END IF;

    -- V1. Conteos iguales al manifiesto de extracción
    IF (SELECT count(*) FROM arancel.seccion)    <> current_setting('renglon.esp_sec')::int THEN RAISE EXCEPTION 'V1: secciones no coinciden con el manifiesto'; END IF;
    IF (SELECT count(*) FROM arancel.capitulo)   <> current_setting('renglon.esp_cap')::int THEN RAISE EXCEPTION 'V1: capítulos no coinciden con el manifiesto'; END IF;
    IF (SELECT count(*) FROM arancel.partida)    <> current_setting('renglon.esp_par')::int THEN RAISE EXCEPTION 'V1: partidas no coinciden con el manifiesto'; END IF;
    IF (SELECT count(*) FROM arancel.subpartida) <> current_setting('renglon.esp_sub')::int THEN RAISE EXCEPTION 'V1: subpartidas no coinciden con el manifiesto'; END IF;
    IF (SELECT count(*) FROM arancel.subpartida WHERE es_terminal) <> current_setting('renglon.esp_ter')::int THEN RAISE EXCEPTION 'V1: terminales no coinciden con el manifiesto'; END IF;

    -- V2. Cada capítulo cae dentro del rango de su sección (Sistema Armonizado)
    SELECT string_agg(c.codigo, ', ') INTO faltan FROM arancel.capitulo c JOIN arancel.seccion s ON s.numero = c.seccion
     WHERE c.codigo NOT BETWEEN s.capitulo_desde AND s.capitulo_hasta;
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V2: capítulos fuera del rango de su sección: %', faltan; END IF;

    -- V3. Toda partida tiene al menos una subpartida; todo capítulo no reservado tiene partidas
    SELECT string_agg(p.codigo, ', ') INTO faltan FROM arancel.partida p
     WHERE NOT EXISTS (SELECT 1 FROM arancel.subpartida s WHERE s.partida = p.codigo);
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V3: partidas sin subpartidas: %', faltan; END IF;
    SELECT string_agg(c.codigo, ', ') INTO faltan FROM arancel.capitulo c
     WHERE NOT c.reservado AND NOT EXISTS (SELECT 1 FROM arancel.partida p WHERE p.capitulo = c.codigo);
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V3: capítulos sin partidas: %', faltan; END IF;

    -- V4. Terminal = sin hijos; agrupación = con hijos
    SELECT count(*) INTO n FROM arancel.subpartida s
     WHERE s.es_terminal = EXISTS (SELECT 1 FROM arancel.subpartida h WHERE h.padre = s.codigo);
    IF n > 0 THEN RAISE EXCEPTION 'V4: % nodos con es_terminal incoherente con sus hijos', n; END IF;

    -- V5. Terminales sin AEC o sin unidad: SOLO los registrados como vacíos de la fuente
    SELECT string_agg(codigo, ', ') INTO faltan FROM arancel.subpartida s WHERE es_terminal AND aec IS NULL
       AND NOT EXISTS (SELECT 1 FROM arancel.observacion_fuente o WHERE o.codigo = s.codigo AND o.tipo LIKE 'terminal_sin_aec%');
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V5: terminales sin AEC no documentados: %', faltan; END IF;
    SELECT string_agg(codigo, ', ') INTO faltan FROM arancel.subpartida s WHERE es_terminal AND unidad IS NULL
       AND NOT EXISTS (SELECT 1 FROM arancel.observacion_fuente o WHERE o.codigo = s.codigo AND o.tipo LIKE 'terminal_sin_unidad%');
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V5: terminales sin unidad no documentados: %', faltan; END IF;

    -- V6. El texto original usa AEC y Ex-AEC de 0 a 40 %. Un valor mayor solo se acepta si lo introdujo
    --     una reforma y consta en el registro de cambios (p. ej. azúcar 1701: Ex-AEC 98E, Decreto N° 5.198)
    SELECT string_agg(s.codigo, ', ') INTO faltan FROM arancel.subpartida s
     WHERE (s.aec > 40 AND NOT EXISTS (SELECT 1 FROM arancel.cambio c WHERE c.codigo = s.codigo AND c.campo = 'aec'))
        OR (s.exaec > 40 AND NOT EXISTS (SELECT 1 FROM arancel.cambio c WHERE c.codigo = s.codigo AND c.campo = 'exaec'));
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V6: tarifas > 40 %% sin respaldo de una reforma: %', faltan; END IF;

    -- V7. Sin texto de página de la Gaceta colado en descripciones
    SELECT string_agg(codigo, ', ') INTO faltan FROM arancel.subpartida
     WHERE descripcion ~* 'GACETA OFICIAL|Extraordinario|REPÚBLICA BOLIVARIANA';
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V7: descripciones con texto de página: %', faltan; END IF;
    SELECT string_agg(codigo, ', ') INTO faltan FROM arancel.partida
     WHERE descripcion ~* 'GACETA OFICIAL|Extraordinario';
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V7: partidas con texto de página: %', faltan; END IF;

    -- V8. Descripciones no vacías y sin columnas de tarifa coladas al final (p. ej. "... 14BK u")
    SELECT string_agg(codigo, ', ') INTO faltan FROM arancel.subpartida
     WHERE length(trim(descripcion)) < 2
        OR descripcion ~ '\m\d{1,2}(BK|BIT)\M'                                   -- marca de tarifa suelta
        OR descripcion ~ '\s\d{1,2}(BK|BIT)?(\s+[\d,]+[EA]?){1,3}\s+(kg|u|m²|m³|l)$';  -- AEC + régimen + unidad
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V8: descripciones vacías o con columnas coladas: %', faltan; END IF;

    -- V9. Ningún código duplicado entre partida y subpartida de otro capítulo (coherencia de prefijos)
    SELECT count(*) INTO n FROM arancel.subpartida s JOIN arancel.partida p ON p.codigo = s.partida
     WHERE left(s.codigo, 2) <> p.capitulo;
    IF n > 0 THEN RAISE EXCEPTION 'V9: % subpartidas con capítulo incoherente', n; END IF;

    -- V10. Coherencia del historial: según el ÚLTIMO cambio de cada código (en orden de publicación),
    --      un código eliminado no existe y uno creado o modificado sí existe.
    WITH ultimo AS (
        SELECT DISTINCT ON (c.codigo) c.codigo, c.tipo
        FROM arancel.cambio c JOIN arancel.version v ON v.id = c.version_id
        WHERE c.tipo IN ('crea', 'modifica', 'exaec', 'regimen', 'elimina')
        ORDER BY c.codigo, v.fecha_publicacion DESC, c.id DESC)
    SELECT string_agg(u.codigo || ' (' || u.tipo || ')', ', ') INTO faltan FROM ultimo u
     WHERE (u.tipo = 'elimina') = EXISTS (SELECT 1 FROM arancel.subpartida s WHERE s.codigo = u.codigo);
    IF faltan IS NOT NULL THEN RAISE EXCEPTION 'V10: historial incoherente con el árbol vigente: %', faltan; END IF;

    -- V11. Preliminares del art. 37 completos: RGI 1..6 y complementarias 1..2; unidades equivalentes
    --      del catálogo oficial o del SI usado por la Gaceta
    IF (SELECT count(DISTINCT numero) FROM arancel.regla_interpretacion WHERE tipo = 'general' AND numero > 0) <> 6
       OR (SELECT count(*) FROM arancel.regla_interpretacion WHERE tipo = 'complementaria') <> 2
       OR (SELECT count(*) FROM arancel.abreviatura) = 0 OR (SELECT count(*) FROM arancel.conversion_unidad) = 0 THEN
        RAISE EXCEPTION 'V11: preliminares del art. 37 incompletos';
    END IF;

    RAISE NOTICE 'Validaciones V0..V11 superadas';
END $$;

SELECT 'secciones' AS tabla, count(*) FROM arancel.seccion
UNION ALL SELECT 'capitulos', count(*) FROM arancel.capitulo
UNION ALL SELECT 'partidas', count(*) FROM arancel.partida
UNION ALL SELECT 'subpartidas', count(*) FROM arancel.subpartida
UNION ALL SELECT 'terminales', count(*) FROM arancel.subpartida WHERE es_terminal
UNION ALL SELECT 'observaciones_fuente', count(*) FROM arancel.observacion_fuente
UNION ALL SELECT 'cambios', count(*) FROM arancel.cambio
UNION ALL SELECT 'versiones', count(*) FROM arancel.version
UNION ALL SELECT 'reglas_interpretacion', count(*) FROM arancel.regla_interpretacion
UNION ALL SELECT 'abreviaturas', count(*) FROM arancel.abreviatura
UNION ALL SELECT 'conversiones', count(*) FROM arancel.conversion_unidad;
