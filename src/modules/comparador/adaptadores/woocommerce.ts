// Lector de tiendas WooCommerce por su página de búsqueda (?s=…&post_type=product). Central Madeirense publica un
// catálogo por sede en una ruta propia (/Bello-Monte-08/), con precios en US$ ("REF").
import type { Sede, Tienda } from "../tiendas.ts";
import { absoluta, deLaTienda, pagina, precioEs, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

export async function buscarWoocommerce(t: Tienda, consulta: string, limite: number, agente: string, sede: Sede | null): Promise<OfertaTienda[]> {
  const base = sede ? `${t.sitio}/${sede.clave}` : t.sitio;
  const html = await pagina(`${base}/?s=${encodeURIComponent(consulta)}&post_type=product`, agente);
  const salida: OfertaTienda[] = [];
  for (const [bloque] of html.matchAll(/<li[^>]*class="[^"]*\btype-product\b[^"]*"[\s\S]*?<\/li>\s*(?=<li[^>]*class="[^"]*\btype-product\b|<\/ul>)/g)) {
    const clases = /class="([^"]*)"/.exec(bloque)?.[1] ?? "";
    const id = /data-product_id="(\d+)"/.exec(bloque)?.[1] ?? /\bpost-(\d+)\b/.exec(clases)?.[1];
    const url = deLaTienda(absoluta(/<a[^>]*class="product-loop-title"[^>]*href="([^"]+)"/.exec(bloque)?.[1] ?? /<a[^>]*href="([^"]+\/producto\/[^"]+)"/.exec(bloque)?.[1] ?? "", base), t.sitio);
    const nombre = textoPlano(/woocommerce-loop-product__title">([\s\S]*?)<\/h[23]>/.exec(bloque)?.[1] ?? "");
    // Si hay oferta, el precio vigente va en <ins>; si no, el único que hay
    const zona = /<ins[^>]*>([\s\S]*?)<\/ins>/.exec(bloque)?.[1] ?? /<span class="price">([\s\S]*?)<\/span>\s*<\/span>/.exec(bloque)?.[1] ?? "";
    const precio = precioEs(textoPlano(/<bdi>([\s\S]*?)<\/bdi>/.exec(zona)?.[1] ?? ""));
    const imagen = /<img[^>]*src="([^"]+)"/.exec(bloque)?.[1];
    if (!id || !url || !nombre || !precio) continue;
    salida.push({ id_externo: id, nombre, marca: null, ean: null, url, imagen: imagen && !/placeholder/.test(imagen) ? absoluta(imagen, base) : null,
      precio, precio_lista: null, disponible: !/\boutofstock\b/.test(clases) });
    if (salida.length >= limite) break;
  }
  return salida;
}
