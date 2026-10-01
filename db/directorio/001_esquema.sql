-- Directorio de contribuyentes (docs/25): empresas y personas con su contacto, importadores con su CIF y sistemas de
-- facturación declarados. Datos personales (RIF V y E, correos, teléfonos): solo el superadministrador; Metabase no
-- los ve. La semilla se genera con herramientas/directorio/sanear_directorio.py y no va al repositorio.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS directorio;

CREATE TABLE IF NOT EXISTS directorio.contribuyente (
    rif              text        PRIMARY KEY CHECK (rif ~ '^[VEJPGC]-\d{8}-\d$'),
    razon_social     text        NOT NULL,
    correo           text,
    ult_periodo_islr char(6)     CHECK (ult_periodo_islr ~ '^\d{4}(0[1-9]|1[0-2])$'),   -- último período declarado (AAAAMM)
    ult_periodo_iva  char(6)     CHECK (ult_periodo_iva ~ '^\d{4}(0[1-9]|1[0-2])$'),
    venc_certificado date,                                           -- vencimiento del certificado del RIF
    rif_valido       boolean     NOT NULL,                           -- dígito verificador correcto (rif.validar)
    terminal         smallint    GENERATED ALWAYS AS (right(rif, 1)::smallint) STORED,
    fuentes          text[]      NOT NULL CHECK (fuentes <@ ARRAY['importadores', 'software']),
    cargado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS contribuyente_razon_trgm ON directorio.contribuyente USING gin (razon_social gin_trgm_ops);

-- Direcciones y teléfonos (una empresa con sucursales tiene varias); sin repetir
CREATE TABLE IF NOT EXISTS directorio.direccion (
    id          bigserial PRIMARY KEY,
    rif         text      NOT NULL REFERENCES directorio.contribuyente (rif) ON DELETE CASCADE,
    vialidad    text,
    sector      text,
    edificacion text,
    local       text,
    telefono    text      CHECK (telefono ~ '^0\d{3}-\d{7}$'),
    telefono_2  text      CHECK (telefono_2 ~ '^0\d{3}-\d{7}$'),
    correo      text,
    web         text
);
CREATE INDEX IF NOT EXISTS direccion_rif ON directorio.direccion (rif);

-- Importadores: CIF total (dólares y bolívares, según la fuente); "nombres" son los nombres declarados como consignatario
CREATE TABLE IF NOT EXISTS directorio.importador (
    rif       text          PRIMARY KEY REFERENCES directorio.contribuyente (rif) ON DELETE CASCADE,
    nombres   text[]        NOT NULL,
    cif_usd   numeric(18,2) NOT NULL CHECK (cif_usd >= 0),
    cif_bs    numeric(20,2) NOT NULL CHECK (cif_bs >= 0),
    registros int           NOT NULL CHECK (registros >= 1)          -- filas de la fuente que se unieron
);
CREATE INDEX IF NOT EXISTS importador_cif ON directorio.importador (cif_usd DESC);

-- Sistemas de facturación declarados por cada empresa (id de la fuente)
CREATE TABLE IF NOT EXISTS directorio.software (
    id                int     PRIMARY KEY,
    rif               text    NOT NULL REFERENCES directorio.contribuyente (rif) ON DELETE CASCADE,
    empresa           text    NOT NULL,                              -- nombre declarado en el registro del sistema
    sistema           text    NOT NULL,
    version           text    NOT NULL,
    medios            text[]  NOT NULL DEFAULT '{}' CHECK (medios <@ ARRAY['Forma libre', 'Imprenta digital', 'Máquina fiscal']),
    categoria         text    NOT NULL,
    descripcion       text,
    fecha_lanzamiento date,
    modalidad         text    NOT NULL CHECK (modalidad IN ('exclusivo', 'distribuido')),
    pdf_archivo       text,
    UNIQUE (rif, sistema, version)
);
CREATE INDEX IF NOT EXISTS software_rif ON directorio.software (rif);
