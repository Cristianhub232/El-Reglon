// Lector de tiendas Instaleap con vitrina Next.js (Río Market): su página de búsqueda (/search?name=…) trae los
// productos en los datos de la propia página, con el código de barras. Su API GraphQL exige las credenciales internas
// del sitio y no se usa. El precio ("price") ya incluye el IVA y está en la moneda de referencia de la tienda (US$);
// se consulta la sede predeterminada de la tienda. La marca que publica es la del fabricante ("Polar" para Mavesa o
// PAN): no se envía, para que el emparejamiento la deduzca del nombre.
import type { Tienda } from "../tiendas.ts";
import { ean as eanValido } from "../normalizar.ts";
import { flujoNext, objetoEn, pagina, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface Producto { name: string; price: number; slug: string; sku?: string; ean?: string[]; photosUrl?: string[]; isAvailable?: boolean; stock?: number }

export async function buscarInstaleap(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const flujo = flujoNext(await pagina(`${t.sitio}/search?name=${encodeURIComponent(consulta)}`, agente));
  const vistos = new Set<string>();
  const salida: OfertaTienda[] = [];
  for (const m of flujo.matchAll(/"ean":\[/g)) {
    const texto = objetoEn(flujo, m.index);
    if (!texto) continue;
    let p: Producto;
    try { p = JSON.parse(texto) as Producto; } catch { continue; }
    if (typeof p.slug !== "string" || !/^[a-z0-9-]+$/.test(p.slug) || vistos.has(p.slug) || !p.name) continue;
    vistos.add(p.slug);
    if (!(typeof p.price === "number" && p.price > 0)) continue;
    const imagen = p.photosUrl?.[0];
    salida.push({ id_externo: p.sku || p.slug, nombre: textoPlano(p.name), marca: null, ean: eanValido(p.ean?.[0]),
      url: `${t.sitio}/p/${p.slug}`, imagen: imagen?.startsWith("https://") ? imagen : null,
      precio: p.price.toFixed(2), precio_lista: null, disponible: p.isAvailable !== false && (p.stock ?? 1) > 0 });
    if (salida.length >= limite) break;
  }
  return salida;
}
