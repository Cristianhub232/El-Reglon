// Módulo Arancel: Arancel de Aduanas vigente (Decreto N° 4.944 con reformas 5.103, 5.147 y 5.198).
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";

const AVISO = "Clasificación orientativa. La clasificación arancelaria válida es la que determine la Administración Aduanera (Decreto 4.944, art. 5).";

export function normalizarCodigo(entrada: string): string {
  const d = entrada.replace(/[.\s-]/g, "");
  if (!/^\d{2}$|^\d{4,10}$/.test(d)) {
    throw new ErrorApi(400, "codigo_invalido", "El código debe tener 2 (capítulo), 4 (partida) o de 5 a 10 dígitos, con o sin puntos");
  }
  return d;
}

async function versiones() {
  return consulta<{ instrumento: string; gaceta: string; fecha_publicacion: string }>(
    "SELECT instrumento, gaceta, fecha_publicacion FROM arancel.version ORDER BY fecha_publicacion");
}

export async function detalle(entrada: string) {
  const codigo = normalizarCodigo(entrada);
  if (codigo.length === 2) {
    const [cap] = await consulta<Record<string, unknown>>(
      `SELECT c.codigo, c.titulo, c.reservado, s.romano AS seccion, s.titulo AS seccion_titulo
         FROM arancel.capitulo c JOIN arancel.seccion s ON s.numero = c.seccion WHERE c.codigo = $1`, [codigo]);
    if (!cap) throw new ErrorApi(404, "no_encontrado", `No existe el capítulo ${codigo}`);
    const partidas = await consulta("SELECT codigo, descripcion FROM arancel.partida WHERE capitulo = $1 ORDER BY codigo", [codigo]);
    return { nivel: "capitulo", ...cap, partidas };
  }
  if (codigo.length === 4) {
    const [par] = await consulta<Record<string, unknown>>(
      "SELECT p.codigo, p.descripcion, p.capitulo, c.titulo AS capitulo_titulo FROM arancel.partida p JOIN arancel.capitulo c ON c.codigo = p.capitulo WHERE p.codigo = $1", [codigo]);
    if (!par) throw new ErrorApi(404, "no_encontrado", `No existe la partida ${codigo}`);
    const subpartidas = await consulta(
      `SELECT codigo, codigo_formateado, nivel, descripcion, es_terminal, aec, marca_aec, exaec, marca_exaec, unidad
         FROM arancel.subpartida WHERE partida = $1 ORDER BY orden`, [codigo]);
    return { nivel: "partida", ...par, subpartidas };
  }
  const [s] = await consulta<Record<string, unknown>>(
    `SELECT r.codigo, r.codigo_formateado, r.es_terminal, r.capitulo, r.partida, r.ruta, s.descripcion,
            r.aec, r.marca_aec, r.exaec, r.marca_exaec, r.unidad, u.nombre AS unidad_nombre,
            r.regimen_importacion, r.regimen_exportacion, v.instrumento AS ultima_modificacion, v.gaceta AS ultima_modificacion_gaceta
       FROM arancel.v_subpartida_ruta r
       JOIN arancel.subpartida s ON s.codigo = r.codigo
       JOIN arancel.version v ON v.id = s.version_id
       LEFT JOIN arancel.unidad_fisica u ON u.sigla = r.unidad
      WHERE r.codigo = $1`, [codigo]);
  if (!s) throw new ErrorApi(404, "no_encontrado", `No existe la subpartida ${codigo} en el arancel vigente`);
  const regimenes = await consulta(
    `SELECT codigo, descripcion FROM arancel.regimen_legal
      WHERE codigo = ANY ($1::smallint[] || $2::smallint[]) ORDER BY codigo`, [s.regimen_importacion, s.regimen_exportacion]);
  const hijos = await consulta("SELECT codigo, codigo_formateado, descripcion, es_terminal FROM arancel.subpartida WHERE padre = $1 ORDER BY orden", [codigo]);
  const cambios = await consulta(
    `SELECT v.instrumento, v.gaceta, c.articulo, c.tipo, c.campo, c.antes, c.despues
       FROM arancel.cambio c JOIN arancel.version v ON v.id = c.version_id WHERE c.codigo = $1 ORDER BY v.fecha_publicacion, c.id`, [codigo]);
  const observaciones = await consulta("SELECT tipo, detalle, valor_fuente FROM arancel.observacion_fuente WHERE codigo = $1", [codigo]);
  return { nivel: s.es_terminal ? "subpartida_declarable" : "agrupacion", ...s, regimenes, hijos, historial: cambios,
    observaciones_fuente: observaciones, versiones: await versiones(), aviso: AVISO };
}

export async function buscar(q: string, soloDeclarables: boolean, limite: number) {
  const terminos = q.toLowerCase().split(/\s+/).filter((t) => t.length >= 2).slice(0, 8);
  if (terminos.length === 0) throw new ErrorApi(400, "parametro_invalido", "'q' debe tener al menos una palabra de 2 letras o más");
  // Todas las palabras deben aparecer en la ruta completa (sin acentos); se ordena por similitud con la descripción
  const filas = await consulta(
    `SELECT r.codigo, r.codigo_formateado, r.es_terminal, s.descripcion, r.ruta, r.aec, r.marca_aec, r.exaec, r.marca_exaec, r.unidad,
            round(similarity(unaccent(lower(s.descripcion)), unaccent($1))::numeric, 3) AS similitud
       FROM arancel.v_subpartida_ruta r JOIN arancel.subpartida s ON s.codigo = r.codigo
      WHERE (NOT $3 OR r.es_terminal)
        AND (SELECT bool_and(unaccent(lower(r.ruta)) LIKE '%' || unaccent(t) || '%') FROM unnest($2::text[]) t)
      ORDER BY similitud DESC, r.codigo LIMIT $4`, [q.toLowerCase(), terminos, soloDeclarables, limite]);
  return { consulta: q, cantidad: filas.length, resultados: filas, aviso: AVISO };
}

export async function secciones() {
  const filas = await consulta<{ numero: number; romano: string; titulo: string; capitulos: unknown }>(
    `SELECT s.numero, s.romano, s.titulo,
            json_agg(json_build_object('codigo', c.codigo, 'titulo', c.titulo, 'reservado', c.reservado) ORDER BY c.codigo) AS capitulos
       FROM arancel.seccion s JOIN arancel.capitulo c ON c.seccion = s.numero GROUP BY s.numero ORDER BY s.numero`);
  return { secciones: filas, versiones: await versiones() };
}

const CATALOGOS: Record<string, string> = {
  reglas: "SELECT tipo, numero, literal, texto FROM arancel.regla_interpretacion ORDER BY orden",
  abreviaturas: "SELECT sigla, significado FROM arancel.abreviatura ORDER BY lower(sigla)",
  conversiones: "SELECT magnitud, unidad, equivalencia, unidad_equivalente, equivalencia_texto, nota FROM arancel.conversion_unidad ORDER BY orden",
  regimenes: "SELECT codigo, descripcion FROM arancel.regimen_legal ORDER BY codigo",
  unidades: "SELECT sigla, nombre, magnitud FROM arancel.unidad_fisica ORDER BY sigla",
};

export async function catalogo(nombre: string) {
  const sql = CATALOGOS[nombre];
  if (!sql) throw new ErrorApi(404, "no_encontrado", `Catálogo desconocido. Disponibles: ${Object.keys(CATALOGOS).join(", ")}`);
  return { catalogo: nombre, fuente: "Decreto N° 4.944 (GO Ext. 6.804), art. 37 y preliminares; régimen legal según Decreto 5.198", elementos: await consulta(sql) };
}
