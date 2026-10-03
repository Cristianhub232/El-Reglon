// Lector de tiendas WooCommerce por su API pública de tienda (Store API, /wp-json/wc/store/v1/products): la misma
// que usan sus bloques de búsqueda. Mafabre y Venelectronics. Los precios vienen en la unidad menor de la moneda
// ("125" = 1,25). Con "modelo_sku" el SKU es el modelo con el prefijo de la marca ("LG-LM22SGPK"): se agrega el modelo
// al nombre, que no lo trae, para que se vea y para emparejar la electrónica con otras tiendas.
import type { Tienda } from "../tiendas.ts";
import { modelos } from "../emparejar.ts";
import { deLaTienda, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface ProductoWoo { id: number; name: string; sku?: string; permalink: string; is_in_stock?: boolean; images?: { src?: string }[];
  prices?: { price?: string; regular_price?: string; currency_code?: string; currency_minor_unit?: number } }

export async function buscarWooStore(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const r = await fetch(`${t.sitio}/wp-json/wc/store/v1/products?search=${encodeURIComponent(consulta)}&per_page=${Math.min(limite, 50)}`,
    { headers: { "User-Agent": agente, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as ProductoWoo[];
  if (!Array.isArray(d)) throw new Error("Respuesta inesperada de la API de la tienda");
  return d.flatMap((p) => {
    const pr = p.prices, factor = 10 ** (pr?.currency_minor_unit ?? 2);
    const precio = Number(pr?.price) / factor, lista = Number(pr?.regular_price) / factor;
    const url = deLaTienda(p.permalink, t.sitio);
    if (!(precio > 0) || !url || (pr?.currency_code && pr.currency_code !== t.moneda)) return [];
    let nombre = textoPlano(p.name);
    const modelo = t.modelo_sku ? textoPlano(p.sku ?? "").replace(/^[A-Za-z]{2,4}-/, "") : "";
    if (modelo && modelos(modelo).length && !modelos(nombre).includes(modelos(modelo)[0])) nombre = `${nombre} · ${modelo}`;
    return [{ id_externo: String(p.id), nombre, marca: null, ean: null, url,
      imagen: p.images?.[0]?.src?.startsWith("https://") ? p.images[0].src! : null, precio: precio.toFixed(2),
      precio_lista: lista > precio ? lista.toFixed(2) : null, disponible: p.is_in_stock !== false }];
  });
}
