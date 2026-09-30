"use server";
// Usuarios y roles (solo superadministrador): crear, editar, cambiar rol, activar/desactivar, restablecer contraseña y
// 2FA, desbloquear, cerrar sesiones y eliminar. Reglas: siempre queda al menos un superadministrador activo; nadie puede
// desactivarse, eliminarse ni quitarse el rol de superadministrador a sí mismo. Todo queda en la auditoría.
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { claveTemporal, hashClave } from "../../../core/auth/claves.ts";
import { ROLES, type Rol } from "../../../core/auth/roles.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const esRol = (r: unknown): r is Rol => typeof r === "string" && r in ROLES;
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const refrescar = () => revalidatePath("/admin/usuarios", "layout");

function error(e: unknown): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  const pg = e as { code?: string };
  if (pg?.code === "23505") return { error: "Ya existe un usuario con ese correo" };
  if (pg?.code === "23514") return { error: "Revisa los datos: el correo o el nombre no son válidos" };
  console.error("[el-renglon] acción de usuarios:", e);
  return { error: "No se pudo completar la acción" };
}

interface Objetivo { id: number; nombre: string; correo: string; rol: Rol; activo: boolean }
async function objetivo(form: FormData): Promise<Objetivo | undefined> {
  const [o] = await consulta<Objetivo>("SELECT id, nombre, correo, rol, activo FROM core.usuario WHERE id = $1", [Number(form.get("id"))]);
  return o;
}
async function quedariaSinSuper(excluir: number) {
  const [f] = await consulta<{ n: string }>("SELECT count(*) AS n FROM core.usuario WHERE rol = 'super' AND activo AND id <> $1", [excluir]);
  return Number(f.n) === 0;
}

export async function accionInvitar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const nombre = String(form.get("nombre") ?? "").trim(), correo = String(form.get("correo") ?? "").trim().toLowerCase(), rol = form.get("rol");
    if (nombre.length < 2 || nombre.length > 120) return { error: "Escribe el nombre (2 a 120 caracteres)" };
    if (!CORREO.test(correo)) return { error: "Escribe un correo válido" };
    if (!esRol(rol)) return { error: "Elige un rol" };
    const clave = claveTemporal();
    await consulta("INSERT INTO core.usuario (nombre, correo, rol, clave_hash) VALUES ($1, $2, $3, $4)", [nombre, correo, rol, await hashClave(clave)]);
    await auditar(u, "usuario.invitar", { correo, rol });
    return { ok: `Usuario ${correo} creado (${ROLES[rol].nombre}). Entrégale esta contraseña temporal por un canal seguro; al entrar deberá cambiarla.`, clave };
  } catch (e) { return error(e); }
}

export async function accionEditarUsuario(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    const nombre = String(form.get("nombre") ?? "").trim(), correo = String(form.get("correo") ?? "").trim().toLowerCase(), rol = form.get("rol");
    if (nombre.length < 2 || nombre.length > 120) return { error: "El nombre debe tener entre 2 y 120 caracteres" };
    if (!CORREO.test(correo)) return { error: "Escribe un correo válido" };
    if (!esRol(rol)) return { error: "Elige un rol" };
    if (o.rol === "super" && rol !== "super") {
      if (o.id === u.id) return { error: "No puedes quitarte el rol de superadministrador a ti mismo" };
      if (o.activo && await quedariaSinSuper(o.id)) return { error: "Debe quedar al menos un superadministrador activo" };
    }
    const cambios: Record<string, [string, string]> = {};
    if (nombre !== o.nombre) cambios.nombre = [o.nombre, nombre];
    if (correo !== o.correo.toLowerCase()) cambios.correo = [o.correo, correo];
    if (rol !== o.rol) cambios.rol = [ROLES[o.rol].nombre, ROLES[rol].nombre];
    if (Object.keys(cambios).length === 0) return { ok: "Sin cambios" };
    await consulta("UPDATE core.usuario SET nombre = $2, correo = $3, rol = $4 WHERE id = $1", [o.id, nombre, correo, rol]);
    // Un cambio de correo o de rol cierra sus sesiones: vuelve a entrar con sus nuevos datos y permisos
    if ((cambios.correo || cambios.rol) && o.id !== u.id) await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [o.id]);
    await auditar(u, "usuario.editar", { correo: o.correo, cambios });
    refrescar();
    return { ok: `Usuario actualizado${(cambios.correo || cambios.rol) && o.id !== u.id ? "; se cerraron sus sesiones" : ""}` };
  } catch (e) { return error(e); }
}

export async function accionCambiarRol(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form), rol = form.get("rol");
    if (!o || !esRol(rol)) return { error: "Datos inválidos" };
    if (o.rol === rol) return { ok: "Sin cambios" };
    if (o.rol === "super") {
      if (o.id === u.id) return { error: "No puedes quitarte el rol de superadministrador a ti mismo" };
      if (o.activo && await quedariaSinSuper(o.id)) return { error: "Debe quedar al menos un superadministrador activo" };
    }
    await consulta("UPDATE core.usuario SET rol = $2 WHERE id = $1", [o.id, rol]);
    await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [o.id]);
    await auditar(u, "usuario.rol", { correo: o.correo, antes: ROLES[o.rol].nombre, despues: ROLES[rol].nombre });
    refrescar();
    return { ok: "Rol actualizado; se cerraron sus sesiones" };
  } catch (e) { return error(e); }
}

export async function accionActivar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    if (o.id === u.id) return { error: "No puedes desactivar tu propia cuenta" };
    if (o.activo && o.rol === "super" && await quedariaSinSuper(o.id)) return { error: "Debe quedar al menos un superadministrador activo" };
    await consulta("UPDATE core.usuario SET activo = NOT activo WHERE id = $1", [o.id]);
    if (o.activo) await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [o.id]);
    await auditar(u, o.activo ? "usuario.desactivar" : "usuario.activar", { correo: o.correo });
    refrescar();
    return { ok: o.activo ? "Usuario desactivado y sesiones cerradas" : "Usuario activado" };
  } catch (e) { return error(e); }
}

export async function accionRestablecer(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    const reiniciar2fa = form.get("con2fa") === "1";
    const clave = claveTemporal();
    await consulta(`UPDATE core.usuario SET clave_hash = $2, debe_cambiar_clave = true, intentos_fallidos = 0, bloqueado_hasta = NULL
                    ${reiniciar2fa ? ", totp_activo = false, totp_secreto = NULL" : ""} WHERE id = $1`, [o.id, await hashClave(clave)]);
    await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [o.id]);
    await auditar(u, reiniciar2fa ? "usuario.2fa.reiniciar" : "usuario.restablecer", { correo: o.correo });
    return { ok: `Contraseña temporal para ${o.correo}${reiniciar2fa ? " (también se reinició la verificación en dos pasos)" : ""}. Entrégala por un canal seguro.`, clave };
  } catch (e) { return error(e); }
}

export async function accionReiniciar2fa(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    await consulta("UPDATE core.usuario SET totp_activo = false, totp_secreto = NULL WHERE id = $1", [o.id]);
    await consulta("DELETE FROM core.sesion WHERE usuario_id = $1 AND $1 <> $2", [o.id, u.id]);
    await auditar(u, "usuario.2fa.reiniciar", { correo: o.correo });
    refrescar();
    return { ok: "Verificación en dos pasos reiniciada: deberá configurarla de nuevo en Mi cuenta" };
  } catch (e) { return error(e); }
}

export async function accionDesbloquear(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    await consulta("UPDATE core.usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = $1", [o.id]);
    await auditar(u, "usuario.desbloquear", { correo: o.correo });
    refrescar();
    return { ok: "Cuenta desbloqueada" };
  } catch (e) { return error(e); }
}

export async function accionCerrarSesiones(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    const token = String(form.get("sesion") ?? "");   // una sesión concreta (hash) o todas
    const filas = token
      ? await consulta("DELETE FROM core.sesion WHERE usuario_id = $1 AND token_hash = $2 RETURNING 1", [o.id, token])
      : await consulta("DELETE FROM core.sesion WHERE usuario_id = $1 RETURNING 1", [o.id]);
    await auditar(u, "usuario.sesiones.cerrar", { correo: o.correo, sesiones: filas.length });
    refrescar();
    return { ok: filas.length ? `${filas.length} ${filas.length === 1 ? "sesión cerrada" : "sesiones cerradas"}` : "No tenía sesiones abiertas" };
  } catch (e) { return error(e); }
}

export async function accionEliminar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(form);
    if (!o) return { error: "El usuario no existe" };
    if (o.id === u.id) return { error: "No puedes eliminar tu propia cuenta" };
    if (o.activo) return { error: "Primero desactiva el usuario; solo se eliminan cuentas desactivadas" };
    if (String(form.get("confirmar") ?? "").trim().toLowerCase() !== o.correo.toLowerCase()) return { error: "Escribe el correo del usuario para confirmar" };
    // La auditoría conserva sus acciones (el actor es el correo); sus API keys quedan sin dueño y siguen su curso
    await consulta("DELETE FROM core.usuario WHERE id = $1", [o.id]);
    await auditar(u, "usuario.eliminar", { correo: o.correo, nombre: o.nombre, rol: o.rol });
  } catch (e) { return error(e); }
  refrescar();
  redirect("/admin/usuarios");   // su ficha ya no existe (fuera del try: redirect lanza una excepción de control)
}
