// Lectura de la portada del BCV y registro de la tasa del día.
// Correcciones respecto a tasas-bcv (docs/analisis/10): miles con punto ("1.023,45"), 8 decimales,
// verificación TLS con el intermediario de Sectigo (nunca se desactiva) y ninguna tasa se sobrescribe.
import { readFileSync, readdirSync } from "node:fs";
import { request } from "node:https";
import { rootCertificates } from "node:tls";
import { join } from "node:path";
import type pg from "pg";
import { pool } from "../../core/db.ts";

export const URL_PORTADA = "https://www.bcv.org.ve/";
const MONEDAS: Record<string, { id: string; pais: string }> = {
  EUR: { id: "euro", pais: "Zona Euro" }, CNY: { id: "yuan", pais: "China" }, TRY: { id: "lira", pais: "Turquia" },
  RUB: { id: "rublo", pais: "Rusia" }, USD: { id: "dolar", pais: "E.U.A." },
};

export function tasaVenezolana(texto: string): string {
  const s = texto.trim().replace(/\s+/g, "");
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) throw new Error(`Tasa con formato inesperado: ${JSON.stringify(texto)}`);
  const v = s.replace(/\./g, "").replace(",", ".");
  if (!(Number(v) > 0)) throw new Error(`Tasa no válida: ${JSON.stringify(texto)}`);
  return v; // texto decimal exacto
}

export interface Portada { fecha_valor: string; tasas: Record<string, string> }

export function parsearPortada(html: string): Portada {
  const i = html.indexOf("view-id-tipo_de_cambio_oficial_del_bcv");
  if (i < 0) throw new Error("No se encontró el bloque del tipo de cambio oficial en la portada del BCV");
  const bloque = html.slice(i, i + 12_000);
  const f = /date-display-single"[^>]*content="(\d{4}-\d{2}-\d{2})/.exec(bloque);
  if (!f) throw new Error("No se encontró la fecha valor en la portada");
  const tasas: Record<string, string> = {};
  for (const [codigo, { id }] of Object.entries(MONEDAS)) {
    const m = new RegExp(`id="${id}"[\\s\\S]*?<strong[^>]*>\\s*([^<]+?)\\s*</strong>`).exec(bloque);
    if (m) tasas[codigo] = tasaVenezolana(m[1]);
  }
  if (!tasas.USD || !tasas.EUR) throw new Error("La portada no trae USD y EUR");
  return { fecha_valor: f[1], tasas };
}

export function certificadosExtra(): string[] {
  const dir = join(process.cwd(), "config", "ca");
  try {
    return readdirSync(dir).filter((f) => f.endsWith(".pem")).map((f) => readFileSync(join(dir, f), "utf8"));
  } catch { return []; }
}

export function descargar(url = URL_PORTADA, redirecciones = 5): Promise<string> {
  return new Promise((resolver, rechazar) => {
    const req = request(url, {
      method: "GET", ca: [...rootCertificates, ...certificadosExtra()], timeout: 30_000,
      headers: { "User-Agent": "ElRenglon/0.1 (tasas BCV; uso informativo)", Accept: "text/html" },
    }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirecciones > 0) {
        res.resume(); descargar(new URL(res.headers.location, url).href, redirecciones - 1).then(resolver, rechazar); return;
      }
      if (res.statusCode !== 200) { res.resume(); rechazar(new Error(`HTTP ${res.statusCode} al descargar ${url}`)); return; }
      const partes: Buffer[] = [];
      res.on("data", (c: Buffer) => partes.push(c));
      res.on("end", () => resolver(Buffer.concat(partes).toString("utf8")));
    });
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado al descargar la portada del BCV")));
    req.on("error", rechazar);
    req.end();
  });
}

export type ResultadoIngesta =
  | { estado: "registrada"; fecha_valor: string; tasas: Record<string, string> }
  | { estado: "sin_cambios"; fecha_valor: string }
  | { estado: "discrepancia"; fecha_valor: string; detalle: string };

export async function registrar(p: Portada, hoy: string): Promise<ResultadoIngesta> {
  const dias = (Date.parse(p.fecha_valor) - Date.parse(hoy)) / 86_400_000;
  if (dias < -10 || dias > 7) throw new Error(`Fecha valor ${p.fecha_valor} fuera de rango respecto a hoy (${hoy})`);
  const c: pg.PoolClient = await pool().connect();
  try {
    await c.query("BEGIN");
    const existentes = await c.query<{ moneda: string; venta_bs: string }>(
      "SELECT moneda, venta_bs FROM bcv.tasa WHERE fecha_valor = $1::date", [p.fecha_valor]);
    if (existentes.rows.length > 0) {
      const dif = existentes.rows.filter((r) => p.tasas[r.moneda] !== undefined && Number(r.venta_bs) !== Number(p.tasas[r.moneda]));
      if (dif.length === 0) { await c.query("COMMIT"); return { estado: "sin_cambios", fecha_valor: p.fecha_valor }; }
      const detalle = dif.map((r) => `${r.moneda}: registrada ${r.venta_bs}, portada ${p.tasas[r.moneda]}`).join("; ");
      await c.query(`INSERT INTO bcv.observacion (tipo, fecha_valor, detalle)
                     SELECT 'discrepancia_portada', $1::date, $2
                     WHERE NOT EXISTS (SELECT 1 FROM bcv.observacion WHERE tipo = 'discrepancia_portada' AND fecha_valor = $1::date AND detalle = $2)`,
        [p.fecha_valor, detalle]);
      await c.query("COMMIT");
      return { estado: "discrepancia", fecha_valor: p.fecha_valor, detalle };
    }
    // Control de plausibilidad: variación del USD frente a la publicación anterior
    const ant = await c.query<{ venta_bs: string }>(
      "SELECT venta_bs FROM bcv.tasa WHERE moneda = 'USD' AND fecha_valor < $1::date ORDER BY fecha_valor DESC LIMIT 1", [p.fecha_valor]);
    if (ant.rows[0]) {
      const variacion = Math.abs(Number(p.tasas.USD) / Number(ant.rows[0].venta_bs) - 1);
      if (variacion > 0.2) throw new Error(`Variación del USD de ${(variacion * 100).toFixed(1)} % frente a la publicación anterior: se requiere revisión`);
    }
    const fuente = await c.query<{ id: number }>(
      "INSERT INTO bcv.fuente (tipo, archivo, periodo) VALUES ('portada', $1, $2) RETURNING id",
      [`${URL_PORTADA} (fecha valor ${p.fecha_valor})`, p.fecha_valor.slice(0, 7)]);
    await c.query("INSERT INTO bcv.publicacion (fecha_valor, fecha_operacion, publicado_en, fuente_id) VALUES ($1::date, NULL, now(), $2)",
      [p.fecha_valor, fuente.rows[0].id]);
    for (const [moneda, venta] of Object.entries(p.tasas)) {
      await c.query("INSERT INTO bcv.moneda (codigo, pais, codigo_iso) VALUES ($1, $2, $1) ON CONFLICT (codigo) DO NOTHING",
        [moneda, MONEDAS[moneda].pais]);
      await c.query("INSERT INTO bcv.tasa (fecha_valor, moneda, venta_bs) VALUES ($1::date, $2, $3::numeric)", [p.fecha_valor, moneda, venta]);
    }
    await c.query("DELETE FROM bcv.dia_sin_publicacion WHERE fecha = $1::date", [p.fecha_valor]);
    await c.query("COMMIT");
    return { estado: "registrada", fecha_valor: p.fecha_valor, tasas: p.tasas };
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Cada lectura queda en la auditoría (el panel muestra la última y la portada su hora)
export async function ingestar(hoy: string, actor = "bcv-ingesta"): Promise<ResultadoIngesta> {
  const auditar = (accion: string, detalle: unknown) =>
    pool().query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, $2, $3)", [actor, accion, detalle]).catch(() => {});
  try {
    const r = await registrar(parsearPortada(await descargar()), hoy);
    await auditar(`bcv.${r.estado}`, r);
    return r;
  } catch (e) {
    await auditar("bcv.lectura_fallida", { error: (e as Error).message });
    throw e;
  }
}
