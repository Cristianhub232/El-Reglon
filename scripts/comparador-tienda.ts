// Servicio de una tienda del comparador (docs/22). Lo arranca PM2 (comparador/ecosystem.config.cjs), uno por tienda:
//   node scripts/comparador-tienda.ts --tienda=locatel
import "./entorno.ts";
import { tienda } from "../src/modules/comparador/tiendas.ts";
import { iniciarServicio } from "../src/modules/comparador/servicio.ts";

const id = process.argv.find((a) => a.startsWith("--tienda="))?.slice(9) ?? "";
const t = tienda(id);
if (!t) { console.error(`Tienda desconocida: '${id}' (ver datos/comparador/tiendas.json)`); process.exit(1); }
const servidor = iniciarServicio(t, { puerto: t.puerto, escucha: process.env.COMPARADOR_ESCUCHA ?? "127.0.0.1" });
const cerrar = () => servidor.close(() => process.exit(0));
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);
