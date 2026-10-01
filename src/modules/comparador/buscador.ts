// Búsqueda en todas las tiendas a la vez (lado de la app): pregunta a cada servicio y entrega cada respuesta en cuanto
// llega, con los precios convertidos a Bs. y US$ con la tasa BCV aplicable a hoy (art. 25 Ley IVA).
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { tasaAplicable } from "../bcv/consultas.ts";
import type { OfertaTienda } from "./adaptadores/tipos.ts";
import type { Oferta } from "./emparejar.ts";
import { credencialInterna } from "./servicio.ts";
import { TIENDAS, type Tienda } from "./tiendas.ts";

export type Evento =
  | { tipo: "inicio"; consulta: string; tasa: { usd: string; fecha_valor: string } | null; tiendas: { id: string; nombre: string; rubros: string[] }[] }
  | { tipo: "tienda"; tienda: string; ofertas: Oferta[]; ms: number; cache: boolean }
  | { tipo: "error"; tienda: string; mensaje: string; ms: number }
  | { tipo: "fin"; ms: number };

export async function tiendasActivas(): Promise<Tienda[]> {
  const pausadas = new Set((await consulta<{ id: string }>("SELECT id FROM comparador.tienda WHERE NOT activa").catch(() => [])).map((f) => f.id));
  return TIENDAS.filter((t) => !pausadas.has(t.id));
}

export async function tasaDelDia() {
  try {
    const t = await tasaAplicable(hoyCaracas(), "USD");
    return { usd: t.tasa_bs, fecha_valor: t.fecha_valor };
  } catch { return null; }
}

const redondo = (x: number) => Math.round(x * 100) / 100;

export function convertir(t: Tienda, o: OfertaTienda, tasaUsd: number | null): Oferta {
  const n = Number(o.precio);
  const bs = t.moneda === "VES" ? n : tasaUsd ? n * tasaUsd : NaN;
  const usd = t.moneda === "USD" ? n : tasaUsd ? n / tasaUsd : NaN;
  return { tienda: t.id, tienda_nombre: t.nombre, id_externo: o.id_externo, nombre: o.nombre, marca: o.marca, ean: o.ean, url: o.url,
    imagen: o.imagen, disponible: o.disponible, precio: o.precio, moneda: t.moneda, precio_bs: redondo(bs), precio_usd: redondo(usd) };
}

async function preguntar(t: Tienda, q: string): Promise<{ ofertas: OfertaTienda[]; cache: boolean }> {
  const host = process.env.COMPARADOR_HOST ?? "127.0.0.1";
  const credencial = credencialInterna();
  const r = await fetch(`http://${host}:${t.puerto}/buscar?q=${encodeURIComponent(q)}`, {
    headers: credencial ? { "x-comparador": credencial } : {}, signal: AbortSignal.timeout(20_000) });
  const d = await r.json().catch(() => null) as { ofertas?: OfertaTienda[]; cache?: boolean; error?: string } | null;
  if (!r.ok || !d?.ofertas) throw new Error(d?.error ?? `HTTP ${r.status}`);
  return { ofertas: d.ofertas, cache: Boolean(d.cache) };
}

// Genera los eventos en el orden en que responden las tiendas
export async function* buscarEnTiendas(q: string): AsyncGenerator<Evento> {
  const inicio = Date.now();
  const [tiendas, tasa] = await Promise.all([tiendasActivas(), tasaDelDia()]);
  const tasaUsd = tasa ? Number(tasa.usd) : null;
  yield { tipo: "inicio", consulta: q, tasa, tiendas: tiendas.map((t) => ({ id: t.id, nombre: t.nombre, rubros: t.rubros })) };
  const pendientes = new Map(tiendas.map((t) => {
    const desde = Date.now();
    const p: Promise<Evento> = preguntar(t, q).then(
      (r) => ({ tipo: "tienda", tienda: t.id, ofertas: r.ofertas.map((o) => convertir(t, o, tasaUsd)), ms: Date.now() - desde, cache: r.cache }),
      (e) => ({ tipo: "error", tienda: t.id, mensaje: (e as Error).name === "TimeoutError" ? "No respondió a tiempo" : "No disponible en este momento", ms: Date.now() - desde }));
    return [t.id, p] as const;
  }));
  while (pendientes.size) {
    const ev = await Promise.race([...pendientes].map(([id, p]) => p.then((e) => ({ id, e }))));
    pendientes.delete(ev.id);
    yield ev.e;
  }
  yield { tipo: "fin", ms: Date.now() - inicio };
}

export async function registrarBusqueda(b: { termino: string; origen: "web" | "api"; ofertas: number; grupos: number; ok: number; errores: number; ms: number }) {
  await consulta(`INSERT INTO comparador.busqueda (termino, origen, ofertas, grupos, tiendas_ok, tiendas_error, duracion_ms) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [b.termino.slice(0, 100), b.origen, b.ofertas, b.grupos, b.ok, b.errores, b.ms]).catch(() => {});
}
