-- Análisis de calidad de la semilla de Rep-Arancel (PostgreSQL 16).
-- Uso:
--   python3 extraer_semilla.py <ruta Rep-Arancel> <dir_csv>
--   pdftotext -layout <Rep-Arancel>/docs/Arancel_24-04-25.pdf arancel.txt
--   python3 referencia_pdf.py arancel.txt <dir_csv>/referencia_pdf.csv
--   psql -v ON_ERROR_STOP=1 -f consultas_calidad.sql   (con <dir_csv> montado en /datos)

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE SCHEMA IF NOT EXISTS stg;
CREATE TABLE stg.unidad_fisica(archivo text, orden int, id_unidad int, nombre text, sigla text);
CREATE TABLE stg.regimen_legal(archivo text, orden int, codigo_regimen int, descripcion text);
CREATE TABLE stg.tarifa(archivo text, orden int, codigo_aec text, codigo_exaec text, fk_subpartida int, valor_numerico_aec numeric);
CREATE TABLE stg.sub_regimen(archivo text, orden int, fk_regimen int, fk_subpartida int);
CREATE TABLE stg.seccion(archivo text, orden int, numero_romano text, titulo text);
CREATE TABLE stg.capitulo(archivo text, orden int, codigo text, descripcion text, fk_seccion int);
CREATE TABLE stg.partida(archivo text, orden int, codigo text, descripcion text, fk_capitulo int);
CREATE TABLE stg.subpartida(archivo text, orden int, codigo text, descripcion text, es_terminal int, fk_partida int, fk_padre int, fk_unidad int, id int);
CREATE TABLE stg.nota(archivo text, orden int, contenido text, fk_capitulo int, fk_partida int, fk_seccion int, fk_subpartida int, tipo text);
CREATE TABLE stg.desactivar(archivo text, orden int, codigo text);
CREATE TABLE stg.ref(codigo text, descripcion text, aec text, unidad text, otros text);
\copy stg.unidad_fisica FROM '/datos/unidad_fisica.csv' CSV HEADER
\copy stg.regimen_legal FROM '/datos/regimen_legal.csv' CSV HEADER
\copy stg.tarifa FROM '/datos/tarifa_ad_valorem.csv' CSV HEADER
\copy stg.sub_regimen FROM '/datos/subpartida_regimen.csv' CSV HEADER
\copy stg.seccion FROM '/datos/seccion.csv' CSV HEADER
\copy stg.capitulo FROM '/datos/capitulo.csv' CSV HEADER
\copy stg.partida FROM '/datos/partida.csv' CSV HEADER
\copy stg.subpartida FROM '/datos/subpartida.csv' CSV HEADER
\copy stg.nota FROM '/datos/nota_legal.csv' CSV HEADER
\copy stg.desactivar FROM '/datos/desactivar.csv' CSV HEADER
\copy stg.ref FROM '/datos/referencia_pdf.csv' CSV HEADER
-- En la semilla, los IDs de sección/capítulo/partida son implícitos (orden de inserción).
CREATE VIEW stg.seccion_id  AS SELECT orden AS id, * FROM stg.seccion;
CREATE VIEW stg.capitulo_id AS SELECT orden AS id, * FROM stg.capitulo;
CREATE VIEW stg.partida_id  AS SELECT orden AS id, * FROM stg.partida;
CREATE VIEW stg.sub08 AS SELECT * FROM stg.subpartida WHERE archivo='dml_08_subpartida_final.sql';
CREATE VIEW stg.ref1  AS SELECT DISTINCT ON (codigo) * FROM stg.ref ORDER BY codigo, (aec IS NULL);

\echo 'D1: IDs de dml_10 que chocan con dml_08'
SELECT count(*) FILTER (WHERE a.codigo<>b.codigo) FROM stg.subpartida a JOIN stg.subpartida b ON a.id=b.id
 AND a.archivo='dml_08_subpartida_final.sql' AND b.archivo='dml_10_subpartida_faltantes.sql';
\echo 'D2/D3: exactitud del AEC por archivo vs Gaceta'
SELECT t.archivo, count(*) comparables,
 round(100.0*count(*) FILTER (WHERE replace(t.codigo_aec,',','.')=replace(r.aec,',','.'))/count(*),1) pct_coincide
FROM stg.tarifa t JOIN stg.sub08 s ON s.id=t.fk_subpartida JOIN stg.ref1 r ON r.codigo=s.codigo
WHERE r.aec IS NOT NULL GROUP BY 1 ORDER BY 1;
\echo 'D4: subpartidas con tarifas en conflicto'
SELECT count(*) FROM (SELECT fk_subpartida FROM stg.tarifa GROUP BY 1
 HAVING count(DISTINCT coalesce(codigo_aec,'')||'/'||coalesce(codigo_exaec,''))>1) x;
\echo 'D5: tarifas > 40 %'
SELECT archivo, count(*) FROM stg.tarifa WHERE valor_numerico_aec>40 GROUP BY 1;
\echo 'D6: subpartidas enlazadas a una partida con otro código'
SELECT count(*) FROM stg.sub08 s JOIN stg.partida_id p ON p.id=s.fk_partida WHERE replace(p.codigo,'.','')<>left(s.codigo,4);
\echo 'D7: capítulo -> sección'
SELECT c.codigo, s.numero_romano FROM stg.capitulo_id c JOIN stg.seccion_id s ON s.id=c.fk_seccion WHERE c.codigo IN ('44','45','46');
\echo 'D8: códigos duplicados'
SELECT count(*) FROM (SELECT codigo FROM stg.sub08 GROUP BY 1 HAVING count(*)>1) x;
\echo 'D9: descripciones truncadas'
SELECT count(*) FROM stg.sub08 WHERE descripcion ~* '\s(a|de|del|o|y|en|con|por|para|igual a|superior|inferior|que|la|el|los|las|sin|,)\s*$';
\echo 'D11: unidad oficial vs semilla'
SELECT r.unidad oficial, coalesce(u.sigla,'(NULL)') semilla, count(*) FROM stg.sub08 s JOIN stg.ref1 r ON r.codigo=s.codigo
 LEFT JOIN stg.unidad_fisica u ON u.id_unidad=s.fk_unidad WHERE s.es_terminal=1 GROUP BY 1,2 ORDER BY 1,3 DESC;
\echo 'D12: terminales con régimen en la Gaceta sin régimen en la semilla'
SELECT count(*) FROM stg.sub08 s JOIN stg.ref1 r ON r.codigo=s.codigo WHERE r.otros ~ '^\d'
 AND NOT EXISTS (SELECT 1 FROM stg.sub_regimen sr WHERE sr.fk_subpartida=s.id AND sr.archivo<>'dml_04_subpartida_regimen.sql');
\echo 'D14: notas con encabezado de página'
SELECT count(*) FROM stg.nota WHERE contenido ~* 'GACETA OFICIAL|Extraordinario';
\echo 'Cobertura de códigos oficiales'
SELECT count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM stg.sub08 s WHERE s.codigo=r.codigo)) faltan FROM stg.ref1 r;
