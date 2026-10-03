// Lector de tiendas Medusa con vitrina Next.js (Tiendas Daka): su página de resultados (/ve/results/<búsqueda>)
// trae los productos en los datos de la propia página (self.__next_f.push). Cada tarjeta lleva el SKU, el nombre,
// la marca, la imagen y el precio en US$; "disabled" marca lo que no se puede comprar.
import type { Tienda } from "../tiendas.ts";
import { flujoNext, objetoEn, pagina, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface Tarjeta { productHandle: string; title: string; thumbnail?: string; brandName?: string; disabled?: boolean;
  variant?: { sku?: string; calculated_price?: { calculated_amount?: number; currency_code?: string } } }

export async function buscarMedusa(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const pais = new URL(t.sitio).pathname.replace(/\/$/, "");                 // "/ve"
  const origen = new URL(t.sitio).origin;
  const html = await pagina(`${origen}${pais}/results/${encodeURIComponent(consulta)}`, agente);
  const flujo = flujoNext(html);
  const vistos = new Set<string>();
  const salida: OfertaTienda[] = [];
  for (const m of flujo.matchAll(/"productHandle":"/g)) {
    const texto = objetoEn(flujo, m.index);
    if (!texto) continue;
    let p: Tarjeta;
    try { p = JSON.parse(texto) as Tarjeta; } catch { continue; }
    if (!/^[\p{L}\p{N}-]+$/u.test(p.productHandle) || vistos.has(p.productHandle)) continue;
    vistos.add(p.productHandle);
    const precio = p.variant?.calculated_price?.calculated_amount;
    if (!(typeof precio === "number" && precio > 0) || p.variant?.calculated_price?.currency_code !== "usd") continue;
    salida.push({ id_externo: p.variant?.sku || p.productHandle, nombre: textoPlano(p.title), marca: p.brandName && !/ning[uú]n\s+fabricante/i.test(p.brandName) ? textoPlano(p.brandName) : null, ean: null,
      url: `${origen}${pais}/products/${encodeURIComponent(p.productHandle)}`, imagen: p.thumbnail?.startsWith("https://") ? p.thumbnail : null,
      precio: precio.toFixed(2), precio_lista: null, disponible: !p.disabled });
    if (salida.length >= limite) break;
  }
  return salida;
}
