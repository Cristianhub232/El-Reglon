// Proceso permanente: lee la portada del BCV a las horas de BCV_HORAS (por defecto 8,14,20, hora de Caracas, UTC-4).
// Si falla, reintenta cada 15 minutos hasta 3 veces antes de esperar la siguiente hora.
import "./entorno.ts";
import { ingestar } from "../src/modules/bcv/ingesta.ts";
import { avisarTasa } from "../src/modules/avisos/temas.ts";
import { hoyCaracas } from "../src/core/validacion.ts";

const horas = (process.env.BCV_HORAS ?? "8,14,20").split(",").map(Number).filter((h) => Number.isInteger(h) && h >= 0 && h <= 23).sort((a, b) => a - b);
if (horas.length === 0) throw new Error("BCV_HORAS no contiene horas válidas");

function proxima(desde = Date.now()): number {
  const caracas = new Date(desde - 4 * 3600_000);                 // reloj de Caracas expresado en UTC
  for (let dia = 0; dia < 2; dia++) {
    for (const h of horas) {
      const t = Date.UTC(caracas.getUTCFullYear(), caracas.getUTCMonth(), caracas.getUTCDate() + dia, h) + 4 * 3600_000;
      if (t > desde) return t;
    }
  }
  throw new Error("sin próxima ejecución");
}

async function ejecutar(intento = 1): Promise<void> {
  try {
    const r = await ingestar(hoyCaracas(), "bcv-programador");
    console.log(JSON.stringify({ momento: new Date().toISOString(), ...r }));
    // Tasa nueva: aviso push a quienes lo pidieron (docs/24); si falla, la lectura de la tasa no se ve afectada
    if (r.estado === "registrada") {
      await avisarTasa(r.fecha_valor).then((a) => a && console.log(`[bcv-programador] aviso de tasa: ${JSON.stringify(a)}`))
        .catch((e) => console.error(`[bcv-programador] aviso de tasa: ${(e as Error).message}`));
    }
  } catch (e) {
    console.error(`[bcv-programador] intento ${intento}: ${(e as Error).message}`);
    if (intento < 4) { await new Promise((r) => setTimeout(r, 15 * 60_000)); return ejecutar(intento + 1); }
  }
}

async function ciclo(): Promise<never> {
  if (process.env.BCV_AL_INICIAR === "1") await ejecutar();
  for (;;) {
    const t = proxima();
    console.log(`[bcv-programador] próxima lectura: ${new Date(t).toISOString()}`);
    await new Promise((r) => setTimeout(r, t - Date.now()));
    await ejecutar();
  }
}

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
void ciclo();
