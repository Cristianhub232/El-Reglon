"use server";
// Noticiero y Pulso oficial (curador o superadministrador): leer ahora, pausar o reactivar fuentes y cuentas,
// usuario de Instagram de cada ente y ocultar o mostrar titulares y publicaciones.
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { recolectar } from "../../../modules/noticias/recolector.ts";
import { recolectarPulso } from "../../../modules/pulso/recolector.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

function error(e: unknown, que: string): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  console.error(`[el-renglon] noticiero (${que}):`, e);
  return { error: "No se pudo completar la acción" };
}
const refrescar = () => { revalidatePath("/admin/noticias"); revalidatePath("/"); revalidatePath("/noticias"); };

export async function accionLeerAhora(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const fuente = String(form.get("fuente") ?? "") || undefined;
    const r = await recolectar(`panel:${u.correo}`, fuente);
    if (r.estado === "en_curso") return { error: "Ya hay una lectura en curso; espera unos segundos" };
    await auditar(u, "noticias.leer", { fuente: fuente ?? "todas", nuevos: r.nuevos, actualizados: r.actualizados, errores: r.errores });
    refrescar();
    const fallas = Object.entries(r.fuentes).filter(([, f]) => f.error).map(([id]) => id);
    return { ok: `Lectura terminada: ${r.nuevos} titulares nuevos y ${r.actualizados} actualizados${fallas.length ? `. Con error: ${fallas.join(", ")}` : ""}` };
  } catch (e) { return error(e, "leer"); }
}

export async function accionActivarFuente(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const [f] = await consulta<{ id: string; nombre: string; activa: boolean }>(
      "UPDATE noticias.fuente SET activa = NOT activa WHERE id = $1 RETURNING id, nombre, activa", [String(form.get("fuente") ?? "")]);
    if (!f) return { error: "La fuente no existe" };
    await auditar(u, f.activa ? "noticias.fuente.activar" : "noticias.fuente.pausar", { fuente: f.id, nombre: f.nombre });
    refrescar();
    return { ok: f.activa ? `${f.nombre} vuelve al noticiero` : `${f.nombre} pausada: sus titulares dejan de mostrarse y no se lee` };
  } catch (e) { return error(e, "fuente"); }
}

export async function accionOcultarTitular(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const [a] = await consulta<{ titulo: string; visible: boolean; fuente_id: string }>(
      `UPDATE noticias.articulo SET visible = NOT visible, ocultado_por = CASE WHEN visible THEN $2 ELSE NULL END
        WHERE id = $1 RETURNING titulo, visible, fuente_id`, [Number(form.get("id")), u.correo]);
    if (!a) return { error: "El titular no existe" };
    await auditar(u, a.visible ? "noticias.titular.mostrar" : "noticias.titular.ocultar", { fuente: a.fuente_id, titulo: a.titulo });
    refrescar();
    return { ok: a.visible ? "Titular visible de nuevo" : "Titular oculto" };
  } catch (e) { return error(e, "titular"); }
}

// ── Pulso oficial ───────────────────────────────────────────────────────────────────────────────────
export async function accionLeerPulso(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const cuenta = String(form.get("cuenta") ?? "") || undefined;
    const r = await recolectarPulso(cuenta);
    await auditar(u, "pulso.leer", { cuenta: cuenta ?? "todas", nuevas: r.nuevas, errores: r.errores });
    refrescar();
    const fallas = Object.entries(r.cuentas).filter(([, c]) => c.error).map(([id]) => id);
    return { ok: `Pulso oficial: ${r.nuevas} publicaciones nuevas${fallas.length ? `. Con error: ${fallas.join(", ")}` : ""}` };
  } catch (e) { return error(e, "pulso"); }
}

export async function accionActivarCuenta(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const id = String(form.get("cuenta") ?? "");
    const [c] = await consulta<{ ente: string; metodo: string; usuario: string | null; activa: boolean }>(
      "SELECT ente, metodo, usuario, activa FROM noticias.pulso_cuenta WHERE id = $1", [id]);
    if (!c) return { error: "La cuenta no existe" };
    if (!c.activa && c.metodo === "instagram" && !c.usuario) return { error: "Primero indica el usuario de Instagram" };
    await consulta("UPDATE noticias.pulso_cuenta SET activa = NOT activa WHERE id = $1", [id]);
    await auditar(u, c.activa ? "pulso.cuenta.pausar" : "pulso.cuenta.activar", { cuenta: id, ente: c.ente });
    refrescar();
    return { ok: c.activa ? "Cuenta pausada: sus publicaciones dejan de mostrarse" : "Cuenta activa" };
  } catch (e) { return error(e, "pulso"); }
}

export async function accionUsuarioInstagram(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const id = String(form.get("cuenta") ?? "");
    const usuario = String(form.get("usuario") ?? "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "");
    if (usuario && !/^[A-Za-z0-9._]{1,30}$/.test(usuario)) return { error: "Usuario de Instagram no válido (letras, números, punto y guion bajo)" };
    const [c] = await consulta<{ ente: string; antes: string | null }>(
      `UPDATE noticias.pulso_cuenta n SET usuario = $2, activa = CASE WHEN $2::text IS NULL THEN false ELSE n.activa END
         FROM (SELECT usuario FROM noticias.pulso_cuenta WHERE id = $1) a WHERE n.id = $1 AND n.metodo = 'instagram' RETURNING n.ente, a.usuario AS antes`,
      [id, usuario || null]);
    if (!c) return { error: "La cuenta no existe o no es de Instagram" };
    await auditar(u, "pulso.cuenta.usuario", { cuenta: id, ente: c.ente, antes: c.antes, despues: usuario || null });
    refrescar();
    return { ok: usuario ? `Usuario @${usuario} guardado. Actívala y pulsa «Leer» para comprobarlo.` : "Usuario quitado; la cuenta queda pausada" };
  } catch (e) { return error(e, "pulso"); }
}

export async function accionOcultarPublicacion(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("noticias.gestionar");
    const [p] = await consulta<{ titulo: string; visible: boolean; cuenta_id: string }>(
      `UPDATE noticias.pulso_publicacion SET visible = NOT visible, ocultado_por = CASE WHEN visible THEN $2 ELSE NULL END
        WHERE id = $1 RETURNING titulo, visible, cuenta_id`, [Number(form.get("id")), u.correo]);
    if (!p) return { error: "La publicación no existe" };
    await auditar(u, p.visible ? "pulso.publicacion.mostrar" : "pulso.publicacion.ocultar", { cuenta: p.cuenta_id, titulo: p.titulo });
    refrescar();
    return { ok: p.visible ? "Publicación visible de nuevo" : "Publicación oculta" };
  } catch (e) { return error(e, "pulso"); }
}
