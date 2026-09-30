// Datos de la página principal, todos de las tablas oficiales: tasas BCV con su serie de 7 días, días inhábiles,
// alícuotas vigentes, cifras del ecosistema y "noticias" generadas a partir de las publicaciones oficiales.
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { diaMes, fechaLarga, fechaCorta, numero } from "../../ui/formato.ts";

export interface Moneda { codigo: "USD" | "EUR"; tasa: string; variacion: number | null; serie: number[] }
export interface Noticia { categoria: string; fuente: string; cuando: string; titulo: string; texto?: string; cifra: string; cifraNota: string; color: string }

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
  const [bcv, inhabiles, alicuotas, cifras, especiales, arancel] = await Promise.all([
    tasas(hoy),
    consulta<{ fecha: string; descripcion: string; tipo: "NACIONAL" | "BANCARIO" }>(
      "SELECT fecha, descripcion, tipo FROM calendario.dia_inhabil WHERE fecha >= $1::date ORDER BY fecha LIMIT 6", [hoy]),
    consulta<{ codigo: string; porcentaje: string }>("SELECT codigo, porcentaje FROM iva.alicuotas_vigentes($1::date)", [hoy]),
    consulta<{ reglas: string; publicaciones: string; desde: string | null }>(
      `SELECT (SELECT count(*) FROM iva.regla) AS reglas, (SELECT count(*) FROM bcv.publicacion) AS publicaciones,
              (SELECT extract(year FROM min(fecha_valor))::text FROM bcv.publicacion) AS desde`),
    consulta<{ fecha: string; limite: string; terminales: number[] }>(
      `SELECT v.fecha, coalesce(v.fecha_prorrogada, v.fecha) AS limite, array_agg(DISTINCT v.terminal ORDER BY v.terminal) AS terminales
         FROM calendario.vencimiento v JOIN calendario.obligacion o ON o.codigo = v.obligacion
        WHERE o.codigo LIKE 'IVA_ANT_ISLR_IGTF_RET_IVA_%' AND coalesce(v.fecha_prorrogada, v.fecha) >= $1::date
        GROUP BY v.fecha, v.fecha_prorrogada ORDER BY v.fecha LIMIT 5`, [hoy]),
    consulta<{ instrumento: string; gaceta: string; fecha_publicacion: string }>(
      "SELECT instrumento, gaceta, fecha_publicacion FROM arancel.version ORDER BY fecha_publicacion DESC LIMIT 1"),
  ]);
  const pct = (c: string) => alicuotas.find((a) => a.codigo === c)?.porcentaje ?? null;

  // "Noticias fiscales del día": generadas de los datos oficiales (no hay titulares de terceros)
  const noticias: Noticia[] = [];
  if (bcv) {
    const usd = bcv.monedas.find((m) => m.codigo === "USD")!, eur = bcv.monedas.find((m) => m.codigo === "EUR")!;
    noticias.push({ categoria: "Tasas BCV", fuente: "Banco Central de Venezuela", cuando: bcv.leida ? "hoy" : "",
      titulo: `El BCV publica la tasa oficial con fecha valor ${fechaLarga(bcv.fecha_valor).toLowerCase().replace(/ de \d{4}$/, "")}`,
      texto: `Bs. ${numero(usd.tasa, 4)} por dólar y Bs. ${numero(eur.tasa, 4)} por euro. La tasa aplica a las operaciones en divisas facturadas ese día, según el artículo 25 de la Ley de IVA. El Renglón la verifica contra la publicación oficial antes de servirla por la API.`,
      cifra: numero(usd.tasa, 2), cifraNota: "Bs. por USD", color: "var(--amarillo)" });
  }
  if (especiales.length) {
    const e = especiales[0];
    noticias.push({ categoria: "Calendario", fuente: "SENIAT · Providencia SNAT/2025/000091", cuando: "",
      titulo: `Contribuyentes especiales: próximas declaraciones de IVA desde el ${diaMes(e.limite)}`,
      cifra: fechaCorta(e.limite), cifraNota: `RIF terminados en ${e.terminales.join(", ")}`, color: "var(--azul)" });
  }
  if (inhabiles.length) {
    const d = inhabiles[0];
    noticias.push({ categoria: "Días inhábiles", fuente: "COT art. 10", cuando: "",
      titulo: `El ${diaMes(d.fecha)}, ${d.descripcion.replace(/ \(.*\)$/, "")}, es día inhábil para ${d.tipo === "BANCARIO" ? "declarar y pagar tributos" : "trámites tributarios"}`,
      cifra: fechaCorta(d.fecha), cifraNota: d.tipo === "NACIONAL" ? "Feriado nacional" : "Día bancario", color: "var(--rojo)" });
  }
  if (arancel[0]) {
    const a = arancel[0];
    noticias.push({ categoria: "Arancel", fuente: a.gaceta, cuando: "",
      titulo: `El Arancel de Aduanas está vigente con el ${a.instrumento}, publicado el ${diaMes(a.fecha_publicacion)} de ${a.fecha_publicacion.slice(0, 4)}`,
      cifra: a.instrumento.replace(/^Decreto N° /, ""), cifraNota: "Última reforma", color: "var(--tinta)" });
  }

  return {
    hoy, bcv, inhabiles, noticias,
    alicuotas: { general: pct("GENERAL"), reducida: pct("REDUCIDA"), adicional: pct("ADICIONAL_SUNTUARIA") },
    cifras: { reglas: Number(cifras[0]?.reglas ?? 0), publicaciones: Number(cifras[0]?.publicaciones ?? 0), desde: cifras[0]?.desde ?? null },
  };
}

export type DatosPortada = Awaited<ReturnType<typeof datosPortada>>;
