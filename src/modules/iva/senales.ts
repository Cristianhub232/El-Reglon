// Construcción de las señales del motor a partir de la entrada (puro). Lo usan el clasificador y scripts/iva-casos.ts.
import type { CodigoDetectado } from "./codigos.ts";
import { reglaPorArancel, reglasPorCategoriasOff, reglasPorTexto, type MotorCompilado, type Senal, type Suspension } from "./motor.ts";

export interface DatosSenales {
  nombre: string | null;
  tipo?: "BIEN" | "SERVICIO";
  codigo_arancelario: string | null;        // solo dígitos
  codigos: CodigoDetectado[];
  producto?: { nombre: string | null; categorias: string[] } | null;   // identificado por código de barras
}

// ISBN y ISSN identifican publicaciones: libros (art. 18.6) o prensa y revistas (arts. 18.5 y 18.6)
const REGLAS_PUBLICACION: Record<string, string[]> = { "ISBN-13": ["LIBROS_REVISTAS"], "ISBN-10": ["LIBROS_REVISTAS"], ISSN: ["LIBROS_REVISTAS", "PRENSA"] };

export function construirSenales(m: MotorCompilado, d: DatosSenales): { senales: Senal[]; prefijo_arancel: string | null } {
  const senales: Senal[] = [];
  let prefijo: string | null = null;
  if (d.codigo_arancelario) {
    const r = reglaPorArancel(m, d.codigo_arancelario);
    prefijo = r?.prefijo ?? null;
    senales.push({ origen: "codigo_arancelario", reglas: r ? [r.regla_id] : [], detalle: r ? `prefijo ${r.prefijo}` : "sin regla para este código" });
  }
  for (const c of d.codigos) {
    const reglas = REGLAS_PUBLICACION[c.tipo];
    if (reglas && c.digito_verificador !== false) senales.push({ origen: "isbn_issn", reglas, detalle: `${c.tipo} ${c.codigo}` });
  }
  if (d.producto?.categorias.length) {
    senales.push({ origen: "categorias_off", reglas: reglasPorCategoriasOff(m, d.producto.categorias) });
  }
  if (d.producto?.nombre) {
    senales.push({ origen: "nombre_producto", reglas: reglasPorTexto(m, d.producto.nombre, d.tipo), detalle: d.producto.nombre });
  }
  if (d.nombre) senales.push({ origen: "nombre", reglas: reglasPorTexto(m, d.nombre, d.tipo) });
  return { senales, prefijo_arancel: prefijo };
}

export interface DecretoCatalogo { codigo: string; efecto: string; vigente_desde: string; vigente_hasta: string | null; base_legal: string }

export function suspensionVigente(decretos: DecretoCatalogo[], fecha: string): Suspension | null {
  const d = decretos.find((x) => x.efecto === "SUSPENDE_EXENCION_IMPORTACION" && x.vigente_desde <= fecha && (!x.vigente_hasta || x.vigente_hasta >= fecha));
  return d ? { codigo: d.codigo, base_legal: d.base_legal, articulo_17: "LIVA-17-1", alicuota_general: "LIVA-63" } : null;
}
