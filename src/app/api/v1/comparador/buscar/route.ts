import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { buscarEnTiendas, registrarBusqueda } from "../../../../../modules/comparador/buscador.ts";
import { agrupar, type Oferta } from "../../../../../modules/comparador/emparejar.ts";

export const dynamic = "force-dynamic";
// ?q=harina pan&limite=20 → productos emparejados entre tiendas, del más pertinente al menos, con el mejor precio
export const GET = endpoint("comparador", async (_req, url) => {
  const q = (url.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
  if (q.length < 2 || q.length > 80) throw new ErrorApi(400, "consulta_invalida", "'q' debe tener entre 2 y 80 caracteres");
  const limite = url.searchParams.get("limite") ? Number(url.searchParams.get("limite")) : 20;
  if (!Number.isInteger(limite) || limite < 1 || limite > 50) throw new ErrorApi(400, "parametro_invalido", "'limite' debe ser un entero entre 1 y 50");
  const ofertas: Oferta[] = [];
  const tiendas: { id: string; estado: "ok" | "error"; ofertas: number; ms: number; mensaje?: string }[] = [];
  let tasa = null, ms = 0;
  for await (const ev of buscarEnTiendas(q)) {
    if (ev.tipo === "inicio") tasa = ev.tasa;
    if (ev.tipo === "tienda") { ofertas.push(...ev.ofertas); tiendas.push({ id: ev.tienda, estado: "ok", ofertas: ev.ofertas.length, ms: ev.ms }); }
    if (ev.tipo === "error") tiendas.push({ id: ev.tienda, estado: "error", ofertas: 0, ms: ev.ms, mensaje: ev.mensaje });
    if (ev.tipo === "fin") ms = ev.ms;
  }
  const grupos = agrupar(ofertas, q);
  void registrarBusqueda({ termino: q, origen: "api", ofertas: ofertas.length, grupos: grupos.length, ok: tiendas.filter((t) => t.estado === "ok").length,
    errores: tiendas.filter((t) => t.estado === "error").length, ms });
  return { consulta: q, tasa_bcv: tasa, tiendas, total_grupos: grupos.length, productos: grupos.slice(0, limite).map((g) => ({
    nombre: g.nombre, presentacion: g.presentacion || null, imagen: g.imagen, tiendas: new Set(g.ofertas.map((o) => o.tienda)).size,
    mejor_precio: { tienda: g.mejor.tienda, precio_bs: g.mejor.precio_bs.toFixed(2), precio_usd: g.mejor.precio_usd.toFixed(2) },
    ofertas: g.ofertas.map((o) => ({ tienda: o.tienda, nombre: o.nombre, marca: o.marca, ean: o.ean, url: o.url, disponible: o.disponible,
      precio: o.precio, moneda: o.moneda, precio_bs: o.precio_bs.toFixed(2), precio_usd: o.precio_usd.toFixed(2) })),
  })), aviso: "Precios publicados por cada tienda en línea al momento de la consulta; pueden variar por sucursal. Conversión con la tasa BCV aplicable a hoy." };
});
