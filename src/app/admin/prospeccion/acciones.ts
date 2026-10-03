"use server";
// Prospección (solo superadministrador): ajustes, alta e importación de prospectos, estados y correos de prueba.
import { revalidatePath } from "next/cache";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { correoConfigurado, enviarCorreo } from "../../../modules/prospeccion/envio.ts";
import { datosEjemplo, SECTORES, type Sector } from "../../../modules/prospeccion/plantillas.ts";
import { agregarDesdeDirectorio, cambiarEstado, crear, guardarAjustes, importar } from "../../../modules/prospeccion/prospectos.ts";
import { enviarAProspecto } from "../../../modules/prospeccion/programador.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

function error(e: unknown, que: string): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  console.error(`[el-renglon] prospección (${que}):`, e);
  return { error: "No se pudo completar la acción" };
}
const refrescar = () => revalidatePath("/admin/prospeccion");
const num = (f: FormData, k: string) => Number(String(f.get(k) ?? ""));

export async function accionAjustes(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const a = { activo: form.get("activo") === "on", limite_diario: num(form, "limite_diario"), hora_inicio: num(form, "hora_inicio"),
      hora_fin: num(form, "hora_fin"), dias_seguimiento: num(form, "dias_seguimiento") };
    if (a.activo && !correoConfigurado()) return { error: "Falta CORREO_SMTP_CLAVE en el servidor: no se puede activar" };
    const r = await guardarAjustes(a, u.correo);
    if ("error" in r) return { error: r.error };
    await auditar(u, "prospeccion.ajustes", a);
    refrescar();
    return { ok: a.activo ? `Activa: hasta ${a.limite_diario} correos por día hábil, de ${a.hora_inicio} a ${a.hora_fin} h` : "Guardado. La prospección está en pausa" };
  } catch (e) { return error(e, "ajustes"); }
}

export async function accionCrear(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const n = { empresa: String(form.get("empresa") ?? ""), contacto: String(form.get("contacto") ?? ""), correo: String(form.get("correo") ?? ""),
      sector: String(form.get("sector") ?? ""), origen: String(form.get("origen") ?? ""), notas: String(form.get("notas") ?? ""),
      rif: String(form.get("rif") ?? ""), consentimiento: form.get("consentimiento") === "on" };
    const r = await crear(n, u.correo);
    if (typeof r === "object") return { error: r.error };
    if (r === "duplicado") return { error: "Ese correo ya está en la lista" };
    if (r === "en_baja") return { error: "Ese correo se dio de baja: no se le puede volver a escribir" };
    await auditar(u, "prospeccion.crear", { empresa: n.empresa.trim(), correo: n.correo.trim().toLowerCase(), sector: n.sector });
    refrescar();
    return { ok: `${n.empresa.trim()} agregada a la lista` };
  } catch (e) { return error(e, "crear"); }
}

export async function accionImportar(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const r = await importar(String(form.get("csv") ?? ""), u.correo);
    if ("error" in r) return { error: r.error };
    await auditar(u, "prospeccion.importar", { agregados: r.agregados, duplicados: r.duplicados, en_baja: r.en_baja, errores: r.errores.length });
    refrescar();
    const resumen = `${r.agregados} agregados · ${r.duplicados} ya estaban · ${r.en_baja} dados de baja (omitidos)`;
    return r.errores.length ? { error: `${resumen}. Con error: ${r.errores.join(" · ")}` } : { ok: resumen };
  } catch (e) { return error(e, "importar"); }
}

const CAMBIOS = { respondio: "respondió", descartado: "descartado", baja: "dado de baja", pendiente: "pendiente" } as const;
export async function accionEstado(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const estado = String(form.get("estado") ?? "") as keyof typeof CAMBIOS;
    if (!(estado in CAMBIOS)) return { error: "Estado no válido" };
    const p = await cambiarEstado(num(form, "id"), estado);
    if (!p) return { error: "El prospecto ya no existe" };
    await auditar(u, "prospeccion.estado", { empresa: p.empresa, correo: p.correo, estado });
    refrescar();
    return { ok: `Marcado como ${CAMBIOS[estado]}` };
  } catch (e) { return error(e, "estado"); }
}

// Prueba: el correo de un sector, con una empresa de ejemplo, a la dirección indicada. No cuenta para el límite diario.
export async function accionPrueba(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    if (!correoConfigurado()) return { error: "Falta CORREO_SMTP_CLAVE en el servidor" };
    const correo = String(form.get("correo") ?? "").trim().toLowerCase(), sector = String(form.get("sector") ?? "") as Sector;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Correo no válido" };
    if (!(sector in SECTORES)) return { error: "Sector no válido" };
    const r = await enviarCorreo(correo, datosEjemplo(sector), "prueba", { creadoPor: u.correo });
    await auditar(u, "prospeccion.prueba", { correo, sector, ok: r.ok });
    refrescar();
    return r.ok ? { ok: `Prueba enviada a ${correo}: «${r.asunto}»` } : { error: `No se pudo enviar: ${r.error}` };
  } catch (e) { return error(e, "prueba"); }
}

// «Enviar ahora»: la invitación que le toca a este prospecto, en el momento (cuenta para el límite diario)
export async function accionEnviarAhora(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const id = num(form, "id");
    const r = await enviarAProspecto(id, u.correo);
    if ("error" in r) return { error: r.error };
    await auditar(u, "prospeccion.enviar", { id, tipo: r.tipo, asunto: r.asunto });
    refrescar();
    return { ok: `Enviado (${r.tipo === "inicial" ? "primer correo" : "seguimiento"}): «${r.asunto}»` };
  } catch (e) { return error(e, "enviar"); }
}

// Alta desde el directorio de contribuyentes, con el sector elegido
export async function accionAgregarDirectorio(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("prospeccion.gestionar");
    const rif = String(form.get("rif") ?? ""), sector = String(form.get("sector") ?? "");
    const r = await agregarDesdeDirectorio(rif, sector, u.correo);
    if ("error" in r) return { error: r.error };
    if (r.alta === "duplicado") return { error: "Ese correo ya está en la lista de prospectos" };
    if (r.alta === "en_baja") return { error: "Ese correo se dio de baja: no se le puede volver a escribir" };
    await auditar(u, "prospeccion.crear", { empresa: r.empresa, correo: r.correo, sector, origen: "directorio" });
    refrescar();
    return { ok: `${r.empresa} agregada` };
  } catch (e) { return error(e, "directorio"); }
}
