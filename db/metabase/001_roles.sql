-- =============================================================================
-- El Renglón · Metabase · Roles y base interna
-- metabase          dueño de la base "metabase", donde Metabase guarda preguntas, tableros y usuarios.
-- metabase_lectura  lee los datos de El Renglón: solo SELECT y sesiones de solo lectura. No ve
--                   core.usuario, core.sesion ni core.api_key (hashes de contraseñas, secretos TOTP,
--                   sesiones y claves de API).
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
GRANT USAGE ON SCHEMA arancel, bcv, calendario, iva, rif, core TO metabase_lectura;
GRANT SELECT ON ALL TABLES IN SCHEMA arancel, bcv, calendario, iva, rif TO metabase_lectura;
-- Tablas que se creen después en esos esquemas (los cargadores corren como el dueño de la base)
ALTER DEFAULT PRIVILEGES FOR ROLE :"dueno" IN SCHEMA arancel, bcv, calendario, iva, rif
  GRANT SELECT ON TABLES TO metabase_lectura;
-- core: solo tablas sin secretos
GRANT SELECT ON core.auditoria, core.uso_diario, core.solicitud_api_key TO metabase_lectura;
