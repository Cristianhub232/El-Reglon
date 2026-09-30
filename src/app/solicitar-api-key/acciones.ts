"use server";
// Solicitud pública de API key: queda pendiente hasta que un superadministrador la aprueba en el panel
import { headers } from "next/headers";
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { limitarPorIp } from "../../core/limite-ip.ts";

export interface EstadoSolicitud { error?: string; ok?: boolean }
const MODULOS = ["iva", "bcv", "arancel", "calendario", "rif"];

export async function accionSolicitar(_p: EstadoSolicitud, form: FormData): Promise<EstadoSolicitud> {
  try { limitarPorIp(await headers(), "solicitud-api-key", 3); }
  catch (e) { return { error: e instanceof ErrorApi ? "Demasiadas solicitudes desde esta conexión. Intenta en un minuto." : "No se pudo enviar" }; }
  if (String(form.get("sitio_web") ?? "")) return { ok: true };   // campo trampa: solo lo llenan los robots
  const t = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const nombre = t("nombre", 120), correo = t("correo", 200), organizacion = t("organizacion", 160) || null, uso = t("uso", 1000);
  const permisos = form.getAll("permisos").map(String).filter((p) => MODULOS.includes(p));
  if (nombre.length < 2) return { error: "Escribe tu nombre" };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) return { error: "Escribe un correo válido: ahí te contactaremos" };
  if (uso.length < 10) return { error: "Cuéntanos en una o dos frases para qué usarás la API" };
  if (permisos.length === 0) return { error: "Elige al menos un módulo" };
  const [s] = await consulta<{ id: number }>(
    "INSERT INTO core.solicitud_api_key (nombre, correo, organizacion, uso, permisos) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [nombre, correo, organizacion, uso, permisos]);
  await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('web', 'solicitud_api_key.crear', $1)",
    [{ solicitud: s.id, nombre, organizacion, permisos }]);
  return { ok: true };
}
