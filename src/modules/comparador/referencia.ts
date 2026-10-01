// Imagen de referencia para el clasificador de IVA: la foto de un producto que el comparador ya vio en una tienda.
// Primero por código de barras (exacto); si no hay, por nombre (todas las palabras, el más parecido). Sin consultas
// externas: sale de comparador.producto.
import { consulta } from "../../core/db.ts";
import { basico, ean as eanValido, palabras } from "./normalizar.ts";
import { TIENDAS } from "./tiendas.ts";

export interface ImagenReferencia { url: string; producto: string; tienda: string; enlace: string }

export async function imagenReferencia(nombre: string | null, codigos: string[]): Promise<ImagenReferencia | null> {
  const columnas = `p.imagen, p.nombre, p.url, s.tienda_id FROM comparador.producto p JOIN comparador.sucursal s ON s.id = p.sucursal_id
    JOIN comparador.tienda t ON t.id = s.tienda_id`;
  type Fila = { imagen: string; nombre: string; url: string; tienda_id: string };
  let f: Fila | undefined;
  for (const c of codigos.map((x) => eanValido(x.replace(/\D/g, ""))).filter(Boolean)) {
    [f] = await consulta<Fila>(`SELECT ${columnas} WHERE p.ean = $1 AND p.imagen IS NOT NULL AND t.activa ORDER BY p.visto_ultimo DESC LIMIT 1`, [c]);
    if (f) break;
  }
  const ws = nombre ? palabras(nombre).filter((w) => w.length >= 2).slice(0, 6) : [];
  if (!f && ws.length) {
    [f] = await consulta<Fila>(
      `SELECT ${columnas} WHERE p.imagen IS NOT NULL AND t.activa AND p.nombre_busqueda LIKE ALL ($1::text[])
          AND similarity(p.nombre_busqueda, $2) >= 0.2
        ORDER BY similarity(p.nombre_busqueda, $2) DESC, p.visto_ultimo DESC LIMIT 1`,
      [ws.map((w) => `%${w}%`), basico(nombre!)]);
  }
  if (!f) return null;
  return { url: f.imagen, producto: f.nombre, tienda: TIENDAS.find((t) => t.id === f!.tienda_id)?.nombre ?? f.tienda_id, enlace: f.url };
}
