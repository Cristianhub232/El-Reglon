// POST /api/v1/iva/clasificar: valida la entrada, obtiene las señales (códigos, Open Food Facts, arancel, nombre),
// convierte los precios con la tasa BCV, ejecuta el motor y arma la respuesta con alícuotas, base legal y montos.
// Nunca niega una consulta por reglas de negocio: lo que no se resuelve se responde como opciones o 'no_determinado'.
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { fecha as validarFecha, hoyCaracas } from "../../core/validacion.ts";
import { normalizarCodigo } from "../arancel/consultas.ts";
import { tasaAplicable } from "../bcv/consultas.ts";
import { alicuotaVigente, catalogo, type CatalogoIva } from "./catalogo.ts";
import { detectarCodigo, type CodigoDetectado } from "./codigos.ts";
import { aDecimal, div, mul, porcentaje, texto } from "./decimal.ts";
import { clasificar, type Contexto } from "./motor.ts";
import { normalizar, pesoEnGramos } from "./normalizar.ts";
import { ATRIBUCION_OFF, buscarProducto, type Producto } from "./off.ts";
import { construirSenales, suspensionVigente } from "./senales.ts";

export const RESPONSABILIDAD = "Resultado orientativo según la Ley de IVA (GO Ext. N° 6.507) y los decretos cargados. " +
  "Cuando hay varias opciones, la selección corresponde al usuario bajo su responsabilidad y análisis.";

type Operacion = "nacional" | "importacion";
interface Entrada {
  nombre: string | null; codigos: string[]; codigo_arancelario: string | null; operacion: Operacion; tipo: "BIEN" | "SERVICIO" | undefined;
  precio_compra: string | null; precio_venta: string | null; moneda: "VES" | "USD" | null; fecha: string;
  atributos: { uso?: string; cliente?: string; peso_g?: number }; ubicacion: string | null;
}

const USOS = ["consumo", "industrial", "residencial", "comercial"];
const CLIENTES = ["poder_publico", "privado"];

function error(codigo: string, mensaje: string): never { throw new ErrorApi(400, codigo, mensaje); }

function precio(v: unknown, nombre: string): string | null {
  if (v === null) return null;
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "string" ? v.trim() : "";
  if (!/^\d+(\.\d{1,4})?$/.test(s) || Number(s) <= 0 || Number(s) >= 1e15) {
    error("precio_invalido", `'${nombre}' debe ser null o un número positivo con hasta 4 decimales (p. ej. 12.50), sin IVA`);
  }
  return s;
}

export function validarEntrada(cuerpo: unknown): Entrada {
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) error("cuerpo_invalido", "El cuerpo debe ser un objeto JSON");
  const b = cuerpo as Record<string, unknown>;
  if (b.operacion !== "nacional" && b.operacion !== "importacion") {
    error("operacion_requerida", "'operacion' es obligatoria: 'nacional' o 'importacion' (las exportaciones están fuera del alcance)");
  }
  const faltan = ["precio_compra", "precio_venta", "moneda"].filter((k) => !(k in b));
  if (faltan.length) {
    error("precios_requeridos", `Los campos precio_compra, precio_venta y moneda forman parte de todo request (pueden ir en null). Faltan: ${faltan.join(", ")}`);
  }
  const cadena = (v: unknown, nombre: string, max: number): string | null => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || v.length > max) error("parametro_invalido", `'${nombre}' debe ser texto de hasta ${max} caracteres`);
    return v.trim() || null;
  };
  const nombre = cadena(b.nombre, "nombre", 300);
  const codigos: string[] = [];
  const unCodigo = cadena(b.codigo, "codigo", 64);
  if (unCodigo) codigos.push(unCodigo);
  if (b.codigos !== undefined && b.codigos !== null) {
    if (!Array.isArray(b.codigos) || b.codigos.length > 10 || b.codigos.some((c) => typeof c !== "string" || !c.trim() || c.length > 64)) {
      error("parametro_invalido", "'codigos' debe ser una lista de hasta 10 textos de hasta 64 caracteres");
    }
    codigos.push(...(b.codigos as string[]).map((c) => c.trim()));
  }
  const arancel = cadena(b.codigo_arancelario, "codigo_arancelario", 20);
  let codigoArancel: string | null = null;
  if (arancel) {
    codigoArancel = normalizarCodigo(arancel);
    if (codigoArancel.length < 4) error("codigo_invalido", "'codigo_arancelario' debe tener al menos la partida (4 dígitos)");
  }
  if (!nombre && codigos.length === 0 && !codigoArancel) {
    error("entrada_insuficiente", "Envíe al menos 'nombre', 'codigo'/'codigos' o 'codigo_arancelario'");
  }
  let tipo: Entrada["tipo"];
  if (b.tipo !== undefined && b.tipo !== null) {
    if (b.tipo !== "bien" && b.tipo !== "servicio") error("parametro_invalido", "'tipo' debe ser 'bien' o 'servicio'");
    tipo = b.tipo === "bien" ? "BIEN" : "SERVICIO";
  }
  const precio_compra = precio(b.precio_compra, "precio_compra");
  const precio_venta = precio(b.precio_venta, "precio_venta");
  if (b.moneda !== null && b.moneda !== "VES" && b.moneda !== "USD") error("moneda_invalida", "'moneda' debe ser 'VES', 'USD' o null");
  const moneda = b.moneda as Entrada["moneda"];
  if ((precio_compra || precio_venta) && !moneda) error("moneda_requerida", "'moneda' es obligatoria cuando se envía algún precio (VES o USD)");
  const fecha = b.fecha === undefined || b.fecha === null ? hoyCaracas() : validarFecha(typeof b.fecha === "string" ? b.fecha : "", "fecha");
  const atributos: Entrada["atributos"] = {};
  if (b.atributos !== undefined && b.atributos !== null) {
    if (typeof b.atributos !== "object" || Array.isArray(b.atributos)) error("parametro_invalido", "'atributos' debe ser un objeto");
    const a = b.atributos as Record<string, unknown>;
    if (a.uso !== undefined && a.uso !== null) {
      if (!USOS.includes(a.uso as string)) error("parametro_invalido", `'atributos.uso' debe ser uno de: ${USOS.join(", ")}`);
      atributos.uso = a.uso as string;
    }
    if (a.cliente !== undefined && a.cliente !== null) {
      if (!CLIENTES.includes(a.cliente as string)) error("parametro_invalido", `'atributos.cliente' debe ser uno de: ${CLIENTES.join(", ")}`);
      atributos.cliente = a.cliente as string;
    }
    if (a.peso_g !== undefined && a.peso_g !== null) {
      if (typeof a.peso_g !== "number" || !(a.peso_g > 0)) error("parametro_invalido", "'atributos.peso_g' debe ser un número positivo (gramos netos)");
      atributos.peso_g = a.peso_g;
    }
  }
  return { nombre, codigos, codigo_arancelario: codigoArancel, operacion: b.operacion, tipo, precio_compra, precio_venta, moneda, fecha,
    atributos, ubicacion: cadena(b.ubicacion, "ubicacion", 120) };
}

interface Precios {
  moneda: "VES" | "USD"; tasa_bcv_bs: string | null; tasa_fecha_valor: string | null;
  compra: { bs: bigint | null; usd: bigint | null } | null; venta: { bs: bigint | null; usd: bigint | null } | null;
}

async function convertirPrecios(e: Entrada, advertencias: string[]): Promise<Precios | null> {
  if (!e.moneda || (!e.precio_compra && !e.precio_venta)) return null;
  let tasa: { tasa_bs: string; fecha_valor: string } | null = null;
  try {
    tasa = await tasaAplicable(e.fecha, "USD");
  } catch (err) {
    if (!(err instanceof ErrorApi)) throw err;
    advertencias.push(`Sin tasa BCV aplicable al ${e.fecha}: los montos se muestran solo en ${e.moneda === "USD" ? "USD" : "Bs."}${e.moneda === "VES" ? " y los umbrales en USD no se evalúan" : ""}.`);
  }
  const t = tasa ? aDecimal(tasa.tasa_bs) : null;
  const par = (v: string | null) => {
    if (!v) return null;
    const x = aDecimal(v);
    return e.moneda === "VES" ? { bs: x, usd: t ? div(x, t) : null } : { bs: t ? mul(x, t) : null, usd: x };
  };
  return { moneda: e.moneda, tasa_bcv_bs: tasa?.tasa_bs ?? null, tasa_fecha_valor: tasa?.fecha_valor ?? null, compra: par(e.precio_compra), venta: par(e.precio_venta) };
}

const txt = (v: bigint | null | undefined, d = 2) => (v === null || v === undefined ? null : texto(v, d));

// Como en la factura: base redondeada a céntimos, IVA sobre esa base (redondeado) y total = base + IVA
const centimos = (x: bigint | null | undefined) => (x === null || x === undefined ? null : aDecimal(texto(x, 2)));

function montos(p: Precios, pct: bigint) {
  const lado = (m: "bs" | "usd") => {
    const v = centimos(p.venta?.[m]);
    const c = centimos(p.compra?.[m]);
    if (v === null && c === null) return null;
    const ivaV = v === null ? null : centimos(porcentaje(v, pct));
    const ivaC = c === null ? null : centimos(porcentaje(c, pct));
    return { base_imponible_venta: txt(v), iva_venta: txt(ivaV), total_venta: v === null ? null : txt(v + ivaV!),
      base_imponible_compra: txt(c), iva_compra: txt(ivaC), total_compra: c === null ? null : txt(c + ivaC!) };
  };
  return { bs: lado("bs"), usd: lado("usd") };
}

function detallarBase(c: CatalogoIva, ids: string[]) {
  return ids.map((id) => {
    const b = c.base_legal.get(id);
    return b ? { id, norma: b.norma, gaceta: b.gaceta, articulo: b.articulo, numeral: b.numeral, literal: b.literal, texto: b.texto, verificado: b.verificado }
      : { id, norma: null, gaceta: null, articulo: null, numeral: null, literal: null, texto: null, verificado: false };
  });
}

export async function clasificarSolicitud(cuerpo: unknown, apiKeyId: number | null) {
  const e = validarEntrada(cuerpo);
  const c = await catalogo();
  const advertencias: string[] = [];
  let atribucion: string | null = null;

  // 1. Códigos de producto y producto identificado
  const codigos: CodigoDetectado[] = e.codigos.map(detectarCodigo);
  for (const x of codigos) if (x.nota) advertencias.push(`${x.codigo} (${x.tipo}): ${x.nota}`);
  let producto: Producto | null = null;
  const consultable = codigos.find((x) => x.consultable);
  if (consultable) {
    const r = await buscarProducto(consultable.codigo);
    if (r.advertencia) advertencias.push(r.advertencia);
    if (r.producto?.encontrado) { producto = r.producto; atribucion = ATRIBUCION_OFF; }
    else if (!e.nombre) advertencias.push(`El código ${consultable.codigo} no está en las bases públicas de productos: envíe también el nombre.`);
  }

  // 2. Código arancelario
  let arancel: { codigo: string; codigo_formateado: string | null; descripcion: string | null; ruta: string | null; existe: boolean; prefijo_regla: string | null } | null = null;
  if (e.codigo_arancelario) {
    const [s] = await consulta<{ codigo_formateado: string; descripcion: string; ruta: string }>(
      `SELECT s.codigo_formateado, s.descripcion, r.ruta
         FROM arancel.subpartida s JOIN arancel.v_subpartida_ruta r ON r.codigo = s.codigo WHERE s.codigo = $1
       UNION ALL SELECT codigo, descripcion, descripcion FROM arancel.partida WHERE codigo = $1 LIMIT 1`, [e.codigo_arancelario]);
    arancel = { codigo: e.codigo_arancelario, codigo_formateado: s?.codigo_formateado ?? null, descripcion: s?.descripcion ?? null, ruta: s?.ruta ?? null,
      existe: !!s, prefijo_regla: null };
    if (!s) advertencias.push(`El código arancelario ${e.codigo_arancelario} no existe en el arancel vigente (Decreto 4.944 y reformas).`);
  }

  // 3. Señales
  const { senales, prefijo_arancel } = construirSenales(c.motor, {
    nombre: e.nombre, tipo: e.tipo, codigo_arancelario: e.codigo_arancelario, codigos,
    producto: producto ? { nombre: [producto.nombre, producto.cantidad].filter(Boolean).join(" ") || null, categorias: producto.categorias } : null });
  if (arancel) arancel.prefijo_regla = prefijo_arancel;

  // 4. Precios y contexto de las condiciones
  const precios = await convertirPrecios(e, advertencias);
  let precioUsd: bigint | null = null;
  if (precios) {
    const [principal, alterno] = e.operacion === "nacional" ? [precios.venta, precios.compra] : [precios.compra, precios.venta];
    precioUsd = principal?.usd ?? null;
    if (precioUsd === null && alterno?.usd != null) {
      precioUsd = alterno.usd;
      advertencias.push(`Los umbrales en USD del art. 61 se evaluaron con el precio de ${e.operacion === "nacional" ? "compra" : "venta"} porque no se envió el de ${e.operacion === "nacional" ? "venta" : "compra"}.`);
    }
  }
  const peso = e.atributos.peso_g ?? pesoEnGramos(e.nombre ?? "") ?? pesoEnGramos(producto?.cantidad ?? "") ?? pesoEnGramos(producto?.nombre ?? "");
  const contexto: Contexto = { precio_usd: precioUsd === null ? null : Number(texto(precioUsd, 4)), peso_g: peso, uso: e.atributos.uso ?? null, cliente: e.atributos.cliente ?? null };

  // 5. Motor
  const r = clasificar(c.motor, { senales, operacion: e.operacion, contexto, suspension_importacion: suspensionVigente(c.decretos, e.fecha) });
  if (r.estado === "no_determinado" && arancel?.existe && !prefijo_arancel) {
    // Código arancelario válido sin regla asociada: la regla residual de la Ley es la alícuota general (art. 63)
    r.estado = "condicionado";
    r.opciones = [{ categoria: "ALICUOTA_GENERAL", base_legal: ["LIVA-63"], reglas: [], peso: 0.5, condicion_evaluada: null,
      condicion: "Regla residual: aplica si el bien no está comprendido en los arts. 18 (exentos), 61 (suntuario) o 64 (reducida) de la Ley" }];
    r.confianza = 0.5;
    r.metodo = ["codigo_arancelario"];
    r.advertencias = [`El código arancelario ${arancel.codigo} no tiene una regla de IVA asociada en el catálogo: se aplica la regla residual del art. 63. Envíe también el nombre para contrastar.`];
  }
  advertencias.push(...r.advertencias);

  // 6. Opciones con alícuotas vigentes, base legal y montos
  const opciones = r.opciones.map((o, i) => {
    const cat = c.categorias.get(o.categoria)!;
    const alicuotas = cat.componentes.map((codigo) => {
      const a = alicuotaVigente(c, codigo, e.fecha);
      if (!a) advertencias.push(`No hay alícuota ${codigo} vigente al ${e.fecha}.`);
      return { codigo, porcentaje: a?.porcentaje ?? null, instrumento: a?.instrumento ?? null };
    });
    const total = alicuotas.reduce((s, a) => s + (a.porcentaje ? aDecimal(a.porcentaje) : 0n), 0n);
    return {
      orden: i + 1, categoria: o.categoria, denominacion: cat.denominacion, alicuotas, alicuota_total: texto(total, 2),
      condicion: o.condicion, condicion_evaluada: o.condicion_evaluada, base_legal: detallarBase(c, o.base_legal),
      concepto_declaracion: e.operacion === "nacional" ? cat.concepto_nacional : cat.concepto_importacion,
      marca_exento: cat.marca_exento, reglas: o.reglas, ...(o.nota_operacion ? { nota_operacion: o.nota_operacion } : {}),
      montos: precios ? montos(precios, total) : null,
    };
  });

  if (c.estado !== "validado") advertencias.push("Catálogo de reglas pendiente de validación por el asesor tributario.");
  const respuesta = {
    estado: r.estado, operacion: e.operacion, tipo: e.tipo?.toLowerCase() ?? (r.reglas[0]?.tipo.toLowerCase() ?? null), fecha: e.fecha,
    entrada: { nombre: e.nombre, codigos: codigos.map((x) => ({ codigo: x.codigo, tipo: x.tipo, digito_verificador: x.digito_verificador })),
      codigo_arancelario: e.codigo_arancelario },
    producto_identificado: producto ? { codigo: producto.codigo, nombre: producto.nombre, marca: producto.marca, cantidad: producto.cantidad,
      fuente: producto.fuente, desde_cache: producto.desde_cache } : null,
    arancel,
    opciones,
    precios: precios ? {
      moneda: precios.moneda, tasa_bcv_bs: precios.tasa_bcv_bs, tasa_fecha_valor: precios.tasa_fecha_valor, base_legal_tasa: "Ley de IVA, art. 25",
      precio_compra_bs: txt(precios.compra?.bs), precio_compra_usd: txt(precios.compra?.usd, 4),
      precio_venta_bs: txt(precios.venta?.bs), precio_venta_usd: txt(precios.venta?.usd, 4),
      umbral_evaluado_usd: contexto.precio_usd,
    } : null,
    reglas: r.reglas, confianza: r.confianza, metodo: r.metodo, advertencias: [...new Set(advertencias)], notas_operacion: r.notas_operacion,
    responsabilidad: RESPONSABILIDAD, version_catalogo: c.version, estado_catalogo: c.estado, ...(atribucion ? { atribucion } : {}),
  };

  // 7. Minería de precios y registro de consultas no resueltas (no deben tumbar la respuesta)
  await registrar(e, precios, r.reglas[0]?.id ?? null, codigos, apiKeyId, r.estado, r.reglas.map((x) => x.id)).catch((err) => {
    console.error("[el-renglon] no se pudo registrar la observación:", err);
  });
  return respuesta;
}

async function registrar(e: Entrada, p: Precios | null, reglaId: string | null, codigos: CodigoDetectado[], apiKeyId: number | null,
  estado: string, reglas: string[]) {
  const nombre = e.nombre ? normalizar(e.nombre) : null;
  if (p) {
    await consulta(
      `INSERT INTO iva.observacion_precio (fecha_operacion, codigo_barras, codigo_arancelario, nombre_normalizado, regla_id, precio_compra, precio_venta,
         moneda, precio_compra_bs, precio_venta_bs, precio_compra_usd, precio_venta_usd, tasa_bcv, tasa_fecha_valor, ubicacion, api_key_id, calidad)
       SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
              CASE WHEN EXISTS (SELECT 1 FROM iva.observacion_precio o WHERE o.api_key_id IS NOT DISTINCT FROM $16
                     AND o.codigo_barras IS NOT DISTINCT FROM $2 AND o.nombre_normalizado IS NOT DISTINCT FROM $4
                     AND o.precio_compra IS NOT DISTINCT FROM $6::numeric AND o.precio_venta IS NOT DISTINCT FROM $7::numeric
                     AND o.moneda = $8 AND o.observado_en > now() - interval '1 minute') THEN 'duplicado' ELSE 'ok' END`,
      [e.fecha, codigos[0]?.codigo ?? null, e.codigo_arancelario, nombre, reglaId, e.precio_compra, e.precio_venta, p.moneda,
        txt(p.compra?.bs, 4), txt(p.venta?.bs, 4), txt(p.compra?.usd, 6), txt(p.venta?.usd, 6), p.tasa_bcv_bs, p.tasa_fecha_valor, e.ubicacion, apiKeyId]);
  }
  if (estado !== "determinado") {
    const { precio_compra: _c, precio_venta: _v, ubicacion: _u, ...entrada } = e;
    await consulta("INSERT INTO iva.consulta_registro (estado, entrada, reglas, api_key_id) VALUES ($1, $2, $3, $4)", [estado, entrada, reglas, apiKeyId]);
  }
}
