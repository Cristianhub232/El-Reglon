// Lector de tiendas Shopify (Punto al Mayor): su búsqueda pública (/search/suggest.json) y, por cada resultado, el
// archivo público del producto (/products/<handle>.js) para elegir la variante. Punto al Mayor vende "Detal" y
// "Mayor (Bulto 20 unidades)": se compara el precio al detal; lo que no tiene variante "Detal" se vende al mayor y
// se muestra aparte, marcado en el nombre, para que nunca se compare un bulto con una unidad.
import type { Tienda } from "../tiendas.ts";
import { ean as eanValido } from "../normalizar.ts";
import { textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface Sugerencia { handle: string; title: string; available: boolean; image?: string; featured_image?: { url?: string } }
interface ProductoJs { id: number; title: string; handle: string; featured_image?: string;
  variants: { id: number; title: string; price: number; compare_at_price: number | null; available: boolean; barcode: string | null }[] }

export async function buscarShopify(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const cabeceras = { "User-Agent": agente, Accept: "application/json" };
  const r = await fetch(`${t.sitio}/search/suggest.json?q=${encodeURIComponent(consulta)}&resources%5Btype%5D=product&resources%5Blimit%5D=${Math.min(limite, 10)}`,
    { headers: cabeceras, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as { resources?: { results?: { products?: Sugerencia[] } } };
  const sugerencias = (d.resources?.results?.products ?? []).filter((p) => /^[a-z0-9-]+$/.test(p.handle));
  const salida: OfertaTienda[] = [];
  // De a dos a la vez, como mucho 10 productos por búsqueda (el servicio guarda la respuesta 15 minutos)
  for (let i = 0; i < sugerencias.length; i += 2) {
    const lote = await Promise.all(sugerencias.slice(i, i + 2).map(async (s) => {
      const rp = await fetch(`${t.sitio}/products/${s.handle}.js`, { headers: cabeceras, signal: AbortSignal.timeout(15_000) });
      return rp.ok ? await rp.json() as ProductoJs : null;
    }));
    for (const p of lote) {
      if (!p?.variants?.length) continue;
      const detal = p.variants.find((v) => /detal|unidad/i.test(v.title));
      const v = detal ?? p.variants[0];
      // Sin variante "Detal" se vende al mayor (aunque la variante no lo diga: "Default Title" a US$ 33,89 por 900 g)
      const alMayor = !detal;
      const presentacion = /mayor|bulto|caja|paquete|fardo/i.test(v.title) ? textoPlano(v.title.replace(/^mayor\s*/i, "").replace(/^\(|\)$/g, "")) : "";
      const precio = v.price / 100;
      if (!(precio > 0)) continue;
      const nombre = textoPlano(p.title) + (alMayor ? ` (al mayor${presentacion ? `: ${presentacion}` : ""})` : "");
      const imagen = p.featured_image ? (p.featured_image.startsWith("//") ? `https:${p.featured_image}` : p.featured_image) : null;
      salida.push({ id_externo: `${p.id}-${v.id}`, nombre, marca: null, ean: eanValido(v.barcode), url: `${t.sitio}/products/${p.handle}`,
        imagen: imagen?.startsWith("https://") ? imagen : null, precio: precio.toFixed(2),
        precio_lista: v.compare_at_price && v.compare_at_price > v.price ? (v.compare_at_price / 100).toFixed(2) : null, disponible: v.available });
    }
  }
  return salida;
}
