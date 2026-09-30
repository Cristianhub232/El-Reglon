// Datos de la página principal, todos de las tablas oficiales: tasas BCV con su serie de 7 días, días inhábiles,
// alícuotas vigentes, cifras del ecosistema y los titulares del noticiero (medios venezolanos, cada hora).
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { titularesPortada, ultimaLectura } from "../noticias/consultas.ts";

export interface Moneda { codigo: "USD" | "EUR"; tasa: string; variacion: number | null; serie: number[] }

async function tasas(hoy: string) {
  // Publicación aplicable a hoy (art. 25): la de hoy o, si hoy es inhábil, la del siguiente día hábil ya publicada;
  // si todavía no hay una con fecha valor >= hoy, la última publicada.
  const [p] = await consulta<{ fecha_valor: string }>(
    `SELECT coalesce((SELECT min(fecha_valor) FROM bcv.publicacion WHERE fecha_valor >= $1::date),
                     (SELECT max(fecha_valor) FROM bcv.publicacion)) AS fecha_valor`, [hoy]);
  if (!p?.fecha_valor) return null;
  const filas = await consulta<{ fecha_valor: string; moneda: "USD" | "EUR"; venta_bs: string }>(
    `SELECT t.fecha_valor, t.moneda, t.venta_bs FROM bcv.tasa t
      WHERE t.moneda IN ('USD', 'EUR') AND t.fecha_valor IN (
        SELECT fecha_valor FROM bcv.publicacion WHERE fecha_valor <= $1::date ORDER BY fecha_valor DESC LIMIT 7)
      ORDER BY t.fecha_valor`, [p.fecha_valor]);
  const monedas = (["USD", "EUR"] as const).map((codigo): Moneda => {
    const serie = filas.filter((f) => f.moneda === codigo);
    const [ant, ult] = serie.slice(-2);
    return { codigo, tasa: ult?.venta_bs ?? "0", serie: serie.map((f) => Number(f.venta_bs)),
      variacion: ant && ult ? (Number(ult.venta_bs) / Number(ant.venta_bs) - 1) * 100 : null };
  });
  const [lectura] = await consulta<{ momento: string | null; publicado_en: string | null }>(
    `SELECT (SELECT max(ocurrido_en) FROM core.auditoria WHERE accion IN ('bcv.registrada', 'bcv.sin_cambios', 'bcv.discrepancia')) AS momento,
            (SELECT publicado_en FROM bcv.publicacion WHERE fecha_valor = $1::date) AS publicado_en`, [p.fecha_valor]);
  return { fecha_valor: p.fecha_valor, vigente: p.fecha_valor >= hoy, monedas, leida: lectura?.momento ?? lectura?.publicado_en ?? null };
}

export async function datosPortada() {
  const hoy = hoyCaracas();
  const [bcv, inhabiles, alicuotas, cifras, noticias, noticiasLeidas] = await Promise.all([
    tasas(hoy),
    consulta<{ fecha: string; descripcion: string; tipo: "NACIONAL" | "BANCARIO" }>(
      "SELECT fecha, descripcion, tipo FROM calendario.dia_inhabil WHERE fecha >= $1::date ORDER BY fecha LIMIT 6", [hoy]),
    consulta<{ codigo: string; porcentaje: string }>("SELECT codigo, porcentaje FROM iva.alicuotas_vigentes($1::date)", [hoy]),
    consulta<{ reglas: string; publicaciones: string; desde: string | null }>(
      `SELECT (SELECT count(*) FROM iva.regla) AS reglas, (SELECT count(*) FROM bcv.publicacion) AS publicaciones,
              (SELECT extract(year FROM min(fecha_valor))::text FROM bcv.publicacion) AS desde`),
    titularesPortada(5).catch(() => []),          // sin el esquema del noticiero, la portada sigue funcionando
    ultimaLectura().catch(() => null),
  ]);
  const pct = (c: string) => alicuotas.find((a) => a.codigo === c)?.porcentaje ?? null;

  return {
    hoy, bcv, inhabiles, noticias, noticiasLeidas,
    alicuotas: { general: pct("GENERAL"), reducida: pct("REDUCIDA"), adicional: pct("ADICIONAL_SUNTUARIA") },
    cifras: { reglas: Number(cifras[0]?.reglas ?? 0), publicaciones: Number(cifras[0]?.publicaciones ?? 0), desde: cifras[0]?.desde ?? null },
  };
}

export type DatosPortada = Awaited<ReturnType<typeof datosPortada>>;
