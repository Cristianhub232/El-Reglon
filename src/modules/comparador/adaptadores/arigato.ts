// Lector de tiendas Arigato (Naida Hogar): su aplicación web busca en un servicio público (<api>/query?q=…&db=…,
// sin credenciales y abierto a cualquier origen), que responde los productos agrupados. Se toma el precio regular en
// US$ ("price"), el mismo que la tienda muestra convertido a bolívares ("price_bs"); el "precio especial" es una
// condición de pago y no se compara. El SKU es el código de modelo del fabricante: se agrega al nombre (si no lo
// trae) para que se vea y para emparejar la electrónica con otras tiendas.
import type { Tienda } from "../tiendas.ts";
import { modelos } from "../emparejar.ts";
import { textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface Documento { id: string; sku?: string; name?: string; brand?: string; price?: number; stock?: number; img_500x500?: string; img_thumb?: string }

export async function buscarArigato(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  if (!t.api) throw new Error("Falta la dirección del servicio de búsqueda");
  const { origin, searchParams } = new URL(t.api);                          // https://search…/query?db=<catálogo>
  const r = await fetch(`${origin}/query?q=${encodeURIComponent(consulta)}&db=${encodeURIComponent(searchParams.get("db") ?? "")}`,
    { headers: { "User-Agent": agente, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as { parent_id?: { groups?: { doclist?: { docs?: Documento[] } }[] } };
  const salida: OfertaTienda[] = [];
  for (const g of d.parent_id?.groups ?? []) {
    const p = g.doclist?.docs?.[0];
    if (!p || !/^\d+$/.test(String(p.id)) || !(typeof p.price === "number" && p.price > 0) || !p.name) continue;
    const imagen = p.img_500x500 ?? p.img_thumb;
    const nombre = textoPlano(p.name), sku = textoPlano(p.sku ?? "");
    const conModelo = modelos(sku).length && !modelos(nombre).includes(modelos(sku)[0]) ? `${nombre} · ${sku}` : nombre;
    salida.push({ id_externo: String(p.id), nombre: conModelo, marca: p.brand ? textoPlano(p.brand) : null, ean: null,
      url: `${t.sitio}/productos/${p.id}`, imagen: imagen?.startsWith("https://") ? imagen : null,
      precio: p.price.toFixed(2), precio_lista: null, disponible: (p.stock ?? 0) > 0 });
    if (salida.length >= limite) break;
  }
  return salida;
}
