// Proceso permanente: lee el noticiero (docs/20) cada hora, en el minuto NOTICIAS_MINUTO (por defecto 5). Al arrancar lee
// enseguida si la última lectura tiene más de una hora. Con --una-vez hace una sola lectura y termina.
import "./entorno.ts";
import { consulta, pool } from "../src/core/db.ts";
import { recolectar } from "../src/modules/noticias/recolector.ts";
import { avisosProgramados } from "../src/modules/avisos/temas.ts";
import { cicloProspeccion } from "../src/modules/prospeccion/programador.ts";
import { revisarRespuestas } from "../src/modules/contacto/buzon.ts";

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


// Analítica del sitio (docs/23): visitas y RIF consultados de más de 12 meses se borran (cada hora, de paso)
// Avisos push programados (docs/24): resumen de noticias (8, 13 y 19 h) y vencimientos (8 h)
async function avisos() {
  try {
    const r = await avisosProgramados();
    if (Object.values(r).some(Boolean)) console.log(JSON.stringify({ momento: new Date().toISOString(), avisos: r }));
  } catch (e) { console.error(`[noticias-programador] avisos: ${(e as Error).message}`); }
}

async function purgarAnalitica() {
  try {
    const [r] = await consulta<{ n: number }>("SELECT analitica.purgar() AS n");
    if (r?.n) console.log(`[noticias-programador] analítica: ${r.n} registros de más de 12 meses borrados`);
  } catch (e) { console.error(`[noticias-programador] analítica: ${(e as Error).message}`); }
}

// Prospección por correo (docs/26): cada 5 minutos; envía como mucho un correo por ciclo y solo si está activa
async function prospeccion() {
  try {
    const r = await cicloProspeccion();
    if (r.enviado) console.log(JSON.stringify({ momento: new Date().toISOString(), prospeccion: r.enviado }));
  } catch (e) { console.error(`[noticias-programador] prospección: ${(e as Error).message}`); }
  // Respuestas de los prospectos en ventas@ (docs/27): baja, rebote o respondió
  try {
    const r = await revisarRespuestas();
    if (r?.cambios.length) console.log(JSON.stringify({ momento: new Date().toISOString(), respuestas: r.cambios }));
  } catch (e) { console.error(`[noticias-programador] buzón ventas@: ${(e as Error).message}`); }
}

function proxima(desde = Date.now()): number {
  const t = new Date(desde); t.setUTCMinutes(minuto, 0, 0);
  return t.getTime() > desde ? t.getTime() : t.getTime() + 3600_000;
}

async function ciclo(): Promise<never> {
  const [u] = await consulta<{ vieja: boolean }>("SELECT coalesce(max(terminada) < now() - interval '1 hour', true) AS vieja FROM noticias.lectura");
  if (u.vieja) await ejecutar("programador");
  await purgarAnalitica();
  await avisos();
  setInterval(() => void prospeccion(), 5 * 60_000);
  for (;;) {
    const t = proxima();
    console.log(`[noticias-programador] próxima lectura: ${new Date(t).toISOString()}`);
    await new Promise((r) => setTimeout(r, t - Date.now()));
    await ejecutar("programador");
    await purgarAnalitica();
    await avisos();
  }
}

if (process.argv.includes("--una-vez")) {
  await ejecutar("consola");
  await pool().end();
} else {
  process.on("SIGTERM", () => process.exit(0));
  process.on("SIGINT", () => process.exit(0));
  void ciclo();
}
