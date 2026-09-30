// Consultas del Pulso oficial para el carrusel de la portada
import { consulta } from "../../core/db.ts";

export interface PublicacionPulso { id: number; ente: string; ente_nombre: string; metodo: "instagram" | "rss" | "bcv_prensa"; usuario: string | null; sitio: string;
  url: string; titulo: string; texto: string | null; con_imagen: boolean; publicado_en: string }

// Hasta `cuantas` publicaciones de los últimos 30 días: primero la más reciente de cada ente (para que todos
// aparezcan) y luego las demás por fecha
export async function pulsoPortada(cuantas = 5): Promise<PublicacionPulso[]> {
  const filas = await consulta<PublicacionPulso & Record<string, unknown>>(
    `SELECT p.id::int, c.ente, c.ente_nombre, c.metodo, c.usuario, c.sitio, p.url, p.titulo, p.texto, p.imagen IS NOT NULL AS con_imagen, p.publicado_en::text
       FROM noticias.pulso_publicacion p JOIN noticias.pulso_cuenta c ON c.id = p.cuenta_id
      WHERE p.visible AND c.activa AND p.publicado_en > now() - interval '30 days'
      ORDER BY p.publicado_en DESC LIMIT 60`);
  const elegidas: PublicacionPulso[] = [];
  const entes = new Set<string>();
  for (const f of filas) if (!entes.has(f.ente) && elegidas.length < cuantas) { entes.add(f.ente); elegidas.push(f); }
  for (const f of filas) if (elegidas.length < cuantas && !elegidas.includes(f)) elegidas.push(f);
  return elegidas.sort((a, b) => b.publicado_en.localeCompare(a.publicado_en));
}

export async function imagenPulso(id: number) {
  const [f] = await consulta<{ imagen: Buffer | null; imagen_tipo: string | null }>(
    `SELECT p.imagen, p.imagen_tipo FROM noticias.pulso_publicacion p JOIN noticias.pulso_cuenta c ON c.id = p.cuenta_id
      WHERE p.id = $1 AND p.visible AND c.activa`, [id]);
  return f?.imagen && f.imagen_tipo ? f : null;
}
