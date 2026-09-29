// Detección de la clasificación arancelaria de un producto (docs/07 §4). Fin propio, independiente del IVA.
// Capas: producto por código de barras (Open Food Facts) → diccionario de nombres comerciales → búsqueda por texto
// en la ruta oficial (dentro de la partida señalada, o en todo el arancel como respaldo) → candidatos con confianza.
// Siempre orientativo: la clasificación oficial la determina la autoridad aduanera.
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { detectarCodigo } from "../iva/codigos.ts";
import { ATRIBUCION_OFF, buscarProducto, type Producto } from "../iva/off.ts";
import { buscarSinonimos, compilarSinonimos, expandirVocabulario, gruposPorCategoriasOff, limpiarConsulta, type GrupoSinonimo, type Sinonimos,
  type Vocablo } from "./sinonimos.ts";

export type Consultor = <T extends Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;

export const RESPONSABILIDAD_ARANCEL = "Resultado orientativo. La clasificación arancelaria oficial la determina la autoridad aduanera (SENIAT) " +
  "conforme a las Reglas Generales para la Interpretación del Sistema Armonizado (Decreto 4.944, art. 5). La decisión corresponde al usuario o a su agente de aduanas.";

// Confianza de partida de cada fuente de la señal
const BASE = { sinonimo: 0.85, categorias_off: 0.8, sinonimo_producto: 0.75 } as const;

export interface EntradaDeteccion { descripcion: string | null; codigo: string | null; limite: number }
interface Puntaje { codigo: string; frase: boolean; cobertura: string; en_partida: number; en_descripcion: number; rango: number }
interface Detalle { codigo: string; codigo_formateado: string; descripcion: string; ruta: string; capitulo: string; partida: string;
  aec: string | null; marca_aec: string | null; unidad: string | null }
interface Candidato { codigo: string; confianza: number; motivos: string[] }

// ---------------------------------------------------------------- diccionario en memoria
let cache: { sinonimos: Sinonimos; version: string; leido: number } | null = null;

export async function cargarSinonimos(q: Consultor = consulta): Promise<{ sinonimos: Sinonimos; version: string }> {
  if (cache && Date.now() - cache.leido < 60_000) return cache;
  const [v] = await q<{ version: string }>("SELECT version FROM arancel.sinonimo_version ORDER BY cargado_en DESC LIMIT 1");
  if (!v) throw new ErrorApi(503, "diccionario_no_cargado", "El diccionario de la detección arancelaria no está cargado (node scripts/arancel-cargar-sinonimos.ts)");
  if (cache && cache.version === v.version) { cache.leido = Date.now(); return cache; }
  const grupos = await q<GrupoSinonimo & Record<string, unknown>>(
    "SELECT grupo, terminos, excluir, prefijos, categorias_off, prioridad, nota FROM arancel.sinonimo ORDER BY id");
  const vocabulario = await q<Vocablo & Record<string, unknown>>("SELECT comercial, oficial FROM arancel.vocabulario");
  cache = { sinonimos: compilarSinonimos(grupos, vocabulario), version: v.version, leido: Date.now() };
  return cache;
}

// ---------------------------------------------------------------- núcleo (recibe la función de consulta)
function clave(p: Puntaje | undefined): [number, number] {
  return p ? [Number(p.cobertura), p.en_descripcion] : [0, 0];
}
const mayor = (a: [number, number], b: [number, number]) => a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]);

async function candidatosDeGrupo(q: Consultor, g: GrupoSinonimo, texto: string, base: number, motivo: string): Promise<Candidato[]> {
  const hojas = await q<{ codigo: string }>(
    "SELECT codigo FROM arancel.indice_busqueda WHERE es_terminal AND codigo LIKE ANY (SELECT unnest($1::text[]) || '%') ORDER BY codigo LIMIT 200", [g.prefijos]);
  if (hojas.length === 0) return [];
  const tope = g.prefijos.length > 1 ? Math.min(base, 0.6) : base;   // varias partidas posibles: nunca determinado
  if (hojas.length === 1) return [{ codigo: hojas[0].codigo, confianza: Math.min(0.95, tope + 0.05), motivos: [motivo] }];
  const puntajes = texto ? await q<Puntaje & Record<string, unknown>>("SELECT * FROM arancel.puntuar_texto($1, $2, 200)", [texto, g.prefijos]) : [];
  const por = new Map(puntajes.map((p) => [p.codigo, p]));
  const ordenadas = [...hojas].sort((a, b) => {
    const [ka, kb] = [clave(por.get(a.codigo)), clave(por.get(b.codigo))];
    return mayor(ka, kb) ? -1 : mayor(kb, ka) ? 1 : (por.get(b.codigo)?.rango ?? 0) - (por.get(a.codigo)?.rango ?? 0) || a.codigo.localeCompare(b.codigo);
  });
  const k0 = clave(por.get(ordenadas[0].codigo));
  if (mayor(k0, clave(por.get(ordenadas[1].codigo)))) {
    // El texto distingue una subpartida dentro de la partida señalada
    return ordenadas.slice(0, 4).map((h, i) => ({ codigo: h.codigo, confianza: i === 0 ? tope - 0.05 : Math.min(0.45, tope - 0.3),
      motivos: [i === 0 ? `${motivo}; la descripción coincide con esta subpartida` : motivo] }));
  }
  // No se distingue: se ofrecen las subpartidas empatadas (el usuario elige)
  const empatadas = ordenadas.filter((h) => !mayor(k0, clave(por.get(h.codigo)))).slice(0, 8);
  return empatadas.map((h) => ({ codigo: h.codigo, confianza: Math.min(0.55, tope), motivos: [motivo] }));
}

export async function ejecutarDeteccion(q: Consultor, sin: Sinonimos, e: EntradaDeteccion, producto: Producto | null) {
  const advertencias: string[] = [];
  const texto = limpiarConsulta([e.descripcion, producto?.nombre].filter(Boolean).join(" "));
  const candidatos = new Map<string, Candidato>();
  const agregar = (lista: Candidato[]) => {
    for (const c of lista) {
      const x = candidatos.get(c.codigo);
      c.confianza = Math.round(c.confianza * 100) / 100;
      if (!x) candidatos.set(c.codigo, { ...c });
      else { x.confianza = Math.max(x.confianza, c.confianza); x.motivos = [...new Set([...x.motivos, ...c.motivos])]; }
    }
  };
  const notas: string[] = [];
  const grupos: { grupo: string; prefijos: string[]; termino: string | null; origen: string }[] = [];

  // 1. Diccionario de nombres comerciales (descripción enviada; si no hay coincidencia, nombre del producto)
  let coincidencias = e.descripcion ? buscarSinonimos(sin, e.descripcion) : [];
  let origen: keyof typeof BASE = "sinonimo";
  if (coincidencias.length === 0 && producto?.nombre) { coincidencias = buscarSinonimos(sin, producto.nombre); origen = "sinonimo_producto"; }
  for (const c of coincidencias) {
    grupos.push({ grupo: c.grupo.grupo, prefijos: c.grupo.prefijos, termino: c.termino, origen });
    if (c.grupo.nota) notas.push(c.grupo.nota);
    // Para afinar dentro de la partida solo cuentan las palabras que no son el nombre comercial ya reconocido
    // ("arroz blanco" → "blanco"; si no, "arroz" favorecería a "Arroz partido" solo por repetir la palabra)
    const delTermino = new Set(c.termino.split(" "));
    // (las palabras con equivalencia oficial se conservan aunque formen parte del término: "pollo entero" → "entero")
    const resto = texto.split(" ").filter((w) => sin.vocabulario.has(w) || ![...delTermino].some((t) => w === t || w === `${t}s` || w === `${t}es`)).join(" ");
    agregar(await candidatosDeGrupo(q, c.grupo, expandirVocabulario(sin, resto), BASE[origen] * (coincidencias.length > 1 ? 0.75 : 1),
      `nombre comercial "${c.termino}" → ${c.grupo.grupo} (${c.grupo.prefijos.join(", ")})`));
  }
  // 2. Categorías de Open Food Facts
  if (producto?.categorias.length) {
    for (const g of gruposPorCategoriasOff(sin, producto.categorias)) {
      if (grupos.some((x) => x.grupo === g.grupo)) continue;
      grupos.push({ grupo: g.grupo, prefijos: g.prefijos, termino: null, origen: "categorias_off" });
      agregar(await candidatosDeGrupo(q, g, expandirVocabulario(sin, texto), BASE.categorias_off, `categoría de Open Food Facts → ${g.grupo} (${g.prefijos.join(", ")})`));
    }
  }
  // 3. Búsqueda por texto en todo el arancel: respaldo si el diccionario no reconoce el producto
  if (candidatos.size === 0 && texto) {
    const puntajes = await q<Puntaje & Record<string, unknown>>("SELECT * FROM arancel.puntuar_texto($1, NULL, 8)", [texto]);
    // Útil si cubre al menos la mitad de las palabras y alguna está en el texto de la partida (lo que el producto ES)
    const utiles = puntajes.filter((p) => Number(p.cobertura) >= 0.5 && (p.en_partida > 0 || p.frase));
    agregar(utiles.map((p) => ({ codigo: p.codigo, confianza: Math.round((0.2 + 0.35 * Number(p.cobertura)) * 100) / 100,
      motivos: [`similitud de texto con la nomenclatura (${Math.round(Number(p.cobertura) * 100)} % de las palabras)`] })));
    if (utiles.length) advertencias.push("El producto no está en el diccionario de nombres comerciales: los candidatos salen solo de la similitud con el texto oficial. Revíselos con cuidado.");
  }

  // 4. Orden, estado y detalle
  // Orden estable: a igual confianza se conserva el orden de la búsqueda por texto
  const lista = [...candidatos.values()].sort((a, b) => b.confianza - a.confianza).slice(0, e.limite);
  const detalle = lista.length ? await q<Detalle & Record<string, unknown>>(
    `SELECT r.codigo, r.codigo_formateado, s.descripcion, r.ruta, r.capitulo, r.partida, r.aec, r.marca_aec, r.unidad
       FROM arancel.v_subpartida_ruta r JOIN arancel.subpartida s ON s.codigo = r.codigo WHERE r.codigo = ANY ($1)`, [lista.map((c) => c.codigo)]) : [];
  const porCodigo = new Map(detalle.map((d) => [d.codigo, d]));
  // Lo que distingue a los candidatos: la parte de la ruta que no comparten
  const segmentos = lista.map((c) => (porCodigo.get(c.codigo)?.ruta ?? "").split(" > "));
  let comun = 0;
  while (segmentos.length > 1 && segmentos.every((s) => s[comun] !== undefined && s[comun] === segmentos[0][comun])) comun++;
  const resultado = lista.map((c, i) => ({ ...porCodigo.get(c.codigo)!, confianza: c.confianza, motivo: c.motivos.join("; "),
    diferencia: segmentos.length > 1 ? segmentos[i].slice(comun).join(" > ") : null }));

  const [p1, p2] = lista;
  const estado = !p1 ? "no_determinado" : p1.confianza >= 0.8 && (!p2 || p2.confianza <= p1.confianza - 0.25) ? "determinado" : "condicionado";
  const preguntas: string[] = [...new Set(notas)];
  if (estado === "condicionado" && resultado.length > 1) {
    preguntas.push(`¿Cuál describe mejor el producto? ${resultado.map((r, i) => `(${i + 1}) ${r.codigo_formateado}: ${r.diferencia || r.descripcion}`).join("; ")}`);
  }
  if (estado === "no_determinado") {
    advertencias.push("No se encontró un código probable. Describa el producto por lo que es y de qué está hecho (p. ej. 'zapatos de cuero para hombre'), sin marcas.");
  }
  return { estado, grupos, candidatos: resultado, preguntas_para_afinar: preguntas, advertencias, consulta_texto: texto };
}

// ---------------------------------------------------------------- entrada HTTP
export function validarEntrada(b: Record<string, unknown>): EntradaDeteccion {
  const texto = (v: unknown, nombre: string, max: number) => {
    if (v === undefined || v === null || v === "") return null;
    if (typeof v !== "string" || v.length > max) throw new ErrorApi(400, "parametro_invalido", `'${nombre}' debe ser texto de hasta ${max} caracteres`);
    return v.trim() || null;
  };
  const descripcion = texto(b.descripcion, "descripcion", 300);
  const codigo = texto(b.codigo, "codigo", 64);
  if (!descripcion && !codigo) throw new ErrorApi(400, "entrada_insuficiente", "Envíe 'descripcion' (qué es el producto) y/o 'codigo' (código de barras)");
  let limite = 5;
  if (b.limite !== undefined && b.limite !== null) {
    limite = Number(b.limite);
    if (!Number.isInteger(limite) || limite < 1 || limite > 20) throw new ErrorApi(400, "parametro_invalido", "'limite' debe ser un entero entre 1 y 20");
  }
  return { descripcion, codigo, limite };
}

export async function detectar(e: EntradaDeteccion, apiKeyId: number | null) {
  const { sinonimos, version } = await cargarSinonimos();
  const advertencias: string[] = [];
  let producto: Producto | null = null;
  let codigo: ReturnType<typeof detectarCodigo> | null = null;
  if (e.codigo) {
    codigo = detectarCodigo(e.codigo);
    if (codigo.nota) advertencias.push(`${codigo.codigo} (${codigo.tipo}): ${codigo.nota}`);
    if (codigo.consultable) {
      const r = await buscarProducto(codigo.codigo);
      if (r.advertencia) advertencias.push(r.advertencia);
      if (r.producto?.encontrado) producto = r.producto;
      else if (!e.descripcion) advertencias.push(`El código ${codigo.codigo} no está en las bases públicas de productos: envíe la descripción.`);
    }
  }
  const r = await ejecutarDeteccion(consulta, sinonimos, e, producto);
  const [v] = await consulta<{ instrumento: string; gaceta: string }>(
    "SELECT instrumento, gaceta FROM arancel.version ORDER BY fecha_publicacion DESC LIMIT 1");
  await consulta("INSERT INTO arancel.deteccion (estado, entrada, candidatos, api_key_id) VALUES ($1, $2, $3, $4)",
    [r.estado, { descripcion: e.descripcion, codigo: e.codigo }, r.candidatos.map((c) => c.codigo), apiKeyId]).catch((err) => {
    console.error("[el-renglon] no se pudo registrar la detección:", err);
  });
  return {
    estado: r.estado,
    entrada: { descripcion: e.descripcion, codigo: codigo ? { codigo: codigo.codigo, tipo: codigo.tipo, digito_verificador: codigo.digito_verificador } : null },
    producto_identificado: producto ? { nombre: producto.nombre, marca: producto.marca, cantidad: producto.cantidad, fuente: producto.fuente } : null,
    candidatos: r.candidatos, grupos: r.grupos, preguntas_para_afinar: r.preguntas_para_afinar,
    advertencias: [...advertencias, ...r.advertencias], responsabilidad: RESPONSABILIDAD_ARANCEL,
    version_arancel: v ? `${v.instrumento} (${v.gaceta})` : null, version_diccionario: version, ...(producto ? { atribucion: ATRIBUCION_OFF } : {}),
  };
}
