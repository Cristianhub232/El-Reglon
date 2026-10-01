// Lector de tiendas Magento por su API GraphQL pública (la que usa su propia tienda PWA). Ivoo: API en nuweapp.com,
// enlaces de producto en www.ivoo.com. Precios en la moneda que indica la API (US$).
import type { Tienda } from "../tiendas.ts";
import type { OfertaTienda } from "./tipos.ts";

interface ItemMagento { sku: string; name: string; url_key?: string; url_suffix?: string; stock_status?: string; small_image?: { url?: string };
  price_range?: { minimum_price?: { final_price?: { value?: number; currency?: string }; regular_price?: { value?: number } } } }

export async function buscarMagento(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  if (!t.api) throw new Error("Falta la dirección de la API GraphQL");
  const q = `query Buscar($q: String!, $n: Int!) { products(search: $q, pageSize: $n) { items { sku name url_key url_suffix stock_status small_image { url }
    price_range { minimum_price { final_price { value currency } regular_price { value } } } } } }`;
  const url = `${t.api}?query=${encodeURIComponent(q)}&variables=${encodeURIComponent(JSON.stringify({ q: consulta, n: Math.min(limite, 40) }))}`;
  const r = await fetch(url, { headers: { "User-Agent": agente, Accept: "application/json", Store: "default" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as { data?: { products?: { items?: ItemMagento[] } }; errors?: { message?: string }[] };
  if (d.errors?.length) throw new Error(`GraphQL: ${d.errors[0].message ?? "error"}`);
  return (d.data?.products?.items ?? []).flatMap((p) => {
    const precio = p.price_range?.minimum_price?.final_price?.value, lista = p.price_range?.minimum_price?.regular_price?.value;
    const moneda = p.price_range?.minimum_price?.final_price?.currency;
    if (!precio || precio <= 0 || !p.url_key || !/^[a-z0-9-]+$/.test(p.url_key) || (moneda && moneda !== t.moneda)) return [];
    return [{ id_externo: p.sku, nombre: p.name.trim(), marca: null, ean: null, url: `${t.sitio}/${p.url_key}${p.url_suffix ?? ".html"}`,
      imagen: p.small_image?.url?.startsWith("https://") ? p.small_image.url : null, precio: precio.toFixed(2),
      precio_lista: lista && lista > precio ? lista.toFixed(2) : null, disponible: p.stock_status !== "OUT_OF_STOCK" }];
  });
}
