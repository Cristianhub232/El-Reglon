// Datos reales del día para los correos de prospección (docs/26): los próximos deberes de un contribuyente especial
// (calendario oficial por RIF) y productos básicos más baratos en una cadena que en otra (comparador, mismo código de
// barras en al menos dos cadenas, precios de las últimas 48 horas en Bs.; los precios en US$ se convierten con la tasa
// del BCV). Si algo falla, el correo sale sin ese bloque.
import { consulta } from "../../core/db.ts";
import { misDeberes } from "../calendario/consultas.ts";
import { TIENDAS } from "../comparador/tiendas.ts";
import type { Deber, PrecioEjemplo } from "./plantillas.ts";

const hoyCaracas = () => new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);

export async function deberesDe(rif: string): Promise<Deber[] | null> {
  try {
    const r = await misDeberes(rif, "ESPECIAL", [], hoyCaracas(), 4) as unknown as {
      deberes: { fecha_limite: string; nombre: string; periodo_desde: string | null; periodo_hasta: string | null }[] };
    return r.deberes.map((d) => ({ fecha_limite: d.fecha_limite, nombre: d.nombre,
      periodo: d.periodo_desde && d.periodo_hasta ? `${d.periodo_desde} al ${d.periodo_hasta}` : null }));
  } catch { return null; }
}

// Productos básicos: se elige uno por rubro, el de mayor diferencia entre la cadena más barata y la más cara
const RUBROS = "harina|arroz|aceite|azucar|cafe|leche|pasta|atun|mayonesa|margarina|jabon|papel higienico|crema dental|desodorante|acetaminofen|ibuprofeno|champu|panal";
const bonito = (n: string) => n.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_m, e: string, l: string) => e + l.toUpperCase())
  .replace(/\b(\d+)\s?(gr?|kg|ml|lt?|mg)\b/gi, (_m, n: string, u: string) => `${n} ${({ gr: "g", lt: "L", l: "L" } as Record<string, string>)[u.toLowerCase()] ?? u.toLowerCase()}`).replace(/\s+/g, " ").trim();

let cache: { dia: string; precios: PrecioEjemplo[] } | null = null;
export async function preciosDelDia(): Promise<PrecioEjemplo[]> {
  if (cache?.dia === hoyCaracas()) return cache.precios;
  try {
    const filas = await consulta<{ rubro: string; nombre: string; cadenas: number; minimo: string; tienda: string; maximo: string }>(`
      WITH tasa AS (SELECT venta_bs AS usd FROM bcv.tasa WHERE moneda = 'USD' ORDER BY fecha_valor DESC LIMIT 1),
      ult AS (SELECT DISTINCT ON (pr.producto_id) pr.producto_id, pr.precio, pr.moneda, pr.disponible
                FROM comparador.precio pr WHERE pr.observado_en > now() - interval '2 days' ORDER BY pr.producto_id, pr.observado_en DESC),
      por_tienda AS (
        SELECT p.ean, s.tienda_id, substring(p.nombre_busqueda FROM '\\m(${RUBROS})') AS rubro,
               min(CASE WHEN u.moneda = 'USD' THEN u.precio * (SELECT usd FROM tasa) ELSE u.precio END) AS bs,
               (array_agg(p.nombre ORDER BY u.precio))[1] AS nombre
          FROM comparador.producto p JOIN ult u ON u.producto_id = p.id AND u.disponible
          JOIN comparador.sucursal s ON s.id = p.sucursal_id JOIN comparador.tienda t ON t.id = s.tienda_id AND t.activa
         WHERE p.ean IS NOT NULL AND p.nombre_busqueda ~ '\\m(${RUBROS})'
         GROUP BY p.ean, s.tienda_id, rubro),
      agg AS (SELECT ean, rubro, count(*)::int AS cadenas, min(bs) AS minimo, max(bs) AS maximo,
                     (array_agg(tienda_id ORDER BY bs))[1] AS tienda, (array_agg(nombre ORDER BY bs))[1] AS nombre
                FROM por_tienda GROUP BY ean, rubro HAVING count(*) >= 2 AND max(bs) > min(bs) * 1.03)
      SELECT * FROM (SELECT DISTINCT ON (rubro) rubro, nombre, cadenas, round(minimo, 2)::text AS minimo, tienda, round(maximo, 2)::text AS maximo
                       FROM agg ORDER BY rubro, (1 - minimo / maximo) DESC) x
       ORDER BY (1 - minimo::numeric / maximo::numeric) DESC LIMIT 4`);
    const precios = filas.map((f) => ({
      producto: bonito(f.nombre), consulta: f.nombre.toLowerCase().split(/\s+/).slice(0, 4).join(" "),
      minimo: Number(f.minimo), maximo: Number(f.maximo), cadenas: f.cadenas,
      tienda: TIENDAS.find((t) => t.id === f.tienda)?.nombre ?? f.tienda,
    }));
    cache = { dia: hoyCaracas(), precios };
    return precios;
  } catch { return []; }
}
