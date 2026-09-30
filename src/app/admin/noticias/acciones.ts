"use server";
// Noticiero (curador o superadministrador): leer ahora, pausar o reactivar una fuente y ocultar o mostrar un titular.
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { recolectar } from "../../../modules/noticias/recolector.ts";
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
