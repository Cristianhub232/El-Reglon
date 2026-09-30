-- =============================================================================
-- El Renglón · Módulo IVA · Artículos que el clasificador no encontró (estado no_determinado)
-- Registra qué se consultó y desde dónde, para completar el catálogo (curaduría). Lo aplica el cargador del catálogo.
-- =============================================================================
CREATE TABLE IF NOT EXISTS iva.articulo_no_encontrado (
    id                  bigserial PRIMARY KEY,
    consultado_en       timestamptz NOT NULL DEFAULT now(),
    -- Qué se consultó
    texto               text,                          -- nombre tal como lo escribió el usuario
    texto_normalizado   text,                          -- minúsculas y sin acentos, para agrupar consultas iguales
    codigos             text[] NOT NULL DEFAULT '{}',  -- códigos de barras, ISBN, SKU… enviados
    tipos_codigo        text[] NOT NULL DEFAULT '{}',  -- tipo detectado de cada código (EAN-13, SKU…)
    codigo_arancelario  varchar(10),
    producto_off        text,                          -- nombre del producto si Open Food Facts lo identificó
    operacion           text NOT NULL CHECK (operacion IN ('nacional', 'importacion')),
    tipo                text CHECK (tipo IN ('bien', 'servicio')),
    fecha_operacion     date,
    -- Desde dónde
    canal               text NOT NULL CHECK (canal IN ('api', 'web')),   -- API con API key o herramienta pública del sitio
    api_key_id          integer,                       -- quién (consultas por la API)
    ip                  inet,                          -- IP del cliente (solo detrás del proxy, TRUST_PROXY=1)
    ubicacion           text,                          -- estado o ciudad declarada en la consulta (opcional)
    agente              text,                          -- navegador o cliente HTTP
    -- Curaduría
    revisado            boolean NOT NULL DEFAULT false,
    revisado_por        text,
    revisado_en         timestamptz,
    regla_asignada      text,                          -- regla del catálogo a la que corresponde (si se decidió)
    nota                text
);
CREATE INDEX IF NOT EXISTS articulo_no_encontrado_pendiente_idx ON iva.articulo_no_encontrado (revisado, consultado_en DESC);
CREATE INDEX IF NOT EXISTS articulo_no_encontrado_texto_idx ON iva.articulo_no_encontrado (texto_normalizado);
