"use server";
// Bandeja (solo superadministrador): marcar los mensajes del botón de contacto
import { revalidatePath } from "next/cache";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { marcar } from "../../../modules/contacto/mensajes.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const NOMBRES = { atendido: "atendido", spam: "spam", nuevo: "nuevo" } as const;
export async function accionMarcarMensaje(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("bandeja.gestionar");
    const id = Number(form.get("id")), estado = String(form.get("estado") ?? "") as keyof typeof NOMBRES;
    if (!(estado in NOMBRES)) return { error: "Estado no válido" };
    const m = await marcar(id, estado, u.correo);
    if (!m) return { error: "El mensaje ya no existe" };
    await auditar(u, "contacto.mensaje", { id, correo: m.correo, estado });
    revalidatePath("/admin/bandeja");
    return { ok: `Marcado como ${NOMBRES[estado]}` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    console.error("[el-renglon] bandeja:", e);
    return { error: "No se pudo completar la acción" };
  }
}
