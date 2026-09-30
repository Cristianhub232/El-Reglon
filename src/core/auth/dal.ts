// Capa de acceso del panel (Next): verifica la sesión en cada página y acción. El proxy solo hace una comprobación
// optimista de la cookie; la autorización real ocurre aquí.
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { consulta } from "../db.ts";
import { COOKIE_SESION, usuarioDeSesion, type Usuario } from "./sesiones.ts";
import { puede, puedeVer, type Permiso, type Seccion } from "./roles.ts";

export const usuarioActual = cache(async (): Promise<Usuario | null> => usuarioDeSesion((await cookies()).get(COOKIE_SESION)?.value));

// Páginas: sin sesión → /ingresar; con la contraseña temporal → /admin/cuenta; sección no permitida → /admin
export async function requerirUsuario(opciones: { permitirClaveTemporal?: boolean } = {}): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u) redirect("/ingresar");
  if (u.debe_cambiar_clave && !opciones.permitirClaveTemporal) redirect("/admin/cuenta");
  return u;
}

export async function requerirSeccion(s: Seccion): Promise<Usuario> {
  const u = await requerirUsuario();
  if (!puedeVer(u.rol, s)) redirect("/admin");
  return u;
}

// Acciones: devuelven un error en lugar de redirigir
export class SinPermiso extends Error {}
export async function usuarioConPermiso(p: Permiso): Promise<Usuario> {
  const u = await usuarioActual();
  if (!u || u.debe_cambiar_clave) throw new SinPermiso("La sesión venció. Vuelve a iniciar sesión.");
  if (!puede(u.rol, p)) throw new SinPermiso("Tu rol no permite esta acción.");
  return u;
}

// Toda acción del panel queda en la auditoría con el correo de quien la hizo
export async function auditar(u: Usuario, accion: string, detalle: Record<string, unknown>) {
  await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, $2, $3)", [u.correo, accion, detalle]);
}

export async function agenteNavegador(): Promise<string | null> {
  return (await headers()).get("user-agent");
}
