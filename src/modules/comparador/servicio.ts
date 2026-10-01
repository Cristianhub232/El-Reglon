// Servicio de una tienda (un proceso por tienda bajo PM2, docs/22). Responde GET /buscar?q= con las ofertas de la
// tienda en su moneda y GET /salud. Cuida a la tienda: caché de 15 min por término, como mucho 2 consultas a la vez
// y una consulta repetida en curso se comparte. Lo que llega se guarda en segundo plano (producto e historial de precio).
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { consulta } from "../../core/db.ts";
import { buscarEnTienda } from "./adaptadores/index.ts";
import type { OfertaTienda } from "./adaptadores/tipos.ts";
import { basico, ean } from "./normalizar.ts";
import { sedeDe, type Tienda } from "./tiendas.ts";

const CACHE_MS = 15 * 60_000, CACHE_MAX = 500, EN_PARALELO = 2;

// Credencial interna entre la app y los servicios (derivada de APP_SECRETO; sin él, no se exige: uso local)
export function credencialInterna(): string | null {
  const s = process.env.APP_SECRETO ?? "";
  return s.length >= 32 ? createHash("sha256").update(`comparador:${s}`).digest("hex") : null;
}

// Registra la tienda y sus sedes. Devuelve el id de sucursal por clave ("" = la tienda en línea, sin sede)
export async function registrarTienda(t: Tienda): Promise<Map<string, number>> {
  await consulta(
    `INSERT INTO comparador.tienda (id, nombre, sitio, plataforma, moneda, rubros) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET nombre = $2, sitio = $3, plataforma = $4, moneda = $5, rubros = $6`,
    [t.id, t.nombre, t.sitio, t.plataforma, t.moneda, t.rubros]);
  const sedes = [{ clave: null as string | null, nombre: t.ubicacion ? `Tienda en línea (${t.ubicacion.ciudad})` : "Tienda en línea",
    ciudad: t.ubicacion?.ciudad ?? null, estado: t.ubicacion?.estado ?? null },
    ...(t.sucursales ?? []).map((s) => ({ clave: s.clave as string | null, nombre: s.nombre, ciudad: s.ciudad ?? null, estado: s.estado ?? null }))];
  const ids = new Map<string, number>();
  for (const s of sedes) {
    const [f] = await consulta<{ id: number }>(
      `INSERT INTO comparador.sucursal (tienda_id, nombre, clave, ciudad, estado) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tienda_id, coalesce(clave, '')) DO UPDATE SET nombre = $2, ciudad = $4, estado = $5 RETURNING id`,
      [t.id, s.nombre, s.clave, s.ciudad, s.estado]);
    ids.set(s.clave ?? "", f.id);
  }
  return ids;
}

async function guardar(sucursal: number, t: Tienda, ofertas: OfertaTienda[]) {
  for (const o of ofertas) {
    const [p] = await consulta<{ id: string }>(
      `INSERT INTO comparador.producto (sucursal_id, id_externo, nombre, marca, ean, url, imagen) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (sucursal_id, id_externo) DO UPDATE SET nombre = $3, marca = $4, ean = $5, url = $6, imagen = $7, visto_ultimo = now()
       RETURNING id`,
      [sucursal, o.id_externo, o.nombre.slice(0, 300), o.marca, ean(o.ean), o.url, o.imagen?.startsWith("https://") ? o.imagen : null]);
    // Nueva fila de historial solo si cambió el precio o la existencia, o si la última tiene más de un día
    await consulta(
      `INSERT INTO comparador.precio (producto_id, precio, precio_lista, moneda, disponible)
       SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (
         SELECT 1 FROM (SELECT precio, disponible, observado_en FROM comparador.precio WHERE producto_id = $1 ORDER BY observado_en DESC LIMIT 1) u
          WHERE u.precio = $2::numeric AND u.disponible = $5 AND u.observado_en > now() - interval '1 day')`,
      [p.id, o.precio, o.precio_lista, t.moneda, o.disponible]);
  }
}

export function iniciarServicio(t: Tienda, opciones: { puerto: number; escucha: string }) {
  const cache = new Map<string, { hasta: number; ofertas: OfertaTienda[] }>();
  const enCurso = new Map<string, Promise<OfertaTienda[]>>();
  let activas = 0;
  const cola: (() => void)[] = [];
  const credencial = credencialInterna();
  let sucursales = new Map<string, number>();
  registrarTienda(t).then((ids) => { sucursales = ids; }, (e) => console.error(`[comparador:${t.id}] no se pudo registrar la tienda: ${(e as Error).message}`));

  const turno = () => new Promise<void>((r) => { if (activas < EN_PARALELO) { activas++; r(); } else cola.push(() => { activas++; r(); }); });
  const liberar = () => { activas--; cola.shift()?.(); };

  async function buscar(q: string, sede: string | null): Promise<{ ofertas: OfertaTienda[]; cache: boolean }> {
    const clave = `${sede ?? ""}|${basico(q)}`;
    const c = cache.get(clave);
    if (c && c.hasta > Date.now()) return { ofertas: c.ofertas, cache: true };
    let promesa = enCurso.get(clave);
    if (!promesa) {
      promesa = (async () => {
        await turno();
        try { return await buscarEnTienda(t, q, 24, sede); } finally { liberar(); }
      })();
      enCurso.set(clave, promesa);
      promesa.finally(() => enCurso.delete(clave)).catch(() => {});
    }
    try {
      const ofertas = await promesa;
      cache.set(clave, { hasta: Date.now() + CACHE_MS, ofertas });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      void consulta("UPDATE comparador.tienda SET ultima_respuesta = now(), errores_seguidos = 0 WHERE id = $1", [t.id]).catch(() => {});
      const sucursal = sucursales.get(sede ?? "");
      if (sucursal !== undefined) void guardar(sucursal, t, ofertas).catch((e) => console.error(`[comparador:${t.id}] guardar: ${(e as Error).message}`));
      return { ofertas, cache: false };
    } catch (e) {
      const mensaje = (e as Error).name === "TimeoutError" ? "Tiempo de espera agotado" : (e as Error).message;
      void consulta("UPDATE comparador.tienda SET ultimo_error = $2, ultimo_error_en = now(), errores_seguidos = errores_seguidos + 1 WHERE id = $1",
        [t.id, mensaje.slice(0, 300)]).catch(() => {});
      throw new Error(mensaje);
    }
  }

  const responder = (res: ServerResponse, estado: number, cuerpo: unknown) => {
    res.writeHead(estado, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(cuerpo));
  };
  const autorizado = (req: IncomingMessage) => {
    if (!credencial) return true;
    const h = String(req.headers["x-comparador"] ?? "");
    return h.length === credencial.length && timingSafeEqual(Buffer.from(h), Buffer.from(credencial));
  };

  const servidor = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://servicio");
    if (req.method !== "GET") return responder(res, 405, { error: "metodo_no_permitido" });
    if (url.pathname === "/salud") return responder(res, 200, { ok: true, tienda: t.id, cache: cache.size, en_curso: activas + cola.length });
    if (!autorizado(req)) return responder(res, 401, { error: "no_autorizado" });
    if (url.pathname !== "/buscar") return responder(res, 404, { error: "no_encontrado" });
    const q = (url.searchParams.get("q") ?? "").trim();
    if (q.length < 2 || q.length > 100) return responder(res, 400, { error: "consulta_invalida" });
    const sede = sedeDe(t, url.searchParams.get("sucursal"));
    const inicio = Date.now();
    try {
      const r = await buscar(q, sede?.clave ?? null);
      responder(res, 200, { tienda: t.id, sucursal: sede ? { clave: sede.clave, nombre: sede.nombre } : null, ofertas: r.ofertas, cache: r.cache, ms: Date.now() - inicio });
    } catch (e) {
      responder(res, 502, { tienda: t.id, error: (e as Error).message, ms: Date.now() - inicio });
    }
  });
  servidor.on("error", (e) => { console.error(`[comparador:${t.id}] ${(e as Error).message}`); process.exit(1); });
  servidor.listen(opciones.puerto, opciones.escucha, () => console.log(`[comparador:${t.id}] escuchando en ${opciones.escucha}:${opciones.puerto}`));
  return servidor;
}
