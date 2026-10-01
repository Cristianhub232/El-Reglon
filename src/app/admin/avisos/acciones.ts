"use server";
// Avisos push (curador o superadministrador): novedades a todos los suscritos y prueba en el navegador propio
import { revalidatePath } from "next/cache";
import { consulta } from "../../../core/db.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { avisosConfigurados, difundir, enviar, registrarEnvioSuelto, type Destino } from "../../../modules/avisos/envio.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

function error(e: unknown, que: string): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  console.error(`[el-renglon] avisos (${que}):`, e);
  return { error: "No se pudo completar la acción" };
}

function leerAviso(form: FormData) {
  const titulo = String(form.get("titulo") ?? "").trim(), cuerpo = String(form.get("cuerpo") ?? "").trim();
  const url = String(form.get("url") ?? "").trim() || "/";
  if (titulo.length < 3 || titulo.length > 120) return { error: "El título debe tener entre 3 y 120 caracteres" } as const;
  if (cuerpo.length > 400) return { error: "El texto no puede superar 400 caracteres" } as const;
  if (!/^\/(?!\/)[^\s]*$/.test(url) || url.length > 300) return { error: "El enlace debe ser una ruta del sitio, p. ej. /#herramientas" } as const;
  return { aviso: { titulo, cuerpo, url, etiqueta: "novedades" } } as const;
}

export async function accionEnviarNovedad(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("avisos.enviar");
    if (!avisosConfigurados()) return { error: "Faltan las claves VAPID en el servidor" };
    const l = leerAviso(form);
    if ("error" in l) return { error: l.error };
    const r = await difundir("novedades", l.aviso, { origen: "panel", creadoPor: u.correo });
    await auditar(u, "avisos.novedad", { titulo: l.aviso.titulo, url: l.aviso.url, ...r });
    revalidatePath("/admin/avisos");
    return { ok: r?.destinatarios ? `Enviado a ${r.destinatarios} dispositivos: ${r.entregados} entregados${r.fallidos ? `, ${r.fallidos} con error` : ""}` : "Enviado, pero nadie sigue las novedades todavía" };
  } catch (e) { return error(e, "novedad"); }
}

// Prueba: solo a la suscripción de este navegador (el componente cliente envía su endpoint)
export async function accionPrueba(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("avisos.enviar");
    if (!avisosConfigurados()) return { error: "Faltan las claves VAPID en el servidor" };
    const [d] = await consulta<Destino>("SELECT id::int, endpoint, p256dh, auth FROM avisos.suscripcion WHERE endpoint = $1", [String(form.get("endpoint") ?? "")]);
    if (!d) return { error: "Este navegador no tiene los avisos activados: actívalos con la campana de la cabecera del sitio" };
    const l = leerAviso(form);
    if ("error" in l) return { error: l.error };
    const r = await enviar([d], l.aviso);
    await registrarEnvioSuelto("novedades", l.aviso, "prueba", { destinatarios: 1, ...r }, u.correo);
    revalidatePath("/admin/avisos");
    return r.entregados ? { ok: "Prueba enviada a este navegador" } : { error: "El servicio de avisos del navegador rechazó la prueba" };
  } catch (e) { return error(e, "prueba"); }
}
