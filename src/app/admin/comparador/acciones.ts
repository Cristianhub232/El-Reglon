"use server";
// Comparador de precios (curador o superadministrador): pausar o reactivar una tienda. Una tienda pausada deja de
// consultarse en la portada y en la API; su servicio sigue corriendo bajo PM2.
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

export async function accionActivarTienda(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("comparador.gestionar");
    const [t] = await consulta<{ id: string; nombre: string; activa: boolean }>(
      "UPDATE comparador.tienda SET activa = NOT activa WHERE id = $1 RETURNING id, nombre, activa", [String(form.get("tienda") ?? "")]);
    if (!t) return { error: "La tienda no existe" };
    await auditar(u, t.activa ? "comparador.tienda.activar" : "comparador.tienda.pausar", { tienda: t.id, nombre: t.nombre });
    revalidatePath("/admin/comparador"); revalidatePath("/");
    return { ok: t.activa ? `${t.nombre} vuelve al comparador` : `${t.nombre} pausada: deja de consultarse` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    console.error("[el-renglon] comparador:", e);
    return { error: "No se pudo completar la acción" };
  }
}
