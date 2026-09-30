// Consulta de la auditoría con filtros (categoría del evento y texto) para la página y el CSV
import { consulta } from "../../core/db.ts";
import type { Categoria } from "../../ui/admin/eventos.ts";

export const POR_PAGINA = 50;

// Categorías por prefijo de la acción (las que no son de un módulo son "acceso": sesiones, usuarios y API keys)
const CONDICION: Record<Categoria, string> = {
  acceso: "split_part(accion, '.', 1) NOT IN ('bcv', 'iva', 'arancel', 'calendario')",
  iva: "accion LIKE 'iva.%'", bcv: "accion LIKE 'bcv.%'", arancel: "accion LIKE 'arancel.%'", calendario: "accion LIKE 'calendario.%'",
};

export async function eventos(cat: Categoria | null, q: string, pagina: number, limite = POR_PAGINA) {
  const donde = [cat ? CONDICION[cat] : "true", "($1 = '' OR actor ILIKE '%' || $1 || '%' OR accion ILIKE '%' || $1 || '%' OR detalle::text ILIKE '%' || $1 || '%')"].join(" AND ");
  const [filas, [total]] = await Promise.all([
    consulta<{ id: string; ocurrido_en: string; actor: string; accion: string; detalle: Record<string, unknown> }>(
      `SELECT id, ocurrido_en::text, actor, accion, detalle FROM core.auditoria WHERE ${donde} ORDER BY ocurrido_en DESC, id DESC LIMIT $2 OFFSET $3`,
      [q, limite, (pagina - 1) * limite]),
    consulta<{ n: string }>(`SELECT count(*) AS n FROM core.auditoria WHERE ${donde}`, [q]),
  ]);
  return { filas, total: Number(total.n) };
}
