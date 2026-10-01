"use server";
// API keys: crear, revocar y atender solicitudes. El token se muestra una sola vez; en la base solo queda su SHA-256.
import { revalidatePath } from "next/cache";
import { consulta, pool } from "../../../core/db.ts";
import { generarToken } from "../../../core/api-key.ts";
import { auditar, SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const MODULOS = ["iva", "bcv", "arancel", "calendario", "rif", "noticias", "comparador"];
const LIMITE_DEV = 120;   // un desarrollador puede crear sus keys hasta 120 consultas por minuto

function error(e: unknown): EstadoAccion {
  if (e instanceof SinPermiso) return { error: e.message };
  console.error("[el-renglon] acción de API keys:", e);
  return { error: "No se pudo completar la acción" };
}

export async function accionCrearKey(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("apikeys.propias");
    const nombre = String(form.get("nombre") ?? "").trim();
    const contacto = String(form.get("contacto") ?? "").trim() || null;
    const permisos = form.getAll("permisos").map(String).filter((p) => MODULOS.includes(p));
    const limite = Number(form.get("limite") ?? 60);
    const tope = puede(u.rol, "apikeys.gestionar") ? 10_000 : LIMITE_DEV;
    if (nombre.length < 3 || nombre.length > 120) return { error: "Escribe un nombre de 3 a 120 caracteres (p. ej. el sistema o la tienda)" };
    if (permisos.length === 0) return { error: "Elige al menos un módulo" };
    if (!Number.isInteger(limite) || limite < 1 || limite > tope) return { error: `El límite debe estar entre 1 y ${tope} consultas por minuto` };
    const { token, prefijo, hash } = generarToken();
    await consulta(`INSERT INTO core.api_key (nombre, prefijo, hash_sha256, permisos, limite_por_minuto, usuario_id, contacto)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)`, [nombre, prefijo, hash, permisos, limite, u.id, contacto]);
    await auditar(u, "api_key.crear", { prefijo, nombre, permisos, limite });
    return { ok: `API key creada: «${nombre}». Cópiala ahora: no se volverá a mostrar.`, token };
  } catch (e) { return error(e); }
}

export async function accionRevocarKey(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("apikeys.propias");
    const id = Number(form.get("id"));
    const todas = puede(u.rol, "apikeys.gestionar");
    const [k] = await consulta<{ prefijo: string; nombre: string }>(
      `UPDATE core.api_key SET activa = false, revocada_en = now()
        WHERE id = $1 AND activa AND ($2 OR usuario_id = $3) RETURNING prefijo, nombre`, [id, todas, u.id]);
    if (!k) return { error: "La API key no existe, ya estaba revocada o no es tuya" };
    await auditar(u, "api_key.revocar", { prefijo: k.prefijo, nombre: k.nombre });
    revalidatePath("/admin/api-keys");
    return { ok: `API key rgl_${k.prefijo} revocada` };
  } catch (e) { return error(e); }
}

export async function accionAprobarSolicitud(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("apikeys.gestionar");
    const id = Number(form.get("id"));
    const limite = Number(form.get("limite") ?? 60);
    if (!Number.isInteger(limite) || limite < 1 || limite > 10_000) return { error: "Límite inválido" };
    const { token, prefijo, hash } = generarToken();
    const c = await pool().connect();
    try {
      await c.query("BEGIN");
      const { rows: [sol] } = await c.query<{ nombre: string; correo: string; organizacion: string | null; permisos: string[] }>(
        "SELECT nombre, correo, organizacion, permisos FROM core.solicitud_api_key WHERE id = $1 AND estado = 'pendiente' FOR UPDATE", [id]);
      if (!sol) { await c.query("ROLLBACK"); return { error: "La solicitud ya fue atendida" }; }
      const nombre = sol.organizacion ? `${sol.organizacion}` : sol.nombre;
      const { rows: [k] } = await c.query<{ id: number }>(
        `INSERT INTO core.api_key (nombre, prefijo, hash_sha256, permisos, limite_por_minuto, usuario_id, contacto)
         VALUES ($1, $2, $3, $4, $5, NULL, $6) RETURNING id`, [nombre, prefijo, hash, sol.permisos, limite, `${sol.nombre} <${sol.correo}>`]);
      await c.query("UPDATE core.solicitud_api_key SET estado = 'aprobada', atendida_por = $2, atendida_en = now(), api_key_id = $3 WHERE id = $1", [id, u.id, k.id]);
      await c.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'solicitud_api_key.aprobar', $2)",
        [u.correo, { solicitud: id, nombre: sol.nombre, correo: sol.correo, prefijo }]);
      await c.query("COMMIT");
      // Sin revalidatePath: la fila debe seguir montada para entregar el token; la lista se refresca al cerrarlo
      return { ok: `Solicitud aprobada. Envía este token a ${sol.correo} por un canal seguro: no se volverá a mostrar.`, token };
    } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  } catch (e) { return error(e); }
}

export async function accionRechazarSolicitud(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("apikeys.gestionar");
    const id = Number(form.get("id"));
    const [s] = await consulta<{ nombre: string }>(
      "UPDATE core.solicitud_api_key SET estado = 'rechazada', atendida_por = $2, atendida_en = now() WHERE id = $1 AND estado = 'pendiente' RETURNING nombre", [id, u.id]);
    if (!s) return { error: "La solicitud ya fue atendida" };
    await auditar(u, "solicitud_api_key.rechazar", { solicitud: id, nombre: s.nombre });
    revalidatePath("/admin/api-keys");
    return { ok: "Solicitud rechazada" };
  } catch (e) { return error(e); }
}
