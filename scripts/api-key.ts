// Gestión de API keys (hasta que exista la UI de administración).
//   node scripts/api-key.ts crear --nombre "Mi app" --permisos bcv,arancel [--limite 60]
//   node scripts/api-key.ts listar
//   node scripts/api-key.ts revocar --prefijo 1a2b3c4d
import "./entorno.ts";
import { parseArgs } from "node:util";
import { consulta, pool } from "../src/core/db.ts";
import { generarToken, PERMISOS } from "../src/core/api-key.ts";

const [accion, ...resto] = process.argv.slice(2);
const { values } = parseArgs({ args: resto, options: { nombre: { type: "string" }, permisos: { type: "string" }, limite: { type: "string" }, prefijo: { type: "string" } } });

async function main() {
  if (accion === "crear") {
    const permisos = (values.permisos ?? "").split(",").map((p) => p.trim()).filter(Boolean);
    const invalidos = permisos.filter((p) => !(PERMISOS as readonly string[]).includes(p));
    if (!values.nombre || permisos.length === 0 || invalidos.length) {
      throw new Error(`Uso: crear --nombre <texto> --permisos <${PERMISOS.join(",")}> [--limite N]${invalidos.length ? `. Inválidos: ${invalidos}` : ""}`);
    }
    const { token, prefijo, hash } = generarToken();
    await consulta("INSERT INTO core.api_key (nombre, prefijo, hash_sha256, permisos, limite_por_minuto) VALUES ($1, $2, $3, $4, $5)",
      [values.nombre, prefijo, hash, permisos, Number(values.limite ?? 60)]);
    await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('cli', 'api_key.crear', $1)", [{ prefijo, nombre: values.nombre, permisos }]);
    console.log(`API key creada (se muestra UNA sola vez; guárdela en un lugar seguro):\n\n  ${token}\n\nprefijo=${prefijo} permisos=${permisos.join(",")}`);
  } else if (accion === "listar") {
    console.table(await consulta("SELECT prefijo, nombre, permisos, limite_por_minuto, activa, creada_en, ultimo_uso FROM core.api_key ORDER BY id"));
  } else if (accion === "revocar") {
    const filas = await consulta("UPDATE core.api_key SET activa = false, revocada_en = now() WHERE prefijo = $1 AND activa RETURNING prefijo", [values.prefijo ?? ""]);
    if (filas.length === 0) throw new Error("No hay una clave activa con ese prefijo");
    await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('cli', 'api_key.revocar', $1)", [{ prefijo: values.prefijo }]);
    console.log(`Clave ${values.prefijo} revocada`);
  } else {
    throw new Error("Acciones: crear | listar | revocar");
  }
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool().end());
