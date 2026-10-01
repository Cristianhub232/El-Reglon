// Lector de Kromi Online: su búsqueda (Products.php?des=…) pide los productos a su propio servicio
// (MatchingProductList.php) con la sesión anónima que recibe cualquier visitante al abrir la página. El precio
// llega sin IVA y en su moneda: se suma el impuesto de cada producto, como hace su página al mostrarlo.
import type { Tienda } from "../tiendas.ts";
import { textoPlano } from "./comun.ts";
import type { OfertaTienda } from "./tipos.ts";

interface ItemKromi { code: string; name: string; price: number; priceO: number; impuesto: number; stock: number; imagen?: string;
  c_codmoneda?: { simbolo?: string; descripcion?: string } }

let sesion: { cookie: string; desde: number } | null = null;

async function abrirSesion(t: Tienda, agente: string, consulta: string): Promise<string> {
  if (sesion && Date.now() - sesion.desde < 20 * 60_000) return sesion.cookie;
  const r = await fetch(`${t.sitio}/Products.php?des=${encodeURIComponent(consulta)}`, { headers: { "User-Agent": agente }, signal: AbortSignal.timeout(15_000) });
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).find((c) => c.startsWith("PHPSESSID="));
  await r.body?.cancel();
  if (!cookie) throw new Error("La tienda no abrió sesión");
  sesion = { cookie, desde: Date.now() };
  return cookie;
}

export async function buscarKromi(t: Tienda, consulta: string, limite: number, agente: string, reintento = false): Promise<OfertaTienda[]> {
  const cookie = await abrirSesion(t, agente, consulta);
  const cuerpo = new FormData();
  cuerpo.append("des", consulta);
  const r = await fetch(`${t.sitio}/includes/QueryPHP/Product/MatchingProductList.php`, { method: "POST", body: cuerpo,
    headers: { "User-Agent": agente, Accept: "application/json", Cookie: cookie, Referer: `${t.sitio}/Products.php?des=${encodeURIComponent(consulta)}` },
    signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const d = await r.json() as { error?: boolean; item?: ItemKromi[] };
  if (!Array.isArray(d.item)) {
    if (!reintento) { sesion = null; return buscarKromi(t, consulta, limite, agente, true); }   // sesión vencida: una nueva
    return [];                                                                                     // sin resultados
  }
  return d.item.slice(0, limite).flatMap((p) => {
    const base = p.priceO > 0 ? p.priceO : p.price;
    const precio = base * (1 + (p.impuesto || 0) / 100);
    if (!(precio > 0) || !/^\d+$/.test(p.code) || p.c_codmoneda?.simbolo !== "$") return [];
    const img = p.imagen ? new URL(p.imagen, `${t.sitio}/includes/QueryPHP/Product/`).href : null;
    return [{ id_externo: p.code, nombre: textoPlano(p.name).replace(/\s+prs$/i, ""), marca: null, ean: null, url: `${t.sitio}/Product.php?code=${p.code}`,
      imagen: img?.startsWith("https://") ? img : null, precio: precio.toFixed(2),
      precio_lista: p.priceO > 0 && p.price > p.priceO ? (p.price * (1 + (p.impuesto || 0) / 100)).toFixed(2) : null, disponible: p.stock > 0 }];
  });
}
