// Suscripciones a los avisos push (docs/24): alta o cambio de temas y RIF seguidos, estado de un dispositivo y baja
import { consulta, pool } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { enviar, registrarEnvioSuelto, servicioValido, TEMAS, type Destino, type Tema } from "./envio.ts";

export interface RifSeguido { rif: string; tipo: "ESPECIAL" | "ORDINARIO"; condiciones: string[] }
interface Cuerpo { suscripcion?: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }; temas?: unknown; rifs?: unknown }

const B64URL = /^[A-Za-z0-9_-]+$/;

export function leerSuscripcion(b: Cuerpo) {
  const s = b.suscripcion;
  const endpoint = typeof s?.endpoint === "string" ? s.endpoint : "";
  const p256dh = typeof s?.keys?.p256dh === "string" ? s.keys.p256dh : "", auth = typeof s?.keys?.auth === "string" ? s.keys.auth : "";
  if (!servicioValido(endpoint)) throw new ErrorApi(400, "suscripcion_invalida", "La suscripción no es de un servicio de avisos de un navegador");
  if (!B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100 || !B64URL.test(auth) || auth.length < 16 || auth.length > 32) {
    throw new ErrorApi(400, "suscripcion_invalida", "Las claves de la suscripción no son válidas");
  }
  return { endpoint, p256dh, auth };
}

async function validarRifs(lista: unknown): Promise<RifSeguido[]> {
  if (!Array.isArray(lista)) return [];
  if (lista.length > 5) throw new ErrorApi(400, "demasiados_rif", "Puedes seguir como mucho 5 RIF por dispositivo");
  const condicionesValidas = new Set((await consulta<{ codigo: string }>("SELECT codigo FROM calendario.condicion")).map((c) => c.codigo));
  const salida: RifSeguido[] = [];
  for (const x of lista as { rif?: unknown; tipo?: unknown; condiciones?: unknown }[]) {
    const tipo = String(x?.tipo ?? "").toUpperCase();
    if (tipo !== "ESPECIAL" && tipo !== "ORDINARIO") throw new ErrorApi(400, "tipo_invalido", "El tipo de contribuyente debe ser especial u ordinario");
    const [v] = await consulta<{ valido: boolean; rif_formateado: string | null; mensaje: string }>("SELECT valido, rif_formateado, mensaje FROM rif.validar($1)", [String(x?.rif ?? "").slice(0, 20)]);
    if (!v?.valido || !v.rif_formateado) throw new ErrorApi(400, "rif_invalido", `RIF ${String(x?.rif ?? "")}: ${v?.mensaje ?? "no válido"}`);
    const condiciones = tipo === "ESPECIAL" && Array.isArray(x.condiciones) ? [...new Set(x.condiciones.map(String).filter((c) => condicionesValidas.has(c)))] : [];
    if (!salida.some((s) => s.rif === v.rif_formateado)) salida.push({ rif: v.rif_formateado, tipo, condiciones });
  }
  return salida;
}

export async function guardarSuscripcion(b: Cuerpo, extra: { visitante: string | null; agente: string; despues: (fn: () => Promise<void>) => void }) {
  const s = leerSuscripcion(b);
  const temas = Array.isArray(b.temas) ? [...new Set(b.temas.filter((t): t is Tema => TEMAS.includes(t as Tema)))] : [];
  const rifs = temas.includes("deberes") ? await validarRifs(b.rifs) : [];
  if (temas.includes("deberes") && !rifs.length) throw new ErrorApi(400, "falta_rif", "Para los avisos de deberes indica al menos un RIF");
  const c = await pool().connect();
  let nueva = false, id: number;
  try {
    await c.query("BEGIN");
    const { rows: [f] } = await c.query<{ id: string; nueva: boolean }>(
      `INSERT INTO avisos.suscripcion (endpoint, p256dh, auth, temas, visitante_id, agente) VALUES ($1, $2, $3, $4, $5::uuid, $6)
       ON CONFLICT (endpoint) DO UPDATE SET p256dh = $2, auth = $3, temas = $4, actualizada_en = now(), fallos = 0,
         visitante_id = coalesce(avisos.suscripcion.visitante_id, EXCLUDED.visitante_id)
       RETURNING id, (xmax = 0) AS nueva`, [s.endpoint, s.p256dh, s.auth, temas, extra.visitante, extra.agente.slice(0, 400)]);
    id = Number(f.id); nueva = f.nueva;
    await c.query("DELETE FROM avisos.suscripcion_rif WHERE suscripcion_id = $1", [id]);
    for (const r of rifs) await c.query("INSERT INTO avisos.suscripcion_rif (suscripcion_id, rif, tipo, condiciones) VALUES ($1, $2, $3, $4)", [id, r.rif, r.tipo, r.condiciones]);
    await c.query("COMMIT");
  } catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
  // Primera vez: un aviso de bienvenida confirma que funciona en este dispositivo. Va después de responder y con unos
  // segundos de espera, porque FCM puede rechazar (410) una suscripción recién creada; si falla, se reintenta una vez.
  if (nueva && temas.length) extra.despues(() => bienvenida({ id, ...s }));
  return { temas, rifs, nueva };
}

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function bienvenida(destino: Destino) {
  const aviso = { titulo: "Avisos activados", cuerpo: "Así te llegarán los avisos de El Renglón. Puedes cambiar los temas cuando quieras desde la campana.", url: "/", etiqueta: "bienvenida" };
  let r = { entregados: 0, fallidos: 1 };
  for (const espera of [4_000, 15_000]) {
    await pausa(espera);
    if (!(await consulta("SELECT 1 FROM avisos.suscripcion WHERE id = $1", [destino.id])).length) return;   // ya se dio de baja
    r = await enviar([destino], aviso, 6 * 3600, false).catch(() => ({ entregados: 0, fallidos: 1 }));
    if (r.entregados) break;
  }
  await registrarEnvioSuelto("bienvenida", aviso, "automatico", { destinatarios: 1, ...r }).catch(() => {});
}

export async function estadoSuscripcion(endpoint: string) {
  const [s] = await consulta<{ id: string; temas: string[] }>("SELECT id, temas FROM avisos.suscripcion WHERE endpoint = $1", [endpoint]);
  if (!s) return null;
  const rifs = await consulta<RifSeguido & Record<string, unknown>>("SELECT rif, tipo, condiciones FROM avisos.suscripcion_rif WHERE suscripcion_id = $1 ORDER BY rif", [s.id]);
  return { temas: s.temas, rifs };
}

export async function darDeBaja(endpoint: string) {
  const filas = await consulta("DELETE FROM avisos.suscripcion WHERE endpoint = $1 RETURNING 1", [endpoint]);
  return { borrada: filas.length > 0 };
}
