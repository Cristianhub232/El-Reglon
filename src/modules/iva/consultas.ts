// Consultas del catálogo de IVA: alícuotas vigentes, reglas, base legal y detección de códigos.
import { ErrorApi } from "../../core/http.ts";
import { alicuotaVigente, catalogo } from "./catalogo.ts";
import { detectarCodigo } from "./codigos.ts";
import { aDecimal, texto } from "./decimal.ts";
import { reglasPorTexto } from "./motor.ts";
import { normalizar } from "./normalizar.ts";
import { ATRIBUCION_OFF, buscarProducto } from "./off.ts";

export async function alicuotas(fecha: string) {
  const c = await catalogo();
  const componentes = ["GENERAL", "REDUCIDA", "ADICIONAL_SUNTUARIA"].map((codigo) => {
    const a = alicuotaVigente(c, codigo, fecha);
    return { codigo, porcentaje: a?.porcentaje ?? null, vigente_desde: a?.vigente_desde ?? null, vigente_hasta: a?.vigente_hasta ?? null, instrumento: a?.instrumento ?? null };
  });
  const categorias = [...c.categorias.values()].map((cat) => {
    const total = cat.componentes.reduce((s, k) => s + aDecimal(componentes.find((x) => x.codigo === k)?.porcentaje ?? "0"), 0n);
    return { codigo: cat.codigo, denominacion: cat.denominacion, componentes: cat.componentes, alicuota_total: texto(total, 2), marca_exento: cat.marca_exento,
      concepto_nacional: cat.concepto_nacional, concepto_importacion: cat.concepto_importacion };
  });
  const suspensiones = c.decretos.filter((d) => d.vigente_desde <= fecha && (!d.vigente_hasta || d.vigente_hasta >= fecha));
  return { fecha, alicuotas: componentes, categorias, decretos_vigentes: suspensiones, version_catalogo: c.version };
}

export async function reglas(q: string | null, tipo: string | null) {
  if (tipo && tipo !== "bien" && tipo !== "servicio") throw new ErrorApi(400, "parametro_invalido", "'tipo' debe ser 'bien' o 'servicio'");
  const c = await catalogo();
  const T = tipo ? (tipo.toUpperCase() as "BIEN" | "SERVICIO") : undefined;
  let lista = c.reglas.filter((r) => !T || r.tipo === T);
  let coincidencia: string[] = [];
  if (q) {
    const n = normalizar(q);
    coincidencia = reglasPorTexto(c.motor, q, T);
    lista = lista.filter((r) => coincidencia.includes(r.id) || normalizar(`${r.id} ${r.nombre}`).includes(n));
  }
  return {
    cantidad: lista.length, clasificacion_por_texto: q ? coincidencia : undefined, version_catalogo: c.version, estado_catalogo: c.estado,
    reglas: lista.map((r) => ({ id: r.id, tipo: r.tipo.toLowerCase(), nombre: r.nombre, prioridad: r.prioridad, zona_gris: r.zona_gris, nota: r.nota,
      opciones: r.opciones.map((o) => ({ categoria: o.categoria, base_legal: o.base_legal, condicion: o.condicion, condicion_eval: o.condicion_eval })) })),
  };
}

export async function baseLegal() {
  const c = await catalogo();
  const lista = [...c.base_legal.values()].sort((a, b) => a.id.localeCompare(b.id, "es", { numeric: true }));
  return { cantidad: lista.length, verificados: lista.filter((b) => b.verificado).length, base_legal: lista,
    nota: "verificado = true: el texto se comprobó literalmente contra el PDF de la Gaceta Oficial al cargar el catálogo" };
}

export async function codigo(entrada: string) {
  const d = detectarCodigo(entrada);
  if (!d.consultable) return { ...d, producto: null };
  const r = await buscarProducto(d.codigo);
  const p = r.producto?.encontrado ? r.producto : null;
  return { ...d, producto: p ? { nombre: p.nombre, marca: p.marca, cantidad: p.cantidad, categorias: p.categorias, fuente: p.fuente, desde_cache: p.desde_cache } : null,
    ...(r.advertencia ? { advertencia: r.advertencia } : {}), ...(p ? { atribucion: ATRIBUCION_OFF } : {}) };
}
