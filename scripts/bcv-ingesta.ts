// Una lectura de la portada del BCV. Salida: 0 registrada/sin cambios, 2 discrepancia, 1 error.
import "./entorno.ts";
import { pool } from "../src/core/db.ts";
import { ingestar } from "../src/modules/bcv/ingesta.ts";
import { hoyCaracas } from "../src/core/validacion.ts";

ingestar(hoyCaracas())
  .then((r) => { console.log(JSON.stringify({ momento: new Date().toISOString(), ...r })); if (r.estado === "discrepancia") process.exitCode = 2; })
  .catch((e) => { console.error(`[bcv-ingesta] ${e.message}`); process.exitCode = 1; })
  .finally(() => pool().end());
