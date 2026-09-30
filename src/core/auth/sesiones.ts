// Inicio de sesión y sesiones del panel (en base de datos). Sin dependencias de Next: lo usan las acciones y la CLI.
// El navegador guarda un token aleatorio de 32 bytes; la base solo su SHA-256. Expira a las 12 h, o a los 30 días
// si se marcó "mantener la sesión"; cada uso la renueva dentro de ese plazo.
import { randomBytes } from "node:crypto";
import { consulta, pool } from "../db.ts";
import { sha256 } from "../api-key.ts";
import { HASH_SENUELO, verificarClave } from "./claves.ts";
import { descifrarSecreto, verificarTotp } from "./totp.ts";
import type { Rol } from "./roles.ts";

export const COOKIE_SESION = "renglon_sesion";
export const DURACION_CORTA = 12 * 3600;        // segundos
export const DURACION_LARGA = 30 * 24 * 3600;
const MAX_INTENTOS = 5, BLOQUEO_MIN = 15;

export interface Usuario {
  id: number; nombre: string; correo: string; rol: Rol; debe_cambiar_clave: boolean; totp_activo: boolean;
  notificaciones_vistas_en: string;
}

export type ResultadoIngreso =
  | { ok: true; token: string; usuario: Usuario; segundos: number }
  | { ok: false; error: string; pideCodigo?: boolean };

const auditar = (actor: string, accion: string, detalle: unknown) =>
  consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, $2, $3)", [actor, accion, detalle]).catch(() => {});

export async function ingresar(correo: string, clave: string, codigo: string, mantener: boolean, agente: string | null): Promise<ResultadoIngreso> {
  const generico = "Correo o contraseña incorrectos";
  const [u] = await consulta<Usuario & { clave_hash: string; totp_secreto: string | null; activo: boolean; bloqueado: boolean; intentos_fallidos: number }>(
    `SELECT id, nombre, correo, rol, clave_hash, debe_cambiar_clave, totp_activo, totp_secreto, activo, intentos_fallidos,
            notificaciones_vistas_en, coalesce(bloqueado_hasta > now(), false) AS bloqueado
       FROM core.usuario WHERE lower(correo) = lower($1)`, [correo.trim()]);
  const claveOk = await verificarClave(clave, u?.clave_hash ?? HASH_SENUELO);   // mismo costo exista o no la cuenta
  if (!u || !u.activo) return { ok: false, error: generico };
  if (u.bloqueado) return { ok: false, error: `Cuenta bloqueada temporalmente por intentos fallidos. Intente en ${BLOQUEO_MIN} minutos.` };
  const fallar = async (error: string, motivo: string, pideCodigo = false): Promise<ResultadoIngreso> => {
    const [f] = await consulta<{ intentos_fallidos: number }>(
      `UPDATE core.usuario SET intentos_fallidos = intentos_fallidos + 1,
              bloqueado_hasta = CASE WHEN intentos_fallidos + 1 >= $2 THEN now() + make_interval(mins => $3) END
        WHERE id = $1 RETURNING intentos_fallidos`, [u.id, MAX_INTENTOS, BLOQUEO_MIN]);
    await auditar(u.correo, "sesion.fallida", { motivo, intentos: f?.intentos_fallidos });
    return { ok: false, error, pideCodigo };
  };
  if (!claveOk) return fallar(generico, "contraseña");
  if (u.totp_activo) {
    if (!codigo.trim()) return { ok: false, error: "Ingresa el código de verificación de tu app autenticadora", pideCodigo: true };
    if (!verificarTotp(descifrarSecreto(u.totp_secreto!), codigo)) return fallar("El código de verificación no es válido", "código TOTP", true);
  }
  const token = randomBytes(32).toString("base64url");
  const segundos = mantener ? DURACION_LARGA : DURACION_CORTA;
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await c.query("INSERT INTO core.sesion (token_hash, usuario_id, expira_en, agente) VALUES ($1, $2, now() + make_interval(secs => $3), $4)",
      [sha256(token), u.id, segundos, agente?.slice(0, 300) ?? null]);
    await c.query("UPDATE core.usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = now() WHERE id = $1", [u.id]);
    await c.query("DELETE FROM core.sesion WHERE expira_en < now()");
    await c.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'sesion.inicio', $2)", [u.correo, { mantener }]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  const { clave_hash: _h, totp_secreto: _s, activo: _a, bloqueado: _b, intentos_fallidos: _i, ...usuario } = u;
  return { ok: true, token, usuario, segundos };
}

// Usuario de una sesión vigente (renueva su último uso como mucho una vez por minuto)
export async function usuarioDeSesion(token: string | undefined): Promise<Usuario | null> {
  if (!token || token.length > 100) return null;
  const [u] = await consulta<Usuario & { renovar: boolean }>(
    `SELECT u.id, u.nombre, u.correo, u.rol, u.debe_cambiar_clave, u.totp_activo, u.notificaciones_vistas_en,
            s.ultimo_uso < now() - interval '1 minute' AS renovar
       FROM core.sesion s JOIN core.usuario u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_en > now() AND u.activo`, [sha256(token)]);
  if (!u) return null;
  if (u.renovar) void consulta("UPDATE core.sesion SET ultimo_uso = now() WHERE token_hash = $1", [sha256(token)]).catch(() => {});
  const { renovar: _r, ...usuario } = u;
  return usuario;
}

export async function cerrarSesion(token: string | undefined, correo?: string) {
  if (!token) return;
  await consulta("DELETE FROM core.sesion WHERE token_hash = $1", [sha256(token)]);
  if (correo) await auditar(correo, "sesion.cierre", {});
}
