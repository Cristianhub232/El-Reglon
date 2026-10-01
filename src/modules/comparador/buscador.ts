// Búsqueda en todas las tiendas a la vez (lado de la app): pregunta a cada servicio y entrega cada respuesta en cuanto
// llega, con los precios convertidos a Bs. y US$ con la tasa BCV aplicable a hoy (art. 25 Ley IVA).
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { tasaAplicable } from "../bcv/consultas.ts";
import type { OfertaTienda } from "./adaptadores/tipos.ts";
import type { Oferta } from "./emparejar.ts";
import { credencialInterna } from "./servicio.ts";
import { sedeDe, TIENDAS, type Sede, type Tienda } from "./tiendas.ts";

export type Evento =
  | { tipo: "inicio"; consulta: string; tasa: { usd: string; fecha_valor: string } | null; tiendas: { id: string; nombre: string; rubros: string[]; sucursal: Sede | null }[] }
  | { tipo: "tienda"; tienda: string; sucursal: string | null; ofertas: Oferta[]; ms: number; cache: boolean; leyendo: number }
  | { tipo: "error"; tienda: string; mensaje: string; ms: number }
  | { tipo: "fin"; ms: number };

export async function tiendasActivas(): Promise<Tienda[]> {
  const pausadas = new Set((await consulta<{ id: string }>("SELECT id FROM comparador.tienda WHERE NOT activa").catch(() => [])).map((f) => f.id));
  return TIENDAS.filter((t) => !pausadas.has(t.id));
}

// Tasa aplicable a hoy; si el BCV todavía no publicó una con fecha valor de hoy (p. ej. de madrugada), la última
// publicada, como la portada. La fecha valor viaja con la respuesta para que se vea cuál se usó.
export async function tasaDelDia() {
  try {
    const t = await tasaAplicable(hoyCaracas(), "USD");
    return { usd: t.tasa_bs, fecha_valor: t.fecha_valor };
  } catch {
    const [u] = await consulta<{ venta_bs: string; fecha_valor: string }>(
      "SELECT venta_bs, fecha_valor::text FROM bcv.tasa WHERE moneda = 'USD' ORDER BY fecha_valor DESC LIMIT 1").catch(() => []);
    return u ? { usd: u.venta_bs, fecha_valor: u.fecha_valor } : null;
  }
}

const redondo = (x: number) => Math.round(x * 100) / 100;

export function convertir(t: Tienda, o: OfertaTienda, tasaUsd: number | null, sede: Sede | null = null): Oferta {
  const n = Number(o.precio);
  const bs = t.moneda === "VES" ? n : tasaUsd ? n * tasaUsd : NaN;
  const usd = t.moneda === "USD" ? n : tasaUsd ? n / tasaUsd : NaN;
  return { tienda: t.id, tienda_nombre: t.nombre, sucursal: t.ubicacion?.ciudad ?? (sede && sede.clave !== t.predeterminada ? sede.nombre : null), id_externo: o.id_externo, nombre: o.nombre, marca: o.marca, ean: o.ean, url: o.url,
    imagen: o.imagen, disponible: o.disponible, precio: o.precio, moneda: t.moneda, precio_bs: redondo(bs), precio_usd: redondo(usd), leido_en: o.leido_en ?? null };
}

async function preguntar(t: Tienda, q: string, sede: Sede | null): Promise<{ ofertas: OfertaTienda[]; cache: boolean; leyendo: number }> {
  const host = process.env.COMPARADOR_HOST ?? "127.0.0.1";
  const credencial = credencialInterna();
  const r = await fetch(`http://${host}:${t.puerto}/buscar?q=${encodeURIComponent(q)}${sede ? `&sucursal=${encodeURIComponent(sede.clave)}` : ""}`, {
    headers: credencial ? { "x-comparador": credencial } : {}, signal: AbortSignal.timeout(20_000) });
  const d = await r.json().catch(() => null) as { ofertas?: OfertaTienda[]; cache?: boolean; leyendo?: number; error?: string } | null;
  if (!r.ok || !d?.ofertas) throw new Error(d?.error ?? `HTTP ${r.status}`);
  return { ofertas: d.ofertas, cache: Boolean(d.cache), leyendo: d.leyendo ?? 0 };
}

// Sedes pedidas en la URL: sucursal.<tienda>=<clave> (p. ej. sucursal.centralmadeirense=Chacaito-07)
export function sedesPedidas(p: URLSearchParams): Record<string, string> {
  const salida: Record<string, string> = {};
  for (const [k, v] of p) if (/^sucursal\.[a-z0-9-]+$/.test(k) && /^[A-Za-z0-9-]{1,60}$/.test(v)) salida[k.slice(9)] = v;
  return salida;
}

// Genera los eventos en el orden en que responden las tiendas
export async function* buscarEnTiendas(q: string, pedidas: Record<string, string> = {}): AsyncGenerator<Evento> {
  const inicio = Date.now();
  const [tiendas, tasa] = await Promise.all([tiendasActivas(), tasaDelDia()]);
  const tasaUsd = tasa ? Number(tasa.usd) : null;
  const sedes = new Map(tiendas.map((t) => [t.id, sedeDe(t, pedidas[t.id])]));
  yield { tipo: "inicio", consulta: q, tasa, tiendas: tiendas.map((t) => ({ id: t.id, nombre: t.nombre, rubros: t.rubros, sucursal: sedes.get(t.id) ?? null })) };
  const pendientes = new Map(tiendas.map((t) => {
    const desde = Date.now(), sede = sedes.get(t.id) ?? null;
    const p: Promise<Evento> = preguntar(t, q, sede).then(
      (r) => ({ tipo: "tienda", tienda: t.id, sucursal: sede?.nombre ?? null, ofertas: r.ofertas.map((o) => convertir(t, o, tasaUsd, sede)), ms: Date.now() - desde, cache: r.cache, leyendo: r.leyendo }),
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
