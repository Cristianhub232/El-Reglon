// "Casos de uso" de la portada: ejemplos demostrativos calculados con los módulos reales (clasificador de IVA,
// tasa BCV vigente y calendario tributario). Empresas, RIF y precios son de ejemplo; alícuotas, base legal,
// tasa y fechas son los reales. Se guardan 10 minutos en memoria: la portada se sirve en cada visita.
import { clasificarSolicitud } from "../iva/clasificador.ts";
import { proximos } from "../calendario/consultas.ts";
import { citaCorta, type CitaLegal } from "../../ui/formato.ts";

export interface Renglon { descripcion: string; cantidad: number; categoria: string; alicuota: string; base: string; montoBs: number }
export interface Deber { fecha: string; limite: string; dias: number; nombre: string; periodo: string | null; base: string; trasladado: boolean }
export interface Casos {
  factura: { renglones: Renglon[]; exenta: number; imponible: number; alicuota: string; iva: number; total: number; totalUsd: number; tasa: string } | null;
  deberes: Deber[];
  api: { cuerpo: Record<string, unknown>; respuesta: Record<string, unknown> } | null;
}

export const EMPRESA_FACTURA = { nombre: "Bodega La Esquina, C.A.", rif: "J-40123456-9", numero: "000245" };
export const EMPRESA_CALENDARIO = { nombre: "Inversiones Caribe 2020, C.A.", rif: "J-30987654-6" };
const PRODUCTOS = [
  { descripcion: "Arroz Mary 1 kg", cantidad: 2, usd: 1.35 },
  { descripcion: "Harina P.A.N. 1 kg", cantidad: 3, usd: 1.25 },
  { descripcion: "Café molido 500 g", cantidad: 1, usd: 4.5 },
  { descripcion: "Detergente en polvo 1 kg", cantidad: 1, usd: 3.2 },
  { descripcion: "Refresco 2 L", cantidad: 2, usd: 2.1 },
];

type BaseLegal = CitaLegal & { texto?: string; gaceta?: string };
interface Opcion { categoria: string; alicuota_total: string; base_legal: BaseLegal[] }

const centimos = (x: number) => Math.round(x * 100) / 100;
const clasificar = (nombre: string) =>
  clasificarSolicitud({ nombre, operacion: "nacional", precio_compra: null, precio_venta: null, moneda: null }, null) as Promise<Record<string, unknown> & { opciones: Opcion[] }>;

async function factura(tasa: string): Promise<Casos["factura"]> {
  const t = Number(tasa);
  const renglones: Renglon[] = [];
  let alicuota = "16.00";
  for (const p of PRODUCTOS) {
    const o = (await clasificar(p.descripcion)).opciones[0];
    if (!o) continue;
    if (o.categoria === "ALICUOTA_GENERAL") alicuota = o.alicuota_total;
    renglones.push({ descripcion: p.descripcion, cantidad: p.cantidad, categoria: o.categoria, alicuota: o.alicuota_total,
      base: o.base_legal[0] ? citaCorta(o.base_legal[0]) : "Ley IVA", montoBs: centimos(p.cantidad * p.usd * t) });
  }
  const exenta = centimos(renglones.filter((r) => r.categoria === "EXENTO").reduce((a, r) => a + r.montoBs, 0));
  const imponible = centimos(renglones.filter((r) => r.categoria !== "EXENTO").reduce((a, r) => a + r.montoBs, 0));
  const iva = centimos(imponible * Number(alicuota) / 100);
  const total = centimos(exenta + imponible + iva);
  return { renglones, exenta, imponible, alicuota, iva, total, totalUsd: centimos(total / t), tasa };
}

async function deberes(hoy: string): Promise<Deber[]> {
  const r = await proximos(EMPRESA_CALENDARIO.rif, "ESPECIAL", [], hoy, 4) as unknown as { deberes: { fecha: string; fecha_limite: string; dias_restantes: number;
    nombre: string; base_legal: string; periodo_desde: string | null; periodo_hasta: string | null }[] };
  return r.deberes.map((d) => ({
    fecha: d.fecha, limite: d.fecha_limite, dias: d.dias_restantes, nombre: d.nombre, trasladado: d.fecha_limite !== d.fecha,
    periodo: d.periodo_desde && d.periodo_hasta ? `del ${d.periodo_desde.slice(8, 10)}/${d.periodo_desde.slice(5, 7)} al ${d.periodo_hasta.slice(8, 10)}/${d.periodo_hasta.slice(5, 7)}` : null,
    base: `Providencia SNAT/2025/000091, ${d.base_legal}`,
  }));
}

async function api(): Promise<Casos["api"]> {
  const cuerpo = { nombre: "Harina P.A.N. 1 kg", operacion: "nacional" };
  const r = await clasificar(cuerpo.nombre);
  const o = r.opciones[0] as Opcion & Record<string, unknown>;
  if (!o) return null;
  const b = o.base_legal[0] as BaseLegal & Record<string, unknown>;
  return { cuerpo, respuesta: {
    estado: r.estado, operacion: r.operacion,
    opciones: [{ categoria: o.categoria, denominacion: o.denominacion, alicuota_total: o.alicuota_total, marca_exento: o.marca_exento,
      concepto_declaracion: o.concepto_declaracion, base_legal: b ? [{ id: b.id, articulo: b.articulo, numeral: b.numeral, literal: b.literal, texto: b.texto, gaceta: b.gaceta }] : [] }],
  } };
}

let cache: { clave: string; hasta: number; datos: Casos } | null = null;

export async function datosCasos(hoy: string, tasaUsd: string | null): Promise<Casos> {
  const clave = `${hoy}|${tasaUsd}`;
  if (cache && cache.clave === clave && cache.hasta > Date.now()) return cache.datos;
  const [f, d, a] = await Promise.all([
    tasaUsd ? factura(tasaUsd).catch(() => null) : Promise.resolve(null),
    deberes(hoy).catch(() => []),
    api().catch(() => null),
  ]);
  const datos = { factura: f, deberes: d, api: a };
  cache = { clave, hasta: Date.now() + 10 * 60_000, datos };
  return datos;
}
