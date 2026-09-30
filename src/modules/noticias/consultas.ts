// Consultas del noticiero para la portada, la página /noticias y la API (GET /api/v1/noticias)
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";

export interface Titular { id: number; fuente: string; fuente_nombre: string; url: string; titulo: string; resumen: string | null;
  imagen: string | null; autor: string | null; categoria: string | null; publicado_en: string }

const COLUMNAS = `a.id::int AS id, a.fuente_id AS fuente, f.nombre AS fuente_nombre, a.url, a.titulo, a.resumen, a.imagen, a.autor, a.categoria,
  a.publicado_en::text AS publicado_en`;

export async function ultimaLectura(): Promise<string | null> {
  const [r] = await consulta<{ t: string | null }>("SELECT max(terminada)::text AS t FROM noticias.lectura");
  return r?.t ?? null;
}

// Portada: el titular principal (el más reciente con imagen) y los siguientes de otros medios, sin repetir medio
// mientras se pueda. Solo titulares de las últimas 48 horas.
export async function titularesPortada(cuantos = 5): Promise<Titular[]> {
  const recientes = await consulta<Titular & Record<string, unknown>>(
    `SELECT ${COLUMNAS} FROM noticias.articulo a JOIN noticias.fuente f ON f.id = a.fuente_id
      WHERE a.visible AND f.activa AND a.publicado_en > now() - interval '48 hours' ORDER BY a.publicado_en DESC LIMIT 200`);
  const elegidos: Titular[] = [];
  const principal = recientes.find((t) => t.imagen) ?? recientes[0];
  if (!principal) return [];
  elegidos.push(principal);
  const usados = new Set([principal.fuente]);
  for (const vuelta of [0, 1]) {                   // primero un titular por medio; si faltan, se repiten medios
    for (const t of recientes) {
      if (elegidos.length >= cuantos) break;
      if (elegidos.includes(t) || (vuelta === 0 && usados.has(t.fuente))) continue;
      elegidos.push(t); usados.add(t.fuente);
    }
  }
  return elegidos;
}

export async function titulares(o: { limite?: number; fuente?: string | null; q?: string | null; desde?: string | null; pagina?: number }): Promise<{ total: number; titulares: Titular[] }> {
  const limite = Math.min(Math.max(o.limite ?? 20, 1), 100), pagina = Math.max(o.pagina ?? 1, 1);
  const filtros = `a.visible AND f.activa AND ($1::text IS NULL OR a.fuente_id = $1) AND ($2::text IS NULL OR a.titulo ILIKE '%' || $2 || '%' OR a.resumen ILIKE '%' || $2 || '%')
    AND ($3::timestamptz IS NULL OR a.publicado_en >= $3)`;
  const p = [o.fuente ?? null, o.q?.trim() ? o.q.trim().slice(0, 100) : null, o.desde ?? null];
  const [[{ n }], filas] = await Promise.all([
    consulta<{ n: string }>(`SELECT count(*) AS n FROM noticias.articulo a JOIN noticias.fuente f ON f.id = a.fuente_id WHERE ${filtros}`, p),
    consulta<Titular & Record<string, unknown>>(
      `SELECT ${COLUMNAS} FROM noticias.articulo a JOIN noticias.fuente f ON f.id = a.fuente_id WHERE ${filtros}
        ORDER BY a.publicado_en DESC LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`, p),
  ]);
  return { total: Number(n), titulares: filas };
}

export async function fuentes() {
  return consulta<{ id: string; nombre: string; sitio: string; activa: boolean; ultimo_exito: string | null; titulares_24h: number }>(
    `SELECT f.id, f.nombre, f.sitio, f.activa, f.ultimo_exito::text,
            (SELECT count(*)::int FROM noticias.articulo a WHERE a.fuente_id = f.id AND a.visible AND a.publicado_en > now() - interval '24 hours') AS titulares_24h
       FROM noticias.fuente f ORDER BY f.orden`);
}

// API: GET /api/v1/noticias
export async function consultaApi(p: URLSearchParams) {
  const limite = p.get("limite") ? Number(p.get("limite")) : 20;
  if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new ErrorApi(400, "parametro_invalido", "'limite' debe ser un entero entre 1 y 100");
  const pagina = p.get("pagina") ? Number(p.get("pagina")) : 1;
  if (!Number.isInteger(pagina) || pagina < 1 || pagina > 1000) throw new ErrorApi(400, "parametro_invalido", "'pagina' debe ser un entero positivo");
  const fuente = p.get("fuente");
  if (fuente && !/^[a-z0-9-]{1,40}$/.test(fuente)) throw new ErrorApi(400, "parametro_invalido", "'fuente' no es un identificador válido (ver /api/v1/noticias/fuentes)");
  const desde = p.get("desde");
  if (desde && Number.isNaN(Date.parse(desde))) throw new ErrorApi(400, "parametro_invalido", "'desde' debe ser una fecha ISO 8601 (AAAA-MM-DD o AAAA-MM-DDTHH:MM:SSZ)");
  const [r, actualizado] = await Promise.all([titulares({ limite, pagina, fuente, q: p.get("q"), desde }), ultimaLectura()]);
  return { actualizado, total: r.total, pagina, limite, noticias: r.titulares };
}
