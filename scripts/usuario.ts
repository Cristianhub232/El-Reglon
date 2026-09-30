// Usuarios del panel desde la terminal (el primer superadministrador se crea aquí).
//   node scripts/usuario.ts crear --correo ana@ejemplo.com --nombre "Ana Pérez" --rol super
//   node scripts/usuario.ts listar
//   node scripts/usuario.ts restablecer --correo ana@ejemplo.com [--sin-2fa]   (nueva contraseña temporal)
//   node scripts/usuario.ts desactivar --correo ana@ejemplo.com
// La contraseña temporal se muestra una sola vez; al entrar, el panel exige cambiarla.
import "./entorno.ts";
import { parseArgs } from "node:util";
import { consulta, pool } from "../src/core/db.ts";
import { claveTemporal, hashClave } from "../src/core/auth/claves.ts";
import { ROLES, type Rol } from "../src/core/auth/roles.ts";

const [accion, ...resto] = process.argv.slice(2);
const { values: v } = parseArgs({ args: resto, options: { correo: { type: "string" }, nombre: { type: "string" }, rol: { type: "string" }, "sin-2fa": { type: "boolean" } } });
const auditar = (accionAud: string, detalle: unknown) => consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('cli', $1, $2)", [accionAud, detalle]);

async function main() {
  if (accion === "crear") {
    if (!v.correo || !v.nombre || !v.rol || !(v.rol in ROLES)) throw new Error(`Uso: crear --correo <correo> --nombre <nombre> --rol <${Object.keys(ROLES).join("|")}>`);
    const clave = claveTemporal();
    await consulta("INSERT INTO core.usuario (nombre, correo, rol, clave_hash) VALUES ($1, $2, $3, $4)", [v.nombre, v.correo.trim(), v.rol, await hashClave(clave)]);
    await auditar("usuario.crear", { correo: v.correo, rol: v.rol });
    console.log(`Usuario creado: ${v.correo} (${ROLES[v.rol as Rol].nombre}).\nContraseña temporal (se muestra UNA vez; al entrar se pide cambiarla):\n\n  ${clave}\n`);
  } else if (accion === "listar") {
    console.table(await consulta("SELECT id, nombre, correo, rol, activo, totp_activo AS \"2fa\", ultimo_acceso FROM core.usuario ORDER BY id"));
  } else if (accion === "restablecer") {
    const clave = claveTemporal();
    const filas = await consulta(`UPDATE core.usuario SET clave_hash = $2, debe_cambiar_clave = true, intentos_fallidos = 0, bloqueado_hasta = NULL
        ${v["sin-2fa"] ? ", totp_activo = false, totp_secreto = NULL" : ""} WHERE lower(correo) = lower($1) RETURNING id`, [v.correo ?? "", await hashClave(clave)]);
    if (!filas.length) throw new Error("No existe un usuario con ese correo");
    await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [(filas[0] as { id: number }).id]);
    await auditar("usuario.restablecer", { correo: v.correo, sin_2fa: !!v["sin-2fa"] });
    console.log(`Contraseña temporal para ${v.correo}:\n\n  ${clave}\n`);
  } else if (accion === "desactivar") {
    const filas = await consulta("UPDATE core.usuario SET activo = false WHERE lower(correo) = lower($1) RETURNING id", [v.correo ?? ""]);
    if (!filas.length) throw new Error("No existe un usuario con ese correo");
    await consulta("DELETE FROM core.sesion WHERE usuario_id = $1", [(filas[0] as { id: number }).id]);
    await auditar("usuario.desactivar", { correo: v.correo });
    console.log(`Usuario ${v.correo} desactivado`);
  } else {
    throw new Error("Acciones: crear | listar | restablecer | desactivar");
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool().end());
