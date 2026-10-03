// Lector de catálogos hechos con Readdy sobre Supabase (Catálogo RPC): la página es una aplicación React que pide los
// productos a su base Supabase con la clave pública ("publishable") que viene en su propio código. Se hace la misma
// consulta de solo lectura que su catálogo al detal: la vista products_sorted, precio "price_retail1" (US$), solo
// productos activos y con existencia en sus sedes, como muestra su página. La clave y la dirección se toman del código
// del sitio (se renuevan cada 6 h): no se guardan aquí. No tiene página por producto: se enlaza a su catálogo.
import type { Tienda } from "../tiendas.ts";
import { pagina, textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface ProductoRpc { id: string | number; code?: string; name?: string; price_retail1?: number | string; stock_sede2?: number; stock_sede3?: number; image_url?: string | null }

let acceso: { url: string; clave: string; desde: number } | null = null;

async function obtenerAcceso(t: Tienda, agente: string) {
  if (acceso && Date.now() - acceso.desde < 6 * 3600_000) return acceso;
  const html = await pagina(`${t.sitio}/catalogo`, agente);
  const js = /<script[^>]+src="(\/assets\/index-[\w-]+\.js)"/.exec(html)?.[1];
  if (!js) throw new Error("No se encontró el código del catálogo");
  const codigo = await pagina(`${t.sitio}${js}`, agente);
  const m = /`(https:\/\/[a-z0-9]+\.supabase\.co)`,\w+=`(sb_publishable_[\w-]+)`/.exec(codigo);
  if (!m) throw new Error("No se encontró la clave pública del catálogo");
  acceso = { url: m[1], clave: m[2], desde: Date.now() };
  return acceso;
}

export async function buscarReaddy(t: Tienda, consulta: string, limite: number, agente: string): Promise<OfertaTienda[]> {
  // Cada palabra debe estar en el nombre o en el código (sin signos que rompan la sintaxis de la consulta)
  // y sin acentos: sus nombres van en mayúsculas sin tildes ("JABON")
  const palabras = consulta.normalize("NFD").replace(/[\u0300-\u036f]/g, "").split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}-]/gu, "")).filter((w) => w.length >= 2).slice(0, 5);
  if (!palabras.length) return [];
  const { url, clave } = await obtenerAcceso(t, agente);
  const filtro = palabras.map((w) => `or(name.ilike.*${w}*,code.ilike.*${w}*)`).join(",");
  const q = new URLSearchParams({ select: "id,code,name,price_retail1,stock_sede2,stock_sede3,image_url", is_active: "eq.true",
    and: `(${filtro},or(stock_sede2.gt.0,stock_sede3.gt.0))`, order: "sort_priority.asc,name.asc", limit: String(Math.min(limite, 50)) });
  const r = await fetch(`${url}/rest/v1/products_sorted?${q}`, { headers: { "User-Agent": agente, apikey: clave, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401 || r.status === 403) acceso = null;                 // clave cambiada: se vuelve a leer la próxima vez
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as ProductoRpc[];
  if (!Array.isArray(d)) throw new Error("Respuesta inesperada del catálogo");
  return d.flatMap((p) => {
    const precio = Number(p.price_retail1);
    if (!(precio > 0) || !p.name || !p.code) return [];
    return [{ id_externo: String(p.code), nombre: textoPlano(p.name), marca: null, ean: null,
      url: `${t.sitio}/catalogo?producto=${encodeURIComponent(String(p.code))}`, imagen: p.image_url?.startsWith("https://") ? p.image_url : null,
      precio: precio.toFixed(2), precio_lista: null, disponible: (p.stock_sede2 ?? 0) + (p.stock_sede3 ?? 0) > 0 }];
  });
}
