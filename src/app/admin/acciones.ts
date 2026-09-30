"use server";
// Acciones comunes del panel: cerrar sesión y marcar las notificaciones como leídas
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { consulta } from "../../core/db.ts";
import { usuarioActual } from "../../core/auth/dal.ts";
import { COOKIE_SESION, cerrarSesion } from "../../core/auth/sesiones.ts";

export async function accionSalir() {
  const c = await cookies();
  const u = await usuarioActual();
  await cerrarSesion(c.get(COOKIE_SESION)?.value, u?.correo);
  c.delete(COOKIE_SESION);
  redirect("/ingresar");
}

export async function accionNotificacionesLeidas() {
  const u = await usuarioActual();
  if (!u) return;
  await consulta("UPDATE core.usuario SET notificaciones_vistas_en = now() WHERE id = $1", [u.id]);
  revalidatePath("/admin", "layout");
}
