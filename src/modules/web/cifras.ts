// "El día en cifras": tarjetas del carrusel del hero, todas con datos propios (BCV, calendario, catálogo de IVA y
// uso de la plataforma). Sin fuentes externas: el carrusel nunca queda vacío ni roto.
import { consulta } from "../../core/db.ts";
import { citaCorta, type CitaLegal } from "../../ui/formato.ts";

export type Tarjeta =
  | { tipo: "monedas"; fecha_valor: string; filas: { codigo: string; nombre: string; tasa: string; variacion: number | null }[] }
  | { tipo: "mayor"; fecha_valor: string; moneda: string; nombre: string; tasa: string }
  | { tipo: "vence"; fecha: string; dias: number; terminales: number[]; periodo: string | null; trasladada: boolean }
  | { tipo: "inhabil"; fecha: string; dias: number; descripcion: string; bancario: boolean }
  | { tipo: "sabias"; nombre: string; etiqueta: string; frase: string; cita: string; texto: string | null }
  | { tipo: "actividad"; hoy: number; semana: number; modulos: { modulo: string; consultas: number }[] };

const NOMBRES: Record<string, string> = { USD: "Dólar", EUR: "Euro", CNY: "Yuan", TRY: "Lira turca", RUB: "Rublo" };
const dias = (desde: string, hasta: string) => Math.round((Date.parse(hasta) - Date.parse(desde)) / 86_400_000);
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

async function monedas(fechaValor: string): Promise<Tarjeta | null> {
  const filas = await consulta<{ moneda: string; venta_bs: string; anterior: string | null }>(
    `SELECT t.moneda, t.venta_bs, (SELECT a.venta_bs FROM bcv.tasa a WHERE a.moneda = t.moneda AND a.fecha_valor < t.fecha_valor
                                    ORDER BY a.fecha_valor DESC LIMIT 1) AS anterior
       FROM bcv.tasa t WHERE t.fecha_valor = $1::date AND t.moneda IN ('CNY', 'TRY', 'RUB') ORDER BY array_position(ARRAY['CNY','TRY','RUB'], t.moneda::text)`, [fechaValor]);
  if (!filas.length) return null;
  return { tipo: "monedas", fecha_valor: fechaValor, filas: filas.map((f) => ({ codigo: f.moneda, nombre: NOMBRES[f.moneda] ?? f.moneda, tasa: f.venta_bs,
    variacion: f.anterior ? (Number(f.venta_bs) / Number(f.anterior) - 1) * 100 : null })) };
}

async function mayor(hoy: string): Promise<Tarjeta | null> {
  const [f] = await consulta<{ fecha_valor: string; moneda: string; tasa_bs: string }>("SELECT fecha_valor, moneda, tasa_bs FROM bcv.moneda_mayor_valor($1::date)", [hoy]);
  return f ? { tipo: "mayor", fecha_valor: f.fecha_valor, moneda: f.moneda, nombre: NOMBRES[f.moneda] ?? f.moneda, tasa: f.tasa_bs } : null;
}

// Próximo vencimiento de IVA de los contribuyentes especiales (Providencia SNAT/2025/000091), con sus terminales de RIF
async function vence(hoy: string): Promise<Tarjeta | null> {
  const [f] = await consulta<{ limite: string; fecha: string; terminales: number[]; desde: string | null; hasta: string | null }>(
    `SELECT coalesce(v.fecha_prorrogada, v.fecha) AS limite, min(v.fecha) AS fecha, array_agg(DISTINCT v.terminal ORDER BY v.terminal) AS terminales,
            min(v.periodo_desde) AS desde, max(v.periodo_hasta) AS hasta
       FROM calendario.vencimiento v WHERE v.obligacion LIKE 'IVA_ANT_ISLR_IGTF_RET_IVA_%' AND coalesce(v.fecha_prorrogada, v.fecha) >= $1::date
      GROUP BY 1 ORDER BY 1 LIMIT 1`, [hoy]);
  if (!f) return null;
  return { tipo: "vence", fecha: f.limite, dias: dias(hoy, f.limite), terminales: f.terminales, trasladada: f.fecha !== f.limite,
    periodo: f.desde && f.hasta ? `del ${ddmm(f.desde)} al ${ddmm(f.hasta)}` : null };
}

async function inhabil(hoy: string): Promise<Tarjeta | null> {
  const [f] = await consulta<{ fecha: string; descripcion: string; tipo: string }>(
    "SELECT fecha, descripcion, tipo FROM calendario.dia_inhabil WHERE fecha >= $1::date ORDER BY fecha LIMIT 1", [hoy]);
  return f ? { tipo: "inhabil", fecha: f.fecha, dias: dias(hoy, f.fecha), descripcion: f.descripcion.replace(/ \(.*\)$/, ""), bancario: f.tipo === "BANCARIO" } : null;
}

// Una regla del catálogo por día (la misma para todos ese día), de las que tienen una sola opción y no son zona gris
async function sabias(hoy: string): Promise<Tarjeta | null> {
  const [[f], alicuotas] = await Promise.all([
    consulta<CitaLegal & { nombre: string; categoria: string; texto: string | null }>(
      `SELECT r.nombre, o.categoria, b.id, b.norma, b.articulo, b.numeral, b.literal, b.texto
         FROM iva.regla r JOIN iva.opcion_regla o ON o.regla_id = r.id JOIN iva.base_legal b ON b.id = o.base_legal[1]
        WHERE NOT r.zona_gris AND o.categoria IN ('EXENTO', 'ALICUOTA_REDUCIDA', 'ALICUOTA_GENERAL_MAS_ADICIONAL')
          AND (SELECT count(*) FROM iva.opcion_regla x WHERE x.regla_id = r.id) = 1
        ORDER BY md5(r.id || $1) LIMIT 1`, [hoy]),
    consulta<{ codigo: string; porcentaje: string }>("SELECT codigo, porcentaje FROM iva.alicuotas_vigentes($1::date)", [hoy]),
  ]);
  if (!f) return null;
  const pct = (c: string) => Number(alicuotas.find((a) => a.codigo === c)?.porcentaje ?? 0);
  const [etiqueta, frase] = f.categoria === "EXENTO" ? ["Exento", "está exento del IVA"]
    : f.categoria === "ALICUOTA_REDUCIDA" ? [`${pct("REDUCIDA")} %`, `paga la alícuota reducida de ${pct("REDUCIDA")} %`]
    : [`${pct("GENERAL") + pct("ADICIONAL_SUNTUARIA")} %`, `paga ${pct("GENERAL") + pct("ADICIONAL_SUNTUARIA")} %: la alícuota general (${pct("GENERAL")} %) más la adicional por consumo suntuario (${pct("ADICIONAL_SUNTUARIA")} %)`];
  return { tipo: "sabias", nombre: f.nombre, etiqueta, frase, cita: citaCorta(f), texto: f.texto };
}

// Consultas de la API y de las herramientas públicas (core.uso_diario, en totales: nunca lo que escribió cada usuario)
async function actividad(hoy: string): Promise<Tarjeta | null> {
  const filas = await consulta<{ modulo: string; hoy: string; semana: string }>(
    `SELECT modulo, sum(consultas) FILTER (WHERE fecha = $1::date) AS hoy, sum(consultas) AS semana
       FROM core.uso_diario WHERE fecha > $1::date - 7 GROUP BY modulo ORDER BY sum(consultas) DESC`, [hoy]);
  const semana = filas.reduce((a, f) => a + Number(f.semana ?? 0), 0);
  if (semana === 0) return null;
  return { tipo: "actividad", hoy: filas.reduce((a, f) => a + Number(f.hoy ?? 0), 0), semana,
    modulos: filas.slice(0, 4).map((f) => ({ modulo: f.modulo, consultas: Number(f.semana) })) };
}

export async function diaEnCifras(hoy: string, fechaValor: string | null): Promise<Tarjeta[]> {
  const t = await Promise.all([
    vence(hoy), inhabil(hoy), fechaValor ? monedas(fechaValor) : null, mayor(hoy), sabias(hoy), actividad(hoy),
  ].map((p) => Promise.resolve(p).catch(() => null)));
  return t.filter((x): x is Tarjeta => x !== null);
}
