// Lectura del Pulso oficial: guarda las publicaciones nuevas de cada cuenta activa con su imagen (descargada una
// vez y servida desde /api/publico/pulso/imagen/[id]). La ejecuta noticias-programador cada hora y el panel.
import { consulta } from "../../core/db.ts";
import { bajar, detalleBcv, leerBcvPrensa, leerInstagram, leerRss, type Cuenta, type Publicacion } from "./lectores.ts";

const TIPOS = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const IMAGENES_GUARDADAS = 10;      // por cuenta; las más viejas conservan el texto pero no la imagen

export interface ResultadoPulso { nuevas: number; errores: number; cuentas: Record<string, { leidas: number; nuevas: number; error?: string }> }

export function credencialInstagram() {
  const usuarioId = process.env.INSTAGRAM_USUARIO_ID ?? "", token = process.env.INSTAGRAM_TOKEN ?? "";
  return usuarioId && token ? { usuarioId, token } : null;
}

async function imagen(url: string | null): Promise<{ bytes: Buffer; tipo: string } | null> {
  if (!url || !url.startsWith("https://")) return null;
  try {
    const r = await bajar(url, { maxBytes: 3_000_000, espera: 20_000 });
    const tipo = r.tipo.split(";")[0].trim().toLowerCase();
    return r.estado === 200 && TIPOS.has(tipo) && r.cuerpo.length > 0 ? { bytes: r.cuerpo, tipo } : null;
  } catch { return null; }
}

async function guardar(c: Cuenta, pubs: Publicacion[]): Promise<number> {
  const existentes = new Set((await consulta<{ id_externo: string }>(
    "SELECT id_externo FROM noticias.pulso_publicacion WHERE cuenta_id = $1 AND id_externo = ANY($2)", [c.id, pubs.map((p) => p.id_externo)])).map((r) => r.id_externo));
  let nuevas = 0;
  for (const p of pubs) {
    if (existentes.has(p.id_externo)) continue;
    if (c.metodo === "bcv_prensa") Object.assign(p, await detalleBcv(p.url).catch(() => ({})));
    const img = await imagen(p.imagen);
    await consulta(
      `INSERT INTO noticias.pulso_publicacion (cuenta_id, id_externo, url, titulo, texto, imagen_origen, imagen, imagen_tipo, publicado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (cuenta_id, id_externo) DO NOTHING`,
      [c.id, p.id_externo, p.url, p.titulo, p.texto, p.imagen, img?.bytes ?? null, img?.tipo ?? null, p.publicado_en]);
    nuevas++;
  }
  // Solo las IMAGENES_GUARDADAS más recientes de la cuenta conservan su imagen
  await consulta(`UPDATE noticias.pulso_publicacion SET imagen = NULL WHERE cuenta_id = $1 AND imagen IS NOT NULL AND id NOT IN (
                    SELECT id FROM noticias.pulso_publicacion WHERE cuenta_id = $1 ORDER BY publicado_en DESC LIMIT $2)`, [c.id, IMAGENES_GUARDADAS]);
  return nuevas;
}

export async function recolectarPulso(soloCuenta?: string): Promise<ResultadoPulso> {
  const cuentas = await consulta<Cuenta>(
    "SELECT id, ente, metodo, usuario, url_lectura, sitio FROM noticias.pulso_cuenta WHERE activa AND ($1::text IS NULL OR id = $1) ORDER BY orden", [soloCuenta ?? null]);
  const cred = credencialInstagram();
  const resultado: ResultadoPulso = { nuevas: 0, errores: 0, cuentas: {} };
  await Promise.all(cuentas.map(async (c) => {
    try {
      if (c.metodo === "instagram" && !cred) throw new Error("Falta configurar la API de Instagram (INSTAGRAM_USUARIO_ID e INSTAGRAM_TOKEN)");
      const pubs = c.metodo === "instagram" ? await leerInstagram(c, cred!) : c.metodo === "rss" ? await leerRss(c) : await leerBcvPrensa(c);
      const nuevas = await guardar(c, pubs);
      resultado.cuentas[c.id] = { leidas: pubs.length, nuevas };
      resultado.nuevas += nuevas;
      await consulta("UPDATE noticias.pulso_cuenta SET ultima_lectura = now(), ultimo_exito = now(), ultimo_error = NULL WHERE id = $1", [c.id]);
    } catch (e) {
      const error = ((e as Error).message || "Error desconocido").slice(0, 500);
      resultado.cuentas[c.id] = { leidas: 0, nuevas: 0, error };
      resultado.errores++;
      await consulta("UPDATE noticias.pulso_cuenta SET ultima_lectura = now(), ultimo_error = $2 WHERE id = $1", [c.id, error]);
    }
  }));
  await consulta("DELETE FROM noticias.pulso_publicacion WHERE publicado_en < now() - interval '180 days'");
  return resultado;
}
