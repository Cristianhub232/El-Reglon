// Lector de tiendas VTEX (Locatel, Farmacias SAAS, Damasco): API pública de catálogo de la propia tienda,
// la misma que usa su buscador. Devuelve nombre, marca, código de barras (EAN), precio y existencia.
import type { Tienda } from "../tiendas.ts";
import type { OfertaTienda } from "./tipos.ts";

interface ProductoVtex {
  productId: string; productName: string; brand?: string; link?: string;
  items?: { itemId: string; ean?: string; images?: { imageUrl?: string }[]; sellers?: { commertialOffer?: { Price?: number; ListPrice?: number; AvailableQuantity?: number; IsAvailable?: boolean } }[] }[];
}

export async function buscarVtex(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const url = `${t.sitio}/api/catalog_system/pub/products/search?ft=${encodeURIComponent(consulta)}&_from=0&_to=${Math.min(limite, 50) - 1}`;
  const r = await fetch(url, { headers: { "User-Agent": agente, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (r.status !== 200 && r.status !== 206) throw new Error(`HTTP ${r.status}`);
  const datos = await r.json() as ProductoVtex[];
  if (!Array.isArray(datos)) throw new Error("Respuesta inesperada de VTEX");
  return datos.flatMap((p) => {
    const item = p.items?.[0];
    const oferta = item?.sellers?.[0]?.commertialOffer;
    if (!item || !oferta?.Price || oferta.Price <= 0 || !p.link?.startsWith(t.sitio)) return [];
    return [{
      id_externo: `${p.productId}-${item.itemId}`, nombre: p.productName.trim(), marca: p.brand?.trim() || null, ean: item.ean?.trim() || null,
      url: p.link, imagen: item.images?.[0]?.imageUrl?.replace(/^http:/, "https:") ?? null,
      precio: oferta.Price.toFixed(2), precio_lista: oferta.ListPrice && oferta.ListPrice > oferta.Price ? oferta.ListPrice.toFixed(2) : null,
      disponible: (oferta.AvailableQuantity ?? 0) > 0 || oferta.IsAvailable === true,
    }];
  });
}
