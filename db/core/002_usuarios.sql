-- =============================================================================
-- El Renglón · Núcleo · Usuarios del panel, sesiones, solicitudes de API key y uso diario
-- Roles (resources/Admin.dc.html): super (acceso total), curador (catálogos IVA, arancel y calendario),
-- dev (sus propias API keys) y lectura (consulta y reportes).
-- Contraseñas con scrypt; sesiones en base de datos (el navegador solo guarda un token aleatorio y aquí
-- se guarda su SHA-256); secreto TOTP cifrado con AES-256-GCM (clave derivada de APP_SECRETO).
-- =============================================================================
CREATE TABLE IF NOT EXISTS core.usuario (
    id                   serial PRIMARY KEY,
    nombre               text NOT NULL CHECK (length(trim(nombre)) BETWEEN 2 AND 120),
    correo               text NOT NULL CHECK (correo ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    rol                  text NOT NULL CHECK (rol IN ('super', 'curador', 'dev', 'lectura')),
    clave_hash           text NOT NULL,
    debe_cambiar_clave   boolean NOT NULL DEFAULT true,     -- la clave inicial la asigna un administrador
    totp_secreto         text,                              -- cifrado; NULL si no configuró la verificación en dos pasos
    totp_activo          boolean NOT NULL DEFAULT false,
    activo               boolean NOT NULL DEFAULT true,
    intentos_fallidos    integer NOT NULL DEFAULT 0,
    bloqueado_hasta      timestamptz,
    creado_en            timestamptz NOT NULL DEFAULT now(),
    ultimo_acceso        timestamptz,
    notificaciones_vistas_en timestamptz NOT NULL DEFAULT now(),
    CHECK (NOT totp_activo OR totp_secreto IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS usuario_correo_idx ON core.usuario (lower(correo));

CREATE TABLE IF NOT EXISTS core.sesion (
    token_hash   char(64) PRIMARY KEY,
    usuario_id   integer NOT NULL REFERENCES core.usuario (id) ON DELETE CASCADE,
    creada_en    timestamptz NOT NULL DEFAULT now(),
    expira_en    timestamptz NOT NULL,
    ultimo_uso   timestamptz NOT NULL DEFAULT now(),
    agente       text
);
CREATE INDEX IF NOT EXISTS sesion_usuario_idx ON core.sesion (usuario_id);

-- Dueño de cada API key (NULL: creada por la CLI) y quién la solicitó
ALTER TABLE core.api_key ADD COLUMN IF NOT EXISTS usuario_id integer REFERENCES core.usuario (id) ON DELETE SET NULL;
ALTER TABLE core.api_key ADD COLUMN IF NOT EXISTS contacto text;

-- Solicitudes públicas de API key (formulario /solicitar-api-key); un administrador las aprueba o rechaza
CREATE TABLE IF NOT EXISTS core.solicitud_api_key (
    id            serial PRIMARY KEY,
    creada_en     timestamptz NOT NULL DEFAULT now(),
    nombre        text NOT NULL,
    correo        text NOT NULL,
    organizacion  text,
    uso           text NOT NULL,
    permisos      text[] NOT NULL CHECK (permisos <@ ARRAY['iva','bcv','arancel','calendario','rif'] AND cardinality(permisos) > 0),
    estado        text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    atendida_por  integer REFERENCES core.usuario (id) ON DELETE SET NULL,
    atendida_en   timestamptz,
    api_key_id    integer REFERENCES core.api_key (id) ON DELETE SET NULL
);

-- Consultas por día, API key y módulo (0 = herramientas públicas sin API key). Se acumulan en memoria y se
-- escriben cada 30 s: no guarda IP ni contenido de las consultas.
CREATE TABLE IF NOT EXISTS core.uso_diario (
    fecha       date    NOT NULL,
    api_key_id  integer NOT NULL,
    modulo      text    NOT NULL,
    consultas   integer NOT NULL DEFAULT 0,
    errores     integer NOT NULL DEFAULT 0,      -- respuestas 4xx y 5xx (incluye los 429)
    limitadas   integer NOT NULL DEFAULT 0,      -- respuestas 429 (límite por minuto)
    PRIMARY KEY (fecha, api_key_id, modulo)
);

CREATE INDEX IF NOT EXISTS auditoria_ocurrido_idx ON core.auditoria (ocurrido_en DESC);
