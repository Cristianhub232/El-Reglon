-- =============================================================================
-- El Renglón · Metabase · Roles y base interna
-- metabase          dueño de la base "metabase", donde Metabase guarda preguntas, tableros y usuarios.
-- metabase_lectura  lee los datos de El Renglón: solo SELECT y sesiones de solo lectura, sobre TODOS los
--                   esquemas y tablas (03/10/2026). Correr después de herramientas/instalar_bd.sh.
-- Idempotente. Las contraseñas llegan como variables de psql (nunca en el repositorio):
--   psql -v clave_metabase=... -v clave_lectura=... -v bd=elrenglon -v dueno=elrenglon -f 001_roles.sql
-- Uso normal: herramientas/instalar_metabase.sh
-- =============================================================================
SELECT format('CREATE ROLE metabase LOGIN PASSWORD %L', :'clave_metabase')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase') \gexec
ALTER ROLE metabase PASSWORD :'clave_metabase';

SELECT 'CREATE DATABASE metabase OWNER metabase'
 WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'metabase') \gexec

SELECT format('CREATE ROLE metabase_lectura LOGIN PASSWORD %L', :'clave_lectura')
 WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') \gexec
ALTER ROLE metabase_lectura PASSWORD :'clave_lectura';
ALTER ROLE metabase_lectura SET default_transaction_read_only = on;
ALTER ROLE metabase_lectura SET statement_timeout = '120s';

REVOKE CREATE ON SCHEMA public FROM metabase_lectura;
GRANT CONNECT ON DATABASE :"bd" TO metabase_lectura;
-- Lectura COMPLETA de todos los esquemas y tablas, incluidas las futuras (decisión del responsable, 03/10/2026).
-- Incluye datos personales y secretos en hash; si Metabase se abre a otras personas, restringirlo (docs/19 §4).
DO $$
DECLARE e text;
BEGIN
  FOR e IN SELECT nspname FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname <> 'information_schema' LOOP
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO metabase_lectura', e);
    EXECUTE format('GRANT SELECT ON ALL TABLES IN SCHEMA %I TO metabase_lectura', e);
    EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT ON TABLES TO metabase_lectura', current_user, e);
  END LOOP;
END $$;
