// Datos del resumen del panel. El rol "dev" solo ve lo de sus propias API keys.
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { escribirUso } from "../../core/uso.ts";
import type { Usuario } from "../../core/auth/sesiones.ts";

export const PERIODOS = { "14": 14, "30": 30, trimestre: 91 } as const;
export type Periodo = keyof typeof PERIODOS;

export async function datosResumen(u: Usuario, periodo: Periodo) {
  await escribirUso();   // lo acumulado en memoria de este proceso, para que "hoy" esté al día
  const hoy = hoyCaracas();
  const dias = PERIODOS[periodo];
  const propias = u.rol === "dev";
  // Filtro de API keys: todas, o solo las del usuario (las públicas, id 0, no son de nadie)
  const filtro = propias ? "AND api_key_id IN (SELECT id FROM core.api_key WHERE usuario_id = $2)" : "AND $2::int IS NOT NULL";
  const p = [hoy, u.id];
  const [serie, modulos, [keys], [curaduria], [tasa], [ultimaBcv], [catalogo], versionesArancel, [calendario], actividad] = await Promise.all([
    consulta<{ fecha: string; consultas: string; limitadas: string }>(
      `SELECT d::date::text AS fecha, coalesce(sum(u.consultas), 0) AS consultas, coalesce(sum(u.limitadas), 0) AS limitadas
         FROM generate_series($1::date - ($3::int - 1), $1::date, interval '1 day') d
         LEFT JOIN core.uso_diario u ON u.fecha = d::date ${filtro.replace("AND api_key_id", "AND u.api_key_id")}
        GROUP BY d ORDER BY d`, [...p, dias]),
    consulta<{ modulo: string; consultas: string }>(
      `SELECT modulo, sum(consultas) AS consultas FROM core.uso_diario
        WHERE fecha > $1::date - $3::int ${filtro} GROUP BY modulo ORDER BY 2 DESC`, [...p, dias]),
    consulta<{ activas: string; total: string; nuevas: string }>(
      `SELECT count(*) FILTER (WHERE activa) AS activas, count(*) AS total, count(*) FILTER (WHERE activa AND creada_en > now() - interval '7 days') AS nuevas
         FROM core.api_key WHERE ${propias ? "usuario_id = $1" : "$1::int IS NOT NULL"}`, [u.id]),
    consulta<{ n: string }>(
      `SELECT (SELECT count(*) FROM iva.consulta_registro WHERE estado = 'no_determinado' AND NOT revisada)
            + (SELECT count(*) FROM arancel.deteccion WHERE estado = 'no_determinado' AND NOT revisada) AS n`),
    consulta<{ venta_bs: string; fecha_valor: string }>("SELECT venta_bs, fecha_valor FROM bcv.tasa WHERE moneda = 'USD' ORDER BY fecha_valor DESC LIMIT 1"),
    consulta<{ ocurrido_en: string; accion: string }>("SELECT ocurrido_en::text, accion FROM core.auditoria WHERE accion LIKE 'bcv.%' ORDER BY ocurrido_en DESC LIMIT 1"),
    consulta<{ version: string; estado: string; reglas: string }>(
      "SELECT v.version, v.estado, (SELECT count(*) FROM iva.regla) AS reglas FROM iva.catalogo_version v ORDER BY cargado_en DESC LIMIT 1"),
    consulta<{ instrumento: string }>("SELECT instrumento FROM arancel.version ORDER BY fecha_publicacion"),
    consulta<{ hasta: string | null }>("SELECT max(coalesce(fecha_prorrogada, fecha))::text AS hasta FROM calendario.vencimiento"),
    consulta<{ ocurrido_en: string; actor: string; accion: string; detalle: Record<string, unknown> }>(
      `SELECT ocurrido_en::text, actor, accion, detalle FROM core.auditoria ${propias ? "WHERE actor = $1" : "WHERE $1::text IS NOT NULL"}
        ORDER BY ocurrido_en DESC LIMIT 5`, [u.correo]),
  ]);
  const hoyN = Number(serie.at(-1)?.consultas ?? 0), ayerN = Number(serie.at(-2)?.consultas ?? 0);
  const totalModulos = modulos.reduce((s, m) => s + Number(m.consultas), 0);
  return {
    hoy, periodo, propias, serie: serie.map((f) => ({ fecha: f.fecha, consultas: Number(f.consultas) })),
    total: serie.reduce((s, f) => s + Number(f.consultas), 0),
    consultasHoy: hoyN, variacion: ayerN ? (hoyN / ayerN - 1) * 100 : null,
    limitadasHoy: Number(serie.at(-1)?.limitadas ?? 0),
    keys: { activas: Number(keys?.activas ?? 0), total: Number(keys?.total ?? 0), nuevas: Number(keys?.nuevas ?? 0) },
    curaduria: Number(curaduria?.n ?? 0), tasa: tasa ?? null,
    reparto: modulos.map((m) => ({ modulo: m.modulo, pct: totalModulos ? Number(m.consultas) / totalModulos * 100 : 0 })),
    estados: { ultimaBcv: ultimaBcv ?? null, catalogo: catalogo ?? null, versionesArancel: versionesArancel.map((v) => v.instrumento), calendarioHasta: calendario?.hasta ?? null },
    actividad,
  };
}
