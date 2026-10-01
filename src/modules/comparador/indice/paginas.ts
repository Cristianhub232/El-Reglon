// Lectores de una página de producto (tiendas por índice). Devuelven la oferta, o null si la página no trae producto.
import { decodificar, precioEs, textoPlano } from "../adaptadores/comun.ts";
import type { OfertaTienda } from "../adaptadores/tipos.ts";
import { ean as eanValido } from "../normalizar.ts";
import type { Tienda } from "../tiendas.ts";

export type LectorPagina = (t: Tienda, url: string, html: string) => OfertaTienda | null;

interface LdProducto { "@type"?: string; name?: string; sku?: string | number; gtin13?: string; gtin?: string; image?: string | string[]; brand?: { name?: string } | string;
  offers?: { price?: number | string; priceCurrency?: string; availability?: string } | { price?: number | string; priceCurrency?: string; availability?: string }[] }

function ldProducto(html: string): LdProducto | null {
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]) as LdProducto | LdProducto[] | { "@graph"?: LdProducto[] };
      const lista = Array.isArray(d) ? d : "@graph" in d && Array.isArray(d["@graph"]) ? d["@graph"] : [d as LdProducto];
      const p = lista.find((x) => x["@type"] === "Product");
      if (p) return p;
    } catch { /* otro bloque */ }
  }
  return null;
}

// Farmatodo: datos estructurados (schema.org Product) de la página. Precio en Bs. (priceCurrency VES).
export const leerFarmatodo: LectorPagina = (t, url, html) => {
  const p = ldProducto(html);
  const oferta = Array.isArray(p?.offers) ? p?.offers[0] : p?.offers;
  const precio = oferta?.price !== undefined ? Number(oferta.price) : NaN;
  if (!p?.name || !(precio > 0) || (oferta?.priceCurrency && oferta.priceCurrency !== t.moneda)) return null;
  const id = /\/producto\/(\d+)/.exec(url)?.[1] ?? String(p.sku ?? url);
  const imagen = Array.isArray(p.image) ? p.image[0] : p.image;
  return { id_externo: id, nombre: textoPlano(p.name), marca: typeof p.brand === "string" ? p.brand : p.brand?.name?.trim() || null,
    ean: eanValido(p.gtin13 ?? p.gtin ?? null), url, imagen: imagen?.startsWith("https://") ? imagen : null,
    precio: precio.toFixed(2), precio_lista: null, disponible: !/OutOfStock|SoldOut/i.test(oferta?.availability ?? "") };
};

// "Bs.4,397.91" → 4397.91 (coma de miles, punto decimal; el punto de "Bs." no cuenta)
const cifraIngles = (s: string) => Number((/\d[\d,]*(?:\.\d+)?/.exec(s)?.[0] ?? "").replace(/,/g, "")) || NaN;

// Plan Suárez (OpenCart): título y precio de la página ("Bs.4,397.91": coma de miles y punto decimal). La imagen
// lleva el código de barras en el nombre del archivo.
export const leerPlanSuarez: LectorPagina = (_t, url, html) => {
  const nombre = textoPlano(/<meta property="og:title" content="([^"]+)"/.exec(html)?.[1] ?? "");
  const precioTexto = /class="product-price-new"[^>]*>([^<]+)/.exec(html)?.[1] ?? /class="product-price"[^>]*>([^<]+)/.exec(html)?.[1] ?? "";
  const n = cifraIngles(precioTexto);
  const id = /product_id=(\d+)/.exec(url)?.[1];
  if (!nombre || !(n > 0) || !id) return null;
  const imagen = decodificar(/<meta property="og:image" content="([^"]+)"/.exec(html)?.[1] ?? "");
  const anterior = /class="product-price-old"[^>]*>([^<]+)/.exec(html)?.[1];
  const lista = anterior ? cifraIngles(anterior) : NaN;
  return { id_externo: id, nombre, marca: null, ean: eanValido(/\/(\d{8,14})[-_.]/.exec(imagen)?.[1] ?? null), url,
    imagen: imagen.startsWith("https://") ? imagen : null, precio: n.toFixed(2), precio_lista: lista > n ? lista.toFixed(2) : null,
    disponible: !/<b>Disponible:<\/b>\s*<span>\s*(Agotado|Sin existencia|Fuera de stock)/i.test(html) };
};

// Gama (SAP Commerce): la API pública de producto (OCC). La URL de la página trae el código (/p/30010322).
export const leerGama = (t: Tienda, url: string, json: string): OfertaTienda | null => {
  let d: { code?: string; name?: string; manufacturer?: string; price?: { value?: number; currencyIso?: string }; stock?: { stockLevelStatus?: string }; images?: { url?: string }[] };
  try { d = JSON.parse(json); } catch { return null; }
  const precio = d.price?.value;
  if (!d.code || !d.name || !precio || precio <= 0) return null;
  const img = d.images?.find((i) => i.url)?.url;
  return { id_externo: d.code, nombre: textoPlano(d.name), marca: d.manufacturer?.trim() || null, ean: null, url,
    imagen: img ? new URL(img, t.api ?? t.sitio).href.replace(/^http:/, "https:") : null, precio: precio.toFixed(2), precio_lista: null,
    disponible: d.stock?.stockLevelStatus !== "outOfStock" };
};

export { precioEs };
