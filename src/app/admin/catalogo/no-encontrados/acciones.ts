"use server";
// Curaduría de los artículos que el clasificador no encontró: se marcan como revisados (todas las consultas iguales)
import { revalidatePath } from "next/cache";
import { consulta } from "../../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../../core/auth/dal.ts";
import type { EstadoAccion } from "../../../../ui/admin/FormAccion.tsx";

export async function accionMarcarRevisado(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("catalogo.editar");
    const clave = String(form.get("clave") ?? "");
    const regla = String(form.get("regla") ?? "").trim().toUpperCase() || null;
    const nota = String(form.get("nota") ?? "").trim() || null;
    if (!clave) return { error: "Falta el artículo" };
    if (regla && !(await consulta("SELECT 1 FROM iva.regla WHERE id = $1", [regla])).length) return { error: `No existe la regla ${regla}` };
    const filas = await consulta<{ id: string }>(
      `UPDATE iva.articulo_no_encontrado SET revisado = true, revisado_por = $2, revisado_en = now(), regla_asignada = $3, nota = $4
        WHERE NOT revisado AND coalesce(texto_normalizado, array_to_string(codigos, ',')) = $1 RETURNING id`, [clave, u.correo, regla, nota]);
    if (!filas.length) return { error: "Ya estaba revisado" };
    await auditar(u, "iva.no_encontrado.revisar", { articulo: clave, consultas: filas.length, regla, nota });
    revalidatePath("/admin/catalogo/no-encontrados");
    return { ok: `Marcado como revisado (${filas.length} ${filas.length === 1 ? "consulta" : "consultas"})` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    console.error("[el-renglon] no encontrados:", e);
    return { error: "No se pudo marcar" };
  }
}
