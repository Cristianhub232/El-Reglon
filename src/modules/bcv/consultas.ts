// Módulo BCV: Tipo de Cambio de Referencia. Tasa oficial = venta_bs (la que publica la portada del BCV).
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";

const FUENTE = "Banco Central de Venezuela, Tipo de Cambio de Referencia (Sistema de Mercado Cambiario)";

interface FilaAplicable { fecha_operacion_consultada: string; fecha_valor: string; moneda: string; tasa_bs: string; dias_diferidos: number; motivo: string }

export async function tasaAplicable(fecha: string, moneda: string) {
  const [f] = await consulta<FilaAplicable>("SELECT * FROM bcv.tasa_aplicable($1::date, $2)", [fecha, moneda]);
  if (!f) {
    const [u] = await consulta<{ max: string | null }>("SELECT max(fecha_valor) FROM bcv.publicacion");
    throw new ErrorApi(404, "tasa_no_disponible",
      `No hay tasa ${moneda} aplicable al ${fecha}. Última fecha valor publicada: ${u?.max ?? "ninguna"}. Nunca se estima una tasa.`);
  }
  return { fecha_operacion: f.fecha_operacion_consultada, fecha_valor: f.fecha_valor, moneda: f.moneda, tasa_bs: f.tasa_bs,
    dias_diferidos: f.dias_diferidos, motivo: f.motivo, base_legal: "Ley de IVA, art. 25", fuente: FUENTE };
}

export async function tasasVigentes(fecha: string) {
  const advertencias: string[] = [];
  const filas = await consulta<FilaAplicable>(
    "SELECT a.* FROM unnest(ARRAY['USD','EUR']) m, LATERAL bcv.tasa_aplicable($1::date, m) a", [fecha]);
  if (filas.length === 2) {
    return { fecha_consultada: fecha, fecha_valor: filas[0].fecha_valor,
      tasas: Object.fromEntries(filas.map((f) => [f.moneda, { tasa_bs: f.tasa_bs }])), fuente: FUENTE, advertencias };
  }
  const ult = await consulta<{ fecha_valor: string; moneda: string; venta_bs: string }>(
    `SELECT fecha_valor, moneda, venta_bs FROM bcv.tasa WHERE moneda IN ('USD','EUR')
       AND fecha_valor = (SELECT max(fecha_valor) FROM bcv.publicacion WHERE fecha_valor <= $1::date)`, [fecha]);
  if (ult.length === 0) throw new ErrorApi(404, "sin_datos", "No hay tasas publicadas");
  advertencias.push(`Aún no hay tasa publicada con fecha valor igual o posterior al ${fecha}; se muestra la última publicada (${ult[0].fecha_valor}).`);
  return { fecha_consultada: fecha, fecha_valor: ult[0].fecha_valor,
    tasas: Object.fromEntries(ult.map((f) => [f.moneda, { tasa_bs: f.venta_bs }])), fuente: FUENTE, advertencias };
}

export async function tasasPorFecha(fechaValor: string, moneda: string | null) {
  const filas = await consulta<Record<string, string | null>>(
    `SELECT t.moneda, m.pais, t.venta_bs AS tasa_bs, t.compra_bs, t.cotizacion_compra, t.cotizacion_venta
       FROM bcv.tasa t JOIN bcv.moneda m ON m.codigo = t.moneda
      WHERE t.fecha_valor = $1::date AND ($2::text IS NULL OR t.moneda = $2) ORDER BY t.moneda`, [fechaValor, moneda]);
  if (filas.length === 0) {
    throw new ErrorApi(404, "sin_publicacion",
      `No hay publicación con fecha valor ${fechaValor}${moneda ? ` para ${moneda}` : ""}. Para la tasa de una operación use /api/v1/bcv/tasa-aplicable.`);
  }
  const [p] = await consulta<{ fecha_operacion: string | null; publicado_en: string | null; tipo: string }>(
    `SELECT p.fecha_operacion, p.publicado_en, f.tipo FROM bcv.publicacion p JOIN bcv.fuente f ON f.id = p.fuente_id
      WHERE p.fecha_valor = $1::date`, [fechaValor]);
  return { fecha_valor: fechaValor, fecha_operacion: p?.fecha_operacion ?? null, publicado_en: p?.publicado_en ?? null,
    origen: p?.tipo ?? null, tasas: filas, fuente: FUENTE };
}

export async function historico(desde: string, hasta: string, moneda: string) {
  if (desde > hasta) throw new ErrorApi(400, "rango_invalido", "'desde' debe ser anterior o igual a 'hasta'");
  const dias = (Date.parse(hasta) - Date.parse(desde)) / 86_400_000;
  if (dias > 731) throw new ErrorApi(400, "rango_invalido", "El rango máximo es de 2 años");
  const filas = await consulta<{ fecha_valor: string; tasa_bs: string }>(
    `SELECT fecha_valor, venta_bs AS tasa_bs FROM bcv.tasa WHERE moneda = $3 AND fecha_valor BETWEEN $1::date AND $2::date
      ORDER BY fecha_valor`, [desde, hasta, moneda]);
  return { moneda, desde, hasta, cantidad: filas.length, tasas: filas, fuente: FUENTE };
}

export async function monedas() {
  return { monedas: await consulta("SELECT codigo, pais, codigo_iso, nota FROM bcv.moneda ORDER BY codigo") };
}

export async function monedaMayorValor(fecha: string) {
  const [f] = await consulta<{ fecha_consultada: string; fecha_valor: string; moneda: string; tasa_bs: string }>(
    "SELECT * FROM bcv.moneda_mayor_valor($1::date)", [fecha]);
  if (!f) throw new ErrorApi(404, "tasa_no_disponible", `No hay publicación aplicable al ${fecha}`);
  return { ...f, base_legal: "Código Orgánico Tributario, arts. 91 y 92 (multas expresadas en la moneda de mayor valor)", fuente: FUENTE };
}

// Conversión con la tasa aplicable a la fecha (art. 25 Ley IVA). Aritmética en PostgreSQL (numeric, sin redondeos de coma flotante).
export async function convertir(monto: string, de: string, a: string, fecha: string) {
  if (de === a) throw new ErrorApi(400, "parametro_invalido", "'de' y 'a' deben ser monedas distintas");
  const tasas: Record<string, Awaited<ReturnType<typeof tasaAplicable>>> = {};
  for (const m of [de, a]) if (m !== "VES") tasas[m] = await tasaAplicable(fecha, m);
  const tDe = de === "VES" ? "1" : tasas[de].tasa_bs;
  const tA = a === "VES" ? "1" : tasas[a].tasa_bs;
  const [r] = await consulta<{ exacto: string; redondeado: string }>(
    "SELECT ($1::numeric * $2::numeric / $3::numeric) AS exacto, round($1::numeric * $2::numeric / $3::numeric, 2) AS redondeado",
    [monto, tDe, tA]);
  return { monto, de, a, fecha_operacion: fecha, resultado: r.redondeado, resultado_exacto: r.exacto,
    tasas_usadas: Object.values(tasas).map((t) => ({ moneda: t.moneda, fecha_valor: t.fecha_valor, tasa_bs: t.tasa_bs })),
    base_legal: "Ley de IVA, art. 25", fuente: FUENTE };
}
