// Lector de La Alacena Market (Maracaibo): página de búsqueda /buscar?filtro=…, con tarjetas de producto y precio en US$
import type { Tienda } from "../tiendas.ts";
import { absoluta, deLaTienda, pagina, precioEs, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

export async function buscarAlacena(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  const html = await pagina(`${t.sitio}/buscar?filtro=${encodeURIComponent(consulta)}`, agente);
  const salida: OfertaTienda[] = [];
  for (const [bloque] of html.matchAll(/<div class="producto[\s\S]*?<\/form>/g)) {
    const url = deLaTienda(absoluta(/<a href="([^"]+\/producto\/[^"]+)"/.exec(bloque)?.[1] ?? "", t.sitio), t.sitio);
    const nombre = textoPlano(/nombre-producto">\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(bloque)?.[1] ?? "");
    const precio = precioEs(textoPlano(/precio-producto">\s*<h5>([\s\S]*?)<\/h5>/.exec(bloque)?.[1] ?? ""));
    const id = /name="id_producto"[^>]*value="(\d+)"/.exec(bloque)?.[1] ?? url;
    const imagen = /<img[^>]*src="([^"]+)"/.exec(bloque)?.[1];
    if (!url || !nombre || !precio || !id) continue;
    salida.push({ id_externo: id, nombre, marca: null, ean: null, url, imagen: imagen ? absoluta(imagen, t.sitio) : null, precio, precio_lista: null, disponible: true });
    if (salida.length >= limite) break;
  }
  return salida;
}
