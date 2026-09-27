// Identificación de productos por código de barras en Open Food Facts (ODbL), con caché en iva.producto_cache.
// Encontrados se reutilizan 30 días; no encontrados, 7. Si la red falla, se usa la caché aunque esté vencida.
// IVA_OFF=0 desactiva la consulta externa (solo caché).
import { consulta } from "../../core/db.ts";

export interface Producto { codigo: string; encontrado: boolean; nombre: string | null; marca: string | null; cantidad: string | null; categorias: string[]; fuente: string; desde_cache: boolean }

const AGENTE = "ElRenglon/0.1 (+https://github.com/Cristianhub232/El-Reglon)";
export const ATRIBUCION_OFF = "Datos de producto: Open Food Facts (openfoodfacts.org), licencia ODbL";

export async function buscarProducto(codigo: string): Promise<{ producto: Producto | null; advertencia?: string }> {
  const [c] = await consulta<Producto & { vigente: boolean }>(
    `SELECT codigo, encontrado, nombre, marca, cantidad, categorias, fuente, true AS desde_cache,
            consultado_en > now() - CASE WHEN encontrado THEN interval '30 days' ELSE interval '7 days' END AS vigente
       FROM iva.producto_cache WHERE codigo = $1`, [codigo]);
  if (c?.vigente || process.env.IVA_OFF === "0") return { producto: c ?? null };
  try {
    const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${codigo}.json?fields=product_name,product_name_es,brands,quantity,categories_tags`,
      { headers: { "user-agent": AGENTE }, signal: AbortSignal.timeout(3500) });
    if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
    const d = (await r.json()) as { status?: number; product?: Record<string, unknown> };
    const p = d.status === 1 ? d.product ?? {} : null;
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);
    const producto: Producto = {
      codigo, encontrado: !!p, fuente: "open_food_facts", desde_cache: false,
      nombre: p ? texto(p.product_name_es) ?? texto(p.product_name) : null, marca: p ? texto(p.brands) : null, cantidad: p ? texto(p.quantity) : null,
      categorias: p && Array.isArray(p.categories_tags) ? (p.categories_tags as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 50) : [],
    };
    await consulta(`INSERT INTO iva.producto_cache (codigo, encontrado, nombre, marca, cantidad, categorias, fuente)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (codigo) DO UPDATE SET encontrado = EXCLUDED.encontrado, nombre = EXCLUDED.nombre, marca = EXCLUDED.marca,
                      cantidad = EXCLUDED.cantidad, categorias = EXCLUDED.categorias, fuente = EXCLUDED.fuente, consultado_en = now()`,
      [codigo, producto.encontrado, producto.nombre, producto.marca, producto.cantidad, producto.categorias, producto.fuente]);
    return { producto };
  } catch (e) {
    return { producto: c ?? null, advertencia: `No se pudo consultar Open Food Facts (${(e as Error).message})${c ? "; se usó la caché" : ""}` };
  }
}
