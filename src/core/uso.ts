// Contador de consultas por día (Caracas), API key y módulo. Se acumula en memoria y se escribe cada 30 s en
// core.uso_diario (una fila por combinación): no se guarda IP ni el contenido de las consultas.
import { consulta } from "./db.ts";
import { hoyCaracas } from "./validacion.ts";

const pendiente = new Map<string, { consultas: number; errores: number; limitadas: number }>();
let temporizador: ReturnType<typeof setInterval> | null = null;

export function registrarUso(apiKeyId: number | null, modulo: string, estado: number) {
  const k = `${hoyCaracas()}|${apiKeyId ?? 0}|${modulo}`;
  const v = pendiente.get(k) ?? { consultas: 0, errores: 0, limitadas: 0 };
  v.consultas += 1;
  if (estado >= 400) v.errores += 1;
  if (estado === 429) v.limitadas += 1;
  pendiente.set(k, v);
  if (!temporizador) {
    temporizador = setInterval(() => void escribirUso(), 30_000);
    temporizador.unref?.();
  }
}

export async function escribirUso() {
  if (pendiente.size === 0) return;
  const filas = [...pendiente.entries()].map(([k, v]) => { const [fecha, id, modulo] = k.split("|"); return { fecha, api_key_id: Number(id), modulo, ...v }; });
  pendiente.clear();
  await consulta(
    `INSERT INTO core.uso_diario AS u (fecha, api_key_id, modulo, consultas, errores, limitadas)
     SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(fecha date, api_key_id int, modulo text, consultas int, errores int, limitadas int)
     ON CONFLICT (fecha, api_key_id, modulo) DO UPDATE SET consultas = u.consultas + EXCLUDED.consultas,
       errores = u.errores + EXCLUDED.errores, limitadas = u.limitadas + EXCLUDED.limitadas`, [JSON.stringify(filas)])
    .catch((e) => console.error("[el-renglon] no se pudo registrar el uso:", e.message));
}
