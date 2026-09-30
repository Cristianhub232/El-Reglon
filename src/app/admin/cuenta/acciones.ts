"use server";
// Mi cuenta: cambio de contraseña y verificación en dos pasos (TOTP)
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { sha256 } from "../../../core/api-key.ts";
import { auditar, usuarioActual } from "../../../core/auth/dal.ts";
import { hashClave, problemaClave, verificarClave } from "../../../core/auth/claves.ts";
import { COOKIE_SESION } from "../../../core/auth/sesiones.ts";
import { cifrarSecreto, descifrarSecreto, nuevoSecreto, verificarTotp } from "../../../core/auth/totp.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

async function datos(id: number) {
  const [f] = await consulta<{ clave_hash: string; totp_secreto: string | null; totp_activo: boolean }>(
    "SELECT clave_hash, totp_secreto, totp_activo FROM core.usuario WHERE id = $1", [id]);
  return f;
}

export async function accionCambiarClave(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const u = await usuarioActual();
  if (!u) return { error: "La sesión venció. Vuelve a iniciar sesión." };
  const actual = String(form.get("actual") ?? ""), nueva = String(form.get("nueva") ?? ""), repetir = String(form.get("repetir") ?? "");
  if (!(await verificarClave(actual, (await datos(u.id)).clave_hash))) return { error: "La contraseña actual no es correcta" };
  const problema = problemaClave(nueva);
  if (problema) return { error: problema };
  if (nueva !== repetir) return { error: "La nueva contraseña y su confirmación no coinciden" };
  if (nueva === actual) return { error: "La nueva contraseña debe ser distinta de la actual" };
  const token = (await cookies()).get(COOKIE_SESION)?.value ?? "";
  await consulta("UPDATE core.usuario SET clave_hash = $2, debe_cambiar_clave = false WHERE id = $1", [u.id, await hashClave(nueva)]);
  // Cierra las demás sesiones abiertas con la contraseña anterior
  await consulta("DELETE FROM core.sesion WHERE usuario_id = $1 AND token_hash <> $2", [u.id, sha256(token)]);
  await auditar(u, "usuario.clave", { temporal: u.debe_cambiar_clave });
  // El marco del panel (menú, búsqueda, notificaciones) se generó con la clave temporal: hay que volver a generarlo
  revalidatePath("/admin", "layout");
  if (u.debe_cambiar_clave) redirect("/admin");
  return { ok: "Contraseña actualizada. Se cerraron tus otras sesiones." };
}

export async function accionEditarPerfil(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const u = await usuarioActual();
  if (!u) return { error: "La sesión venció. Vuelve a iniciar sesión." };
  const nombre = String(form.get("nombre") ?? "").trim();
  if (nombre.length < 2 || nombre.length > 120) return { error: "El nombre debe tener entre 2 y 120 caracteres" };
  if (nombre === u.nombre) return { ok: "Sin cambios" };
  await consulta("UPDATE core.usuario SET nombre = $2 WHERE id = $1", [u.id, nombre]);
  await auditar(u, "usuario.editar", { correo: u.correo, cambios: { nombre: [u.nombre, nombre] } });
  revalidatePath("/admin", "layout");
  return { ok: "Nombre actualizado" };
}

export async function accionIniciarTotp(): Promise<void> {
  const u = await usuarioActual();
  if (!u || u.totp_activo) return;
  await consulta("UPDATE core.usuario SET totp_secreto = $2 WHERE id = $1 AND NOT totp_activo", [u.id, cifrarSecreto(nuevoSecreto())]);
  revalidatePath("/admin/cuenta");
}

export async function accionConfirmarTotp(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const u = await usuarioActual();
  if (!u) return { error: "La sesión venció. Vuelve a iniciar sesión." };
  const d = await datos(u.id);
  if (!d.totp_secreto || d.totp_activo) return { error: "Primero genera el código QR" };
  if (!verificarTotp(descifrarSecreto(d.totp_secreto), String(form.get("codigo") ?? ""))) return { error: "El código no coincide. Revisa la hora del teléfono e inténtalo de nuevo." };
  await consulta("UPDATE core.usuario SET totp_activo = true WHERE id = $1", [u.id]);
  await auditar(u, "usuario.2fa.activar", {});
  revalidatePath("/admin", "layout");
  return { ok: "Verificación en dos pasos activada. Desde ahora te pediremos el código al iniciar sesión." };
}

export async function accionDesactivarTotp(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  const u = await usuarioActual();
  if (!u) return { error: "La sesión venció. Vuelve a iniciar sesión." };
  const d = await datos(u.id);
  if (!d.totp_activo || !d.totp_secreto) return { error: "La verificación en dos pasos no está activa" };
  if (!verificarTotp(descifrarSecreto(d.totp_secreto), String(form.get("codigo") ?? ""))) return { error: "El código no es válido" };
  await consulta("UPDATE core.usuario SET totp_activo = false, totp_secreto = NULL WHERE id = $1", [u.id]);
  await auditar(u, "usuario.2fa.desactivar", {});
  revalidatePath("/admin", "layout");
  return { ok: "Verificación en dos pasos desactivada." };
}
