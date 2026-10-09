// Tasa de mercado USDT/VES (docs/28): referencia NO oficial que se muestra junto a la tasa BCV. Binance P2P por la API
// pública de CriptoYa (su robots.txt lo permite; la API interna de Binance, /bapi/, la prohíbe el suyo y no se usa).
// Se lee cada 30 minutos (noticias-programador); el sitio y la API sirven la última lectura guardada.
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";

const FUENTE = "https://criptoya.com/api/binancep2p/USDT/VES/1";
const AGENTE = "ElRenglon/0.1 (+https://elrenglonve.org; tasas de referencia)";

export interface TasaP2P {
  plataforma: "binancep2p"; compra: string; venta: string; promedio: string; publicada_en: string; leida_en: string;
  bcv: { fecha_valor: string; tasa: string } | null;
  brecha_pct: string | null;                                   // (promedio / BCV − 1) × 100
  ejemplo_100_usd: { bcv_bs: string; p2p_bs: string; diferencia_bs: string } | null;
}

// Tasa BCV del dólar que muestra la portada: la de hoy (o el próximo día hábil ya publicado) o, si aún no hay, la última
async function bcvUsd(): Promise<{ fecha_valor: string; tasa: number } | null> {
  const [f] = await consulta<{ fecha_valor: string; tasa: string }>(
    `SELECT t.fecha_valor::text, t.venta_bs AS tasa FROM bcv.tasa t
      WHERE t.moneda = 'USD' AND t.fecha_valor = coalesce((SELECT min(fecha_valor) FROM bcv.publicacion WHERE fecha_valor >= $1::date),
                                                          (SELECT max(fecha_valor) FROM bcv.publicacion))`, [hoyCaracas()]);
  return f ? { fecha_valor: f.fecha_valor, tasa: Number(f.tasa) } : null;
}

// Lee CriptoYa y guarda la lectura. Rechaza valores absurdos frente al BCV (menos de la mitad o más de 5 veces).
export async function leerP2P() {
  const r = await fetch(FUENTE, { headers: { "User-Agent": AGENTE, Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!r.ok) throw new Error(`CriptoYa: HTTP ${r.status}`);
  const d = await r.json() as { ask?: number; bid?: number; time?: number };
  const compra = Number(d.ask), venta = Number(d.bid), segundos = Number(d.time);
  if (!(compra > 0) || !(venta > 0) || !(segundos > 1_600_000_000)) throw new Error("CriptoYa: respuesta inesperada");
  const bcv = await bcvUsd();
  if (bcv && [compra, venta].some((x) => x < bcv.tasa * 0.5 || x > bcv.tasa * 5)) {
    throw new Error(`CriptoYa: valor fuera de rango frente al BCV (${compra} / ${venta}; BCV ${bcv.tasa})`);
  }
  const [f] = await consulta<{ id: string }>(
    `INSERT INTO mercado.tasa_p2p (plataforma, compra, venta, publicada_en) VALUES ('binancep2p', $1, $2, to_timestamp($3))
     ON CONFLICT (plataforma, publicada_en) DO NOTHING RETURNING id`, [compra, venta, segundos]);
  await consulta("SELECT mercado.purgar()").catch(() => {});
  return { nueva: Boolean(f), compra, venta };
}

const fijo = (n: number, d = 2) => n.toFixed(d);

// Última lectura (de las últimas 24 h) con la brecha frente al BCV y el ejemplo de US$ 100
export async function tasaP2PActual(): Promise<TasaP2P | null> {
  const [t] = await consulta<{ compra: string; venta: string; promedio: string; publicada_en: string; leida_en: string }>(
    `SELECT compra::text, venta::text, promedio::text, to_json(publicada_en) #>> '{}' AS publicada_en, to_json(leida_en) #>> '{}' AS leida_en FROM mercado.tasa_p2p
      WHERE plataforma = 'binancep2p' AND leida_en > now() - interval '24 hours' ORDER BY leida_en DESC LIMIT 1`);
  if (!t) return null;
  const bcv = await bcvUsd();
  const p2p = Number(t.promedio);
  return {
    plataforma: "binancep2p", compra: t.compra, venta: t.venta, promedio: t.promedio, publicada_en: t.publicada_en, leida_en: t.leida_en,
    bcv: bcv ? { fecha_valor: bcv.fecha_valor, tasa: fijo(bcv.tasa, 4) } : null,
    brecha_pct: bcv ? fijo((p2p / bcv.tasa - 1) * 100) : null,
    ejemplo_100_usd: bcv ? { bcv_bs: fijo(bcv.tasa * 100), p2p_bs: fijo(p2p * 100), diferencia_bs: fijo((p2p - bcv.tasa) * 100) } : null,
  };
}
