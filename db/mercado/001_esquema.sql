-- Tasa de mercado USDT/VES (docs/28): referencia NO oficial, junto a la tasa BCV. Binance P2P leída por la API pública
-- de CriptoYa cada 30 minutos (noticias-programador). compra = lo que se paga por 1 USDT; venta = lo que se recibe.
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS mercado;

CREATE TABLE IF NOT EXISTS mercado.tasa_p2p (
    id           bigserial     PRIMARY KEY,
    plataforma   text          NOT NULL CHECK (plataforma IN ('binancep2p')),
    activo       text          NOT NULL DEFAULT 'USDT' CHECK (activo = 'USDT'),
    fiat         text          NOT NULL DEFAULT 'VES' CHECK (fiat = 'VES'),
    compra       numeric(14,4) NOT NULL CHECK (compra > 0),
    venta        numeric(14,4) NOT NULL CHECK (venta > 0),
    promedio     numeric(14,4) GENERATED ALWAYS AS (round((compra + venta) / 2, 4)) STORED,
    fuente       text          NOT NULL DEFAULT 'criptoya',
    publicada_en timestamptz   NOT NULL,                        -- hora del dato en la fuente
    leida_en     timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (plataforma, publicada_en)
);
CREATE INDEX IF NOT EXISTS tasa_p2p_reciente ON mercado.tasa_p2p (plataforma, leida_en DESC);

-- Se conservan 400 días (gráfica de la brecha a un año)
CREATE OR REPLACE FUNCTION mercado.purgar() RETURNS int LANGUAGE sql AS $$
  WITH d AS (DELETE FROM mercado.tasa_p2p WHERE leida_en < now() - interval '400 days' RETURNING 1) SELECT count(*)::int FROM d
$$;

DO $$ BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'metabase_lectura') THEN
    GRANT USAGE ON SCHEMA mercado TO metabase_lectura;
    GRANT SELECT ON ALL TABLES IN SCHEMA mercado TO metabase_lectura;
  END IF;
END $$;
