// Lectura del noticiero: lee todas las fuentes activas, guarda los titulares nuevos y actualiza los que cambiaron
// (título, resumen o imagen). La usan noticias-programador (cada hora), el panel ("Leer ahora") y la consola.
import { createHash } from "node:crypto";
import { consulta, pool } from "../../core/db.ts";
import { imagenDelArticulo, leerFuente, leerWorldNews, type Entrada, type Fuente } from "./lectores.ts";

const IMAGENES_POR_FUENTE = 6;      // descargas de og:image por fuente y lectura (solo titulares nuevos sin imagen)
const RETENCION_DIAS = 90;

export interface ResultadoFuente { leidos: number; nuevos: number; actualizados: number; error?: string }
export interface ResultadoLectura { estado: "hecha" | "en_curso"; id?: number; nuevos: number; actualizados: number; errores: number;
  fuentes: Record<string, ResultadoFuente>; cuota_worldnews?: number | null }

const huella = (e: Entrada) => createHash("sha256").update(`${e.titulo}\n${e.resumen ?? ""}\n${e.imagen ?? ""}`).digest("hex");

async function completarImagenes(entradas: Entrada[]) {
  const sin = entradas.filter((e) => !e.imagen);
  if (!sin.length) return;
  const previas = new Map((await consulta<{ url: string; imagen: string | null; imagen_buscada: boolean }>(
    "SELECT url, imagen, imagen_buscada FROM noticias.articulo WHERE url = ANY($1)", [sin.map((e) => e.url)])).map((r) => [r.url, r]));
  const buscadas: string[] = [];
  let descargas = 0;
  for (const e of sin) {
    const p = previas.get(e.url);
    if (p?.imagen) { e.imagen = p.imagen; continue; }
    if (p?.imagen_buscada || descargas++ >= IMAGENES_POR_FUENTE) continue;   // las que faltan, en la próxima lectura
    e.imagen = await imagenDelArticulo(e.url);
    if (p && !e.imagen) buscadas.push(e.url);
    (e as Entrada & { buscada?: boolean }).buscada = true;
  }
  if (buscadas.length) await consulta("UPDATE noticias.articulo SET imagen_buscada = true WHERE url = ANY($1)", [buscadas]);
}

async function guardar(f: Fuente, entradas: Entrada[]): Promise<ResultadoFuente> {
  const unicas = [...new Map(entradas.map((e) => [e.url, e])).values()];
  await completarImagenes(unicas);
  let nuevos = 0, actualizados = 0;
  for (const e of unicas) {
    const [r] = await consulta<{ nuevo: boolean }>(
      `INSERT INTO noticias.articulo (fuente_id, url, titulo, resumen, imagen, autor, categoria, publicado_en, huella, imagen_buscada)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (url) DO UPDATE SET titulo = EXCLUDED.titulo, resumen = EXCLUDED.resumen, imagen = EXCLUDED.imagen,
              autor = EXCLUDED.autor, categoria = EXCLUDED.categoria, huella = EXCLUDED.huella, actualizado_en = now(),
              imagen_buscada = noticias.articulo.imagen_buscada OR EXCLUDED.imagen_buscada
        WHERE noticias.articulo.huella <> EXCLUDED.huella
       RETURNING (xmax = 0) AS nuevo`,
      [f.id, e.url, e.titulo, e.resumen, e.imagen, e.autor, e.categoria, e.publicado_en, huella(e), Boolean((e as Entrada & { buscada?: boolean }).buscada)]);
    if (r) { if (r.nuevo) nuevos++; else actualizados++; }
  }
  return { leidos: unicas.length, nuevos, actualizados };
}

async function marcarFuente(id: string, error?: string) {
  await consulta(
    error
      ? "UPDATE noticias.fuente SET ultima_lectura = now(), ultimo_error = $2, errores_seguidos = errores_seguidos + 1 WHERE id = $1"
      : "UPDATE noticias.fuente SET ultima_lectura = now(), ultimo_exito = now(), ultimo_error = NULL, errores_seguidos = 0 WHERE id = $1",
    error ? [id, error.slice(0, 500)] : [id]);
}

export async function recolectar(origen: string, soloFuente?: string): Promise<ResultadoLectura> {
  // Una sola lectura a la vez (programador y panel): cerrojo de sesión de PostgreSQL
  const c = await pool().connect();
  try {
    const { rows: [l] } = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtext('noticias.recolectar')) AS ok");
    if (!l.ok) return { estado: "en_curso", nuevos: 0, actualizados: 0, errores: 0, fuentes: {} };
    try { return await leerTodo(origen, soloFuente); }
    finally { await c.query("SELECT pg_advisory_unlock(hashtext('noticias.recolectar'))"); }
  } finally { c.release(); }
}

async function leerTodo(origen: string, soloFuente?: string): Promise<ResultadoLectura> {
  const fuentes = await consulta<Fuente>(
    "SELECT id, nombre, sitio, metodo, url_lectura FROM noticias.fuente WHERE activa AND ($1::text IS NULL OR id = $1) ORDER BY orden", [soloFuente ?? null]);
  const [{ id }] = await consulta<{ id: number }>("INSERT INTO noticias.lectura (origen) VALUES ($1) RETURNING id", [origen]);
  const resultado: ResultadoLectura = { estado: "hecha", id, nuevos: 0, actualizados: 0, errores: 0, fuentes: {} };
  const anotar = async (f: Fuente, trabajo: () => Promise<Entrada[]>) => {
    try {
      const r = await guardar(f, await trabajo());
      resultado.fuentes[f.id] = r;
      await marcarFuente(f.id);
    } catch (e) {
      const error = (e as Error).name === "TimeoutError" ? "Tiempo de espera agotado" : (e as Error).message;
      resultado.fuentes[f.id] = { leidos: 0, nuevos: 0, actualizados: 0, error };
      await marcarFuente(f.id, error);
    }
  };

  const directas = fuentes.filter((f) => f.metodo !== "worldnews");
  const api = fuentes.filter((f) => f.metodo === "worldnews");
  const tareas = directas.map((f) => anotar(f, () => leerFuente(f)));
  if (api.length) {
    const clave = process.env.WORLDNEWS_API_KEY ?? "";
    const lectura = clave ? leerWorldNews(api, clave) : Promise.reject(new Error("Falta WORLDNEWS_API_KEY en el entorno"));
    lectura.then((r) => { resultado.cuota_worldnews = r.cuotaRestante; }, () => {});
    tareas.push(...api.map((f) => anotar(f, async () => (await lectura).porFuente.get(f.id) ?? [])));
  }
  await Promise.all(tareas);

  for (const r of Object.values(resultado.fuentes)) {
    resultado.nuevos += r.nuevos; resultado.actualizados += r.actualizados; if (r.error) resultado.errores++;
  }
  await consulta("UPDATE noticias.lectura SET terminada = now(), nuevos = $2, actualizados = $3, errores = $4, detalle = $5 WHERE id = $1",
    [id, resultado.nuevos, resultado.actualizados, resultado.errores, { fuentes: resultado.fuentes, cuota_worldnews: resultado.cuota_worldnews ?? null }]);
  await consulta(`DELETE FROM noticias.articulo WHERE publicado_en < now() - make_interval(days => $1)`, [RETENCION_DIAS]);
  await consulta(`DELETE FROM noticias.lectura WHERE iniciada < now() - make_interval(days => $1)`, [RETENCION_DIAS]);
  return resultado;
}
