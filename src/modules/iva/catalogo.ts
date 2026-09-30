// Catálogo del clasificador leído de PostgreSQL, compilado y en memoria (se relee cada 60 s si cambió la versión).
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { compilar, type MotorCompilado, type ReglaCatalogo } from "./motor.ts";
import type { DecretoCatalogo } from "./senales.ts";

export interface BaseLegal { id: string; norma: string; gaceta: string; articulo: string; numeral: string | null; literal: string | null; texto: string; verificado: boolean }
export interface Categoria { codigo: string; denominacion: string; componentes: string[]; marca_exento: boolean; concepto_nacional: string; concepto_importacion: string }
export interface Alicuota { codigo: string; porcentaje: string; vigente_desde: string; vigente_hasta: string | null; instrumento: string }

export interface CatalogoIva {
  version: string; estado: string; cargado_en: string;
  reglas: ReglaCatalogo[]; motor: MotorCompilado; regla_arancel: { prefijo: string; regla_id: string }[];
  base_legal: Map<string, BaseLegal>; categorias: Map<string, Categoria>; alicuotas: Alicuota[]; decretos: DecretoCatalogo[];
}

let cache: { catalogo: CatalogoIva; leido: number } | null = null;

// Tras una edición en el panel: la próxima consulta relee el catálogo
export function invalidarCatalogo() { cache = null; }

async function versionActual(): Promise<{ version: string; estado: string; cargado_en: string } | undefined> {
  const [v] = await consulta<{ version: string; estado: string; cargado_en: string }>(
    "SELECT version, estado, cargado_en::text FROM iva.catalogo_version ORDER BY cargado_en DESC LIMIT 1");
  return v;
}

export async function catalogo(): Promise<CatalogoIva> {
  if (cache && Date.now() - cache.leido < 60_000) return cache.catalogo;
  const v = await versionActual();
  if (!v) throw new ErrorApi(503, "catalogo_no_cargado", "El catálogo de IVA no está cargado (node scripts/iva-cargar-catalogo.ts)");
  if (cache && cache.catalogo.version === v.version && cache.catalogo.cargado_en === v.cargado_en) {
    cache.leido = Date.now();
    return cache.catalogo;
  }
  const [reglas, prefijos, bases, categorias, alicuotas, decretos] = await Promise.all([
    consulta<ReglaCatalogo>(`SELECT r.id, r.tipo, r.nombre, r.prioridad, r.patrones_incluir, r.patrones_excluir, r.patrones_todos, r.categorias_off,
        r.zona_gris, r.nota, json_agg(json_build_object('categoria', o.categoria, 'base_legal', o.base_legal, 'condicion', o.condicion,
        'condicion_eval', o.condicion_eval) ORDER BY o.orden) AS opciones
       FROM iva.regla r JOIN iva.opcion_regla o ON o.regla_id = r.id GROUP BY r.id ORDER BY r.id`),
    consulta<{ prefijo: string; regla_id: string }>("SELECT prefijo, regla_id FROM iva.regla_arancel"),
    consulta<BaseLegal>("SELECT id, norma, gaceta, articulo, numeral, literal, texto, verificado FROM iva.base_legal"),
    consulta<Categoria>("SELECT codigo, denominacion, componentes, marca_exento, concepto_nacional, concepto_importacion FROM iva.categoria"),
    consulta<Alicuota>("SELECT codigo, porcentaje, vigente_desde, vigente_hasta, instrumento FROM iva.alicuota ORDER BY codigo, vigente_desde"),
    consulta<DecretoCatalogo>("SELECT codigo, efecto, vigente_desde, vigente_hasta, base_legal FROM iva.decreto"),
  ]);
  const c: CatalogoIva = {
    version: v.version, estado: v.estado, cargado_en: v.cargado_en, reglas, regla_arancel: prefijos,
    motor: compilar({ reglas, regla_arancel: prefijos }),
    base_legal: new Map(bases.map((b) => [b.id, b])), categorias: new Map(categorias.map((x) => [x.codigo, x])), alicuotas, decretos,
  };
  cache = { catalogo: c, leido: Date.now() };
  return c;
}

export function alicuotaVigente(c: CatalogoIva, codigo: string, fecha: string): Alicuota | undefined {
  return c.alicuotas.find((a) => a.codigo === codigo && a.vigente_desde <= fecha && (!a.vigente_hasta || a.vigente_hasta >= fecha));
}
