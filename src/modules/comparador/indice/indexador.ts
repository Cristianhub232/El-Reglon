// Recorrido lento de una tienda por índice (docs/22): lee su sitemap (una vez al día) y después, una a una y sin
// prisa, sus páginas de producto, de la que lleva más tiempo sin leerse a la más reciente. Antes de cada página
// comprueba su robots.txt; respeta su Crawl-delay; si la tienda responde 429, 403 o 5xx, espera cada vez más.
import { consulta } from "../../../core/db.ts";
import type { OfertaTienda } from "../adaptadores/tipos.ts";
import { basico, ean as eanValido, palabras } from "../normalizar.ts";
import type { Tienda } from "../tiendas.ts";
import { leerFarmahorro, leerFarmatodo, leerGama, leerPlanSuarez, leerSchemaOrg, type LectorPagina } from "./paginas.ts";
import { interpretarRobots, type Robots } from "./robots.ts";
import { urlsDeSitemap } from "./sitemap.ts";

const DIA = 86_400_000;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const LECTORES: Record<string, LectorPagina> = { farmatodo: leerFarmatodo, plansuarez: leerPlanSuarez, farmahorro: leerFarmahorro, epa: leerSchemaOrg };

// Qué descargar por cada página: la página misma o, en Gama, su API pública de producto
function fuenteDe(t: Tienda, url: string): string {
  if (t.plataforma === "gama") {
    const codigo = /\/p\/(\d+)/.exec(url)?.[1];
    if (!codigo || !t.api) throw new Error("URL de producto sin código");
    return `${t.api}/products/${codigo}?fields=DEFAULT,images(DEFAULT)`;
  }
  return url;
}

async function guardarProducto(sucursal: number, t: Tienda, o: OfertaTienda): Promise<number> {
  const [p] = await consulta<{ id: number }>(
    `INSERT INTO comparador.producto (sucursal_id, id_externo, nombre, marca, ean, url, imagen, nombre_busqueda, leido_en)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (sucursal_id, id_externo) DO UPDATE SET nombre = $3, marca = $4, ean = $5, url = $6, imagen = $7, nombre_busqueda = $8,
       leido_en = now(), visto_ultimo = now()
     RETURNING id::int`,
    [sucursal, o.id_externo, o.nombre.slice(0, 300), o.marca, eanValido(o.ean), o.url, o.imagen, basico(`${o.marca ?? ""} ${o.nombre}`)]);
  await consulta(
    `INSERT INTO comparador.precio (producto_id, precio, precio_lista, moneda, disponible)
     SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (
       SELECT 1 FROM (SELECT precio, disponible, observado_en FROM comparador.precio WHERE producto_id = $1 ORDER BY observado_en DESC LIMIT 1) u
        WHERE u.precio = $2::numeric AND u.disponible = $5 AND u.observado_en > now() - interval '1 day')`,
    [p.id, o.precio, o.precio_lista, t.moneda, o.disponible]);
  return p.id;
}

export function iniciarIndice(t: Tienda, sucursal: () => number | undefined, agente: string) {
  if (!t.indice) throw new Error("La tienda no tiene configuración de índice");
  const cfg = t.indice;
  let robots: Robots | null = null, robotsLeido = 0, espera = 0;

  async function leerRobots() {
    const r = await fetch(new URL("/robots.txt", t.sitio), { headers: { "User-Agent": agente }, signal: AbortSignal.timeout(20_000) });
    // Sin robots.txt (404) todo está permitido; si falla de otra forma, no se lee nada hasta poder comprobarlo
    if (r.status === 404) robots = interpretarRobots("", agente);
    else if (r.ok) robots = interpretarRobots(await r.text(), agente);
    else throw new Error(`robots.txt: HTTP ${r.status}`);
    robotsLeido = Date.now();
  }

  async function refrescarSitemap() {
    const [e] = await consulta<{ leido: string | null }>("SELECT sitemap_leido_en::text AS leido FROM comparador.indice_estado WHERE tienda_id = $1", [t.id]);
    if (e?.leido && Date.now() - Date.parse(e.leido) < DIA) return;
    const urls = await urlsDeSitemap(cfg.sitemap, agente, new RegExp(cfg.patron));
    if (urls.length === 0) throw new Error("El sitemap no trajo páginas de producto");
    await consulta("UPDATE comparador.indice_url SET en_sitemap = false WHERE tienda_id = $1", [t.id]);
    for (let i = 0; i < urls.length; i += 1000) {
      await consulta(`INSERT INTO comparador.indice_url (tienda_id, url) SELECT $1, unnest($2::text[])
                      ON CONFLICT (tienda_id, url) DO UPDATE SET en_sitemap = true`, [t.id, urls.slice(i, i + 1000)]);
    }
    await consulta(`INSERT INTO comparador.indice_estado (tienda_id, sitemap_leido_en, urls) VALUES ($1, now(), $2)
                    ON CONFLICT (tienda_id) DO UPDATE SET sitemap_leido_en = now(), urls = $2`, [t.id, urls.length]);
    console.log(`[comparador:${t.id}] sitemap: ${urls.length} páginas de producto`);
  }

  async function leerUna(): Promise<boolean> {
    const [f] = await consulta<{ url: string }>(
      `SELECT url FROM comparador.indice_url WHERE tienda_id = $1 AND en_sitemap AND coalesce(estado, '') <> 'robots'
        ORDER BY prioridad DESC NULLS LAST, ultimo_intento NULLS FIRST LIMIT 1`, [t.id]);
    if (!f) return false;
    const marcar = (estado: string, productoId: number | null = null) => consulta(
      `UPDATE comparador.indice_url SET ultimo_intento = now(), estado = $3, producto_id = coalesce($4, producto_id), prioridad = NULL,
         ultimo_ok = CASE WHEN $3 = 'ok' THEN now() ELSE ultimo_ok END WHERE tienda_id = $1 AND url = $2`, [t.id, f.url, estado.slice(0, 200), productoId]);
    const u = new URL(f.url);
    if (!robots!.permitido(u.pathname + u.search)) { await marcar("robots"); return true; }
    // "cookie": la sede que se lee en tiendas que cambian de sede entre peticiones (EPA: store=t6, Caracas)
    const r = await fetch(fuenteDe(t, f.url), { headers: { "User-Agent": agente, Accept: "text/html,application/json", ...(cfg.cookie ? { Cookie: cfg.cookie } : {}) },
      signal: AbortSignal.timeout(30_000) });
    if (r.status === 429 || r.status === 403 || r.status >= 500) { await marcar(`error: HTTP ${r.status}`); throw new Error(`La tienda respondió HTTP ${r.status}`); }
    if (r.status === 404 || r.status === 410) { await marcar("http_404"); return true; }
    if (!r.ok) { await marcar(`error: HTTP ${r.status}`); return true; }
    const cuerpo = await r.text();
    const oferta = t.plataforma === "gama" ? leerGama(t, f.url, cuerpo) : LECTORES[t.plataforma]?.(t, f.url, cuerpo) ?? null;
    const s = sucursal();
    if (!oferta || s === undefined) { await marcar("sin_datos"); return true; }
    await marcar("ok", await guardarProducto(s, t, oferta));
    return true;
  }

  async function ciclo(): Promise<never> {
    for (;;) {
      try {
        const [act] = await consulta<{ activa: boolean }>("SELECT activa FROM comparador.tienda WHERE id = $1", [t.id]).catch(() => []);
        if (act && !act.activa) { await esperar(60_000); continue; }
        if (!robots || Date.now() - robotsLeido > DIA) await leerRobots();
        await refrescarSitemap();
        const pausa = Math.max(cfg.pausa_ms, robots!.pausaMs ?? 0);
        await consulta(`INSERT INTO comparador.indice_estado (tienda_id, pausa_ms) VALUES ($1, $2)
                        ON CONFLICT (tienda_id) DO UPDATE SET pausa_ms = $2, errores_seguidos = 0, en_espera_hasta = NULL`, [t.id, pausa])
          .catch(() => {});
        const hubo = await leerUna();
        espera = 0;
        await esperar(hubo ? pausa : 10 * 60_000);
      } catch (e) {
        // Espera creciente: 1, 2, 4… minutos, hasta 1 hora
        espera = Math.min(espera ? espera * 2 : 60_000, 3_600_000);
        const mensaje = ((e as Error).name === "TimeoutError" ? "Tiempo de espera agotado" : (e as Error).message).slice(0, 300);
        console.error(`[comparador:${t.id}] índice: ${mensaje} (espera ${Math.round(espera / 60_000)} min)`);
        await consulta(`INSERT INTO comparador.indice_estado (tienda_id, errores_seguidos, ultimo_error, en_espera_hasta) VALUES ($1, 1, $2, now() + make_interval(secs => $3))
                        ON CONFLICT (tienda_id) DO UPDATE SET errores_seguidos = comparador.indice_estado.errores_seguidos + 1, ultimo_error = $2,
                          en_espera_hasta = now() + make_interval(secs => $3)`, [t.id, mensaje, espera / 1000]).catch(() => {});
        await esperar(espera);
      }
    }
  }
  void ciclo();
}

// Lo buscado pasa al frente de la fila: páginas cuya URL contiene todas las palabras y que no se han leído en las
// últimas 6 horas (como mucho 15 por búsqueda). Devuelve cuántas quedan en la fila con prioridad.
export async function priorizar(t: Tienda, q: string): Promise<number> {
  if (!t.indice?.slug) return 0;
  const ws = palabras(q).filter((w) => w.length >= 3).slice(0, 6);
  if (!ws.length) return 0;
  await consulta(
    `UPDATE comparador.indice_url SET prioridad = now() WHERE (tienda_id, url) IN (
       SELECT tienda_id, url FROM comparador.indice_url
        WHERE tienda_id = $1 AND en_sitemap AND coalesce(estado, '') <> 'robots' AND lower(url) LIKE ALL ($2::text[])
          AND (ultimo_ok IS NULL OR ultimo_ok < now() - interval '6 hours') AND prioridad IS NULL
        ORDER BY ultimo_ok NULLS FIRST LIMIT 15)`, [t.id, ws.map((w) => `%${w}%`)]);
  const [f] = await consulta<{ n: number }>(
    `SELECT count(*)::int AS n FROM comparador.indice_url WHERE tienda_id = $1 AND prioridad IS NOT NULL AND lower(url) LIKE ALL ($2::text[])`,
    [t.id, ws.map((w) => `%${w}%`)]);
  return f.n;
}

// Búsqueda en el índice: todas las palabras (sin acentos, en cualquier orden), solo productos leídos en los
// últimos 3 días y con el último precio conocido. Devuelve también cuándo se leyó cada página.
export async function buscarEnIndice(t: Tienda, sucursal: number, q: string, limite = 24): Promise<(OfertaTienda & { leido_en: string })[]> {
  const ws = [...new Set([...palabras(q), ...basico(q).split(/\s+/).filter((w) => /^\d{2,}$/.test(w))])].slice(0, 8);
  if (!ws.length) return [];
  const filas = await consulta<{ id_externo: string; nombre: string; marca: string | null; ean: string | null; url: string; imagen: string | null;
    precio: string; precio_lista: string | null; disponible: boolean; leido_en: string }>(
    `SELECT p.id_externo, p.nombre, p.marca, p.ean, p.url, p.imagen, pr.precio::text, pr.precio_lista::text, pr.disponible, p.leido_en::text
       FROM comparador.producto p
       JOIN LATERAL (SELECT precio, precio_lista, disponible FROM comparador.precio WHERE producto_id = p.id ORDER BY observado_en DESC LIMIT 1) pr ON true
      WHERE p.sucursal_id = $1 AND p.nombre_busqueda LIKE ALL ($2::text[]) AND p.leido_en > now() - interval '3 days'
      ORDER BY pr.disponible DESC, similarity(p.nombre_busqueda, $3) DESC, p.id
      LIMIT $4`,
    [sucursal, ws.map((w) => `%${w}%`), basico(q), limite]);
  return filas.map((f) => ({ id_externo: f.id_externo, nombre: f.nombre, marca: f.marca, ean: f.ean, url: f.url, imagen: f.imagen,
    precio: Number(f.precio).toFixed(2), precio_lista: f.precio_lista, disponible: f.disponible, leido_en: f.leido_en }));
}
