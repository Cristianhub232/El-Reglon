"use server";
// Usuarios y roles (solo superadministrador). Siempre queda al menos un superadministrador activo.
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { claveTemporal, hashClave } from "../../../core/auth/claves.ts";
import { ROLES, type Rol } from "../../../core/auth/roles.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const esRol = (r: unknown): r is Rol => typeof r === "string" && r in ROLES;
function error(e: unknown): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  const pg = e as { code?: string };
  if (pg?.code === "23505") return { error: "Ya existe un usuario con ese correo" };
  if (pg?.code === "23514") return { error: "Revisa los datos: el correo o el nombre no son válidos" };
  console.error("[el-renglon] acción de usuarios:", e);
  return { error: "No se pudo completar la acción" };
}

async function objetivo(id: number) {
  const [o] = await consulta<{ id: number; correo: string; rol: Rol; activo: boolean }>("SELECT id, correo, rol, activo FROM core.usuario WHERE id = $1", [id]);
  return o;
}
async function quedariaSinSuper(excluir: number) {
  const [f] = await consulta<{ n: string }>("SELECT count(*) AS n FROM core.usuario WHERE rol = 'super' AND activo AND id <> $1", [excluir]);
  return Number(f.n) === 0;
}

export async function accionInvitar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const nombre = String(form.get("nombre") ?? "").trim(), correo = String(form.get("correo") ?? "").trim(), rol = form.get("rol");
    if (nombre.length < 2) return { error: "Escribe el nombre" };
    if (!esRol(rol)) return { error: "Elige un rol" };
    const clave = claveTemporal();
    await consulta("INSERT INTO core.usuario (nombre, correo, rol, clave_hash) VALUES ($1, $2, $3, $4)", [nombre, correo, rol, await hashClave(clave)]);
    await auditar(u, "usuario.invitar", { correo, rol });
    return { ok: `Usuario ${correo} creado (${ROLES[rol].nombre}). Entrégale esta contraseña temporal por un canal seguro; al entrar deberá cambiarla.`, clave };
  } catch (e) { return error(e); }
}

export async function accionCambiarRol(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(Number(form.get("id"))), rol = form.get("rol");
    if (!o || !esRol(rol)) return { error: "Datos inválidos" };
    if (o.rol === rol) return { ok: "Sin cambios" };
    if (o.rol === "super" && await quedariaSinSuper(o.id)) return { error: "Debe quedar al menos un superadministrador activo" };
    await consulta("UPDATE core.usuario SET rol = $2 WHERE id = $1", [o.id, rol]);
    await auditar(u, "usuario.rol", { correo: o.correo, antes: ROLES[o.rol].nombre, despues: ROLES[rol].nombre });
    revalidatePath("/admin/usuarios");
    return { ok: "Rol actualizado" };
  } catch (e) { return error(e); }
}

export async function accionActivar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(Number(form.get("id")));
    if (!o) return { error: "El usuario no existe" };
    if (o.id === u.id) return { error: "No puedes desactivar tu propia cuenta" };
    if (o.activo && o.rol === "super" && await quedariaSinSuper(o.id)) return { error: "Debe quedar al menos un superadministrador activo" };
    await consulta("UPDATE core.usuario SET activo = NOT activo WHERE id = $1", [o.id]);
    if (o.activo) await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [o.id]);
    await auditar(u, o.activo ? "usuario.desactivar" : "usuario.activar", { correo: o.correo });
    revalidatePath("/admin/usuarios");
    return { ok: o.activo ? "Usuario desactivado y sesiones cerradas" : "Usuario activado" };
  } catch (e) { return error(e); }
}

export async function accionRestablecer(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("usuarios.gestionar");
    const o = await objetivo(Number(form.get("id")));
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
