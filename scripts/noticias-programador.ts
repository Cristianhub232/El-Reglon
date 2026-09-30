// Proceso permanente: lee el noticiero y el Pulso oficial (docs/20 y 21) cada hora, en el minuto NOTICIAS_MINUTO (por defecto 5). Al arrancar lee
// enseguida si la última lectura tiene más de una hora. Con --una-vez hace una sola lectura y termina.
import "./entorno.ts";
import { consulta, pool } from "../src/core/db.ts";
import { recolectar } from "../src/modules/noticias/recolector.ts";
import { recolectarPulso } from "../src/modules/pulso/recolector.ts";

const minuto = Number(process.env.NOTICIAS_MINUTO ?? 5);
if (!Number.isInteger(minuto) || minuto < 0 || minuto > 59) throw new Error("NOTICIAS_MINUTO debe estar entre 0 y 59");

async function ejecutar(origen: string) {
  try {
    const r = await recolectar(origen, process.argv.find((a) => a.startsWith("--fuente="))?.slice(9));
    const errores = Object.entries(r.fuentes).filter(([, f]) => f.error).map(([id, f]) => `${id}: ${f.error}`);
    console.log(JSON.stringify({ momento: new Date().toISOString(), estado: r.estado, nuevos: r.nuevos, actualizados: r.actualizados,
      cuota_worldnews: r.cuota_worldnews ?? null, errores }));
  } catch (e) {
    console.error(`[noticias-programador] ${(e as Error).message}`);
  }
}

async function ejecutarPulso() {
  try {
    const r = await recolectarPulso();
    console.log(JSON.stringify({ momento: new Date().toISOString(), pulso: true, nuevas: r.nuevas,
      errores: Object.entries(r.cuentas).filter(([, c]) => c.error).map(([id, c]) => `${id}: ${c.error}`) }));
  } catch (e) {
    console.error(`[noticias-programador] pulso: ${(e as Error).message}`);
  }
}
const leerTodo = async (origen: string) => { await ejecutar(origen); await ejecutarPulso(); };

function proxima(desde = Date.now()): number {
  const t = new Date(desde); t.setUTCMinutes(minuto, 0, 0);
  return t.getTime() > desde ? t.getTime() : t.getTime() + 3600_000;
}

async function ciclo(): Promise<never> {
  const [u] = await consulta<{ vieja: boolean }>("SELECT coalesce(max(terminada) < now() - interval '1 hour', true) AS vieja FROM noticias.lectura");
  if (u.vieja) await leerTodo("programador");
  for (;;) {
    const t = proxima();
    console.log(`[noticias-programador] próxima lectura: ${new Date(t).toISOString()}`);
    await new Promise((r) => setTimeout(r, t - Date.now()));
    await leerTodo("programador");
  }
}

if (process.argv.includes("--una-vez")) {
  if (!process.argv.includes("--solo-pulso")) await ejecutar("consola");
  if (!process.argv.some((a) => a.startsWith("--fuente="))) await ejecutarPulso();
  await pool().end();
} else {
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  void ciclo();
}
