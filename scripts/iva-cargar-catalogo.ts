// Carga el catálogo del clasificador de IVA (datos/iva/catalogo.json) en PostgreSQL, en una sola transacción.
//   node scripts/iva-cargar-catalogo.ts [catalogo.json] [--sin-pdf]
// Antes de escribir, valida el catálogo: si una validación falla, no se carga nada.
//   --sin-pdf: omite la comprobación de los textos legales contra las Gacetas (requiere pdftotext y pdfinfo);
//              en ese caso los textos quedan con verificado = false.
import "./entorno.ts";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pool } from "../src/core/db.ts";
import { hoyCaracas } from "../src/core/validacion.ts";
import { ejecutarCasos, type Caso } from "../src/modules/iva/casos.ts";
import { CAMPOS, OPERADORES, type ReglaCatalogo } from "../src/modules/iva/motor.ts";
import { contenidoRegla, mismoContenido, type ContenidoRegla } from "../src/modules/iva/historial.ts";
import { problemasPatron } from "../src/modules/iva/validar.ts";

interface BaseLegal { id: string; norma: string; gaceta: string; fuente: string | null; articulo: string | null; numeral: string | null; literal: string | null; texto: string }
interface Catalogo {
  estado: string; fuentes: Record<string, string>;
  alicuotas: { codigo: string; porcentaje: number; vigente_desde: string; vigente_hasta: string | null; instrumento: string }[];
  categorias: { codigo: string; denominacion: string; componentes: string[]; marca_exento: boolean; concepto_nacional: string; concepto_importacion: string }[];
  decretos: { codigo: string; nombre: string; gaceta: string; efecto: string; vigente_desde: string; vigente_hasta: string | null; base_legal: string; nota: string | null }[];
  base_legal: BaseLegal[]; reglas: ReglaCatalogo[]; regla_arancel: { prefijo: string; regla_id: string; nota?: string }[];
}

const args = process.argv.slice(2);
const sinPdf = args.includes("--sin-pdf");
const forzar = args.includes("--forzar");   // descarta ediciones del panel que no se exportaron al archivo
const ruta = args.find((a) => !a.startsWith("--")) ?? "datos/iva/catalogo.json";
const bruto = readFileSync(ruta);
const cat = JSON.parse(bruto.toString("utf8")) as Catalogo;
const version = createHash("sha256").update(bruto).digest("hex").slice(0, 12);

const resultados: { nombre: string; ok: boolean; detalle: string }[] = [];
function validar(nombre: string, errores: string[], detalleOk = "") {
  resultados.push({ nombre, ok: errores.length === 0, detalle: errores.length ? errores.slice(0, 15).join("\n      ") + (errores.length > 15 ? `\n      … y ${errores.length - 15} más` : "") : detalleOk });
}
const duplicados = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

// ---------------------------------------------------------------- validaciones sin base de datos
validar("V1 identificadores únicos", [
  ...duplicados(cat.reglas.map((r) => r.id)).map((x) => `regla repetida: ${x}`),
  ...duplicados(cat.base_legal.map((b) => b.id)).map((x) => `base legal repetida: ${x}`),
  ...duplicados(cat.regla_arancel.map((x) => x.prefijo)).map((x) => `prefijo repetido: ${x}`),
  ...duplicados(cat.categorias.map((c) => c.codigo)).map((x) => `categoría repetida: ${x}`),
  ...duplicados(cat.alicuotas.map((a) => `${a.codigo}@${a.vigente_desde}`)).map((x) => `alícuota repetida: ${x}`),
], `${cat.reglas.length} reglas, ${cat.base_legal.length} textos legales, ${cat.regla_arancel.length} prefijos`);

{
  const e: string[] = [];
  let n = 0;
  for (const r of cat.reglas) {
    for (const p of [...r.patrones_incluir, ...r.patrones_excluir, ...r.patrones_todos]) {
      n++;
      for (const problema of problemasPatron(p)) e.push(`${r.id}: /${p}/ ${problema}`);
    }
  }
  validar("V2 patrones válidos y normalizados", e, `${n} expresiones regulares`);
}

{
  const e: string[] = [];
  const conArancel = new Set(cat.regla_arancel.map((x) => x.regla_id));
  const ids = new Set(cat.reglas.map((r) => r.id));
  for (const r of cat.reglas) {
    if (!/^[A-Z0-9_]+$/.test(r.id)) e.push(`${r.id}: id inválido (solo mayúsculas, dígitos y _)`);
    if (!["BIEN", "SERVICIO"].includes(r.tipo)) e.push(`${r.id}: tipo ${r.tipo} inválido`);
    if (!(r.prioridad >= 1 && r.prioridad <= 100)) e.push(`${r.id}: prioridad fuera de 1–100`);
    if (r.opciones.length === 0) e.push(`${r.id}: sin opciones`);
    if (!r.patrones_incluir.length && !r.categorias_off.length && !conArancel.has(r.id)) e.push(`${r.id}: inalcanzable (sin patrones, categorías OFF ni prefijos)`);
    if (r.zona_gris && r.opciones.length < 2) e.push(`${r.id}: zona gris con una sola opción`);
  }
  for (const x of cat.regla_arancel) {
    if (!/^\d{2,10}$/.test(x.prefijo)) e.push(`prefijo ${x.prefijo} inválido`);
    if (!ids.has(x.regla_id)) e.push(`prefijo ${x.prefijo}: regla ${x.regla_id} no existe`);
  }
  validar("V3 reglas alcanzables y prefijos bien formados", e);
}

{
  const e: string[] = [];
  const categorias = new Set(cat.categorias.map((c) => c.codigo));
  const bases = new Set(cat.base_legal.map((b) => b.id));
  const componentes = new Set(cat.alicuotas.map((a) => a.codigo));
  for (const c of cat.categorias) for (const x of c.componentes) if (!componentes.has(x)) e.push(`categoría ${c.codigo}: componente ${x} sin alícuota`);
  for (const r of cat.reglas) {
    for (const o of r.opciones) {
      if (!categorias.has(o.categoria)) e.push(`${r.id}: categoría ${o.categoria} no existe`);
      if (o.base_legal.length === 0) e.push(`${r.id}: opción ${o.categoria} sin base legal`);
      for (const b of o.base_legal) if (!bases.has(b)) e.push(`${r.id}: base legal ${b} no existe`);
    }
  }
  for (const d of cat.decretos) if (!bases.has(d.base_legal)) e.push(`decreto ${d.codigo}: base legal ${d.base_legal} no existe`);
  for (const b of cat.base_legal) if (b.fuente && !cat.fuentes[b.fuente]) e.push(`${b.id}: fuente ${b.fuente} sin PDF en 'fuentes'`);
  for (const id of ["LIVA-17-1", "LIVA-63"]) if (!bases.has(id)) e.push(`falta ${id} (lo usa el motor para las importaciones)`);
  validar("V4 referencias (categorías, base legal, alícuotas)", e);
}

{
  const e: string[] = [];
  for (const r of cat.reglas) {
    const evals = r.opciones.map((o) => o.condicion_eval);
    if (evals.some(Boolean) && !evals.every(Boolean)) e.push(`${r.id}: si una opción se evalúa, todas deben evaluarse (opciones complementarias)`);
    if (new Set(evals.filter(Boolean).map((c) => c!.campo)).size > 1) e.push(`${r.id}: las condiciones evaluables deben usar un mismo campo`);
    for (const o of r.opciones) {
      const c = o.condicion_eval;
      if (!c) continue;
      if (!CAMPOS.includes(c.campo)) e.push(`${r.id}: campo ${c.campo} no soportado`);
      if (!(OPERADORES as readonly string[]).includes(c.op)) e.push(`${r.id}: operador ${c.op} no soportado`);
      if (["<", "<=", ">", ">="].includes(c.op) && typeof c.valor !== "number") e.push(`${r.id}: ${c.op} requiere un valor numérico`);
      if (!o.condicion) e.push(`${r.id}: condición evaluable sin texto para el usuario`);
    }
  }
  validar("V5 condiciones evaluables", e);
}

{
  // Todo literal de los arts. 16, 18, 19, 61 y 64 debe estar en alguna regla (el 17.1 y el 63 los aplica el motor)
  const usados = new Set(cat.reglas.flatMap((r) => r.opciones.flatMap((o) => o.base_legal)));
  const cubrir = cat.base_legal.map((b) => b.id).filter((id) => /^LIVA-(16|18|19|61|64)-/.test(id));
  const faltan = cubrir.filter((id) => !usados.has(id));
  validar("V6 cobertura de la ley (arts. 16, 18, 19, 61 y 64)", faltan.map((id) => `${id} no está en ninguna regla`), `${cubrir.length} numerales y literales cubiertos`);
}

// Comprobación de los textos contra las Gacetas: texto reducido a letras y dígitos, buscado en la extracción por
// columnas (-layout) y en la extracción de página completa (los PDF de la Gaceta van a dos columnas).
const reducir = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]/g, "");
function textoPdf(archivo: string): string {
  const info = execFileSync("pdfinfo", [archivo], { encoding: "utf8" });
  const paginas = Number(/Pages:\s+(\d+)/.exec(info)![1]);
  const [ancho, alto] = /Page size:\s+([\d.]+) x ([\d.]+)/.exec(info)!.slice(1).map(Number);
  const partes: string[] = [execFileSync("pdftotext", [archivo, "-"], { encoding: "utf8", maxBuffer: 64 << 20 })];
  for (let p = 1; p <= paginas; p++) {
    for (const x of [0, Math.floor(ancho / 2)]) {
      partes.push(execFileSync("pdftotext", ["-layout", "-f", String(p), "-l", String(p), "-x", String(x), "-y", "0",
        "-W", String(Math.floor(ancho / 2) + 1), "-H", String(Math.ceil(alto) + 1), archivo, "-"], { encoding: "utf8", maxBuffer: 64 << 20 }));
    }
  }
  return partes.map(reducir).join("|");
}
const verificado = new Map<string, boolean>();
if (sinPdf) {
  for (const b of cat.base_legal) verificado.set(b.id, false);
  validar("V7 textos legales contra las Gacetas", [], "OMITIDA (--sin-pdf): todos los textos quedan sin verificar");
} else {
  const e: string[] = [];
  const textos = new Map<string, string>();
  for (const [clave, archivo] of Object.entries(cat.fuentes)) {
    try { textos.set(clave, textoPdf(archivo)); } catch (err) { e.push(`${archivo}: no se pudo leer (${(err as Error).message.split("\n")[0]}); use --sin-pdf si no tiene pdftotext`); }
  }
  let ok = 0;
  const sinFuente: string[] = [];
  for (const b of cat.base_legal) {
    if (!b.fuente) { verificado.set(b.id, false); sinFuente.push(b.id); continue; }
    const t = textos.get(b.fuente);
    const v = !!t && t.includes(reducir(b.texto));
    verificado.set(b.id, v);
    if (v) ok++; else if (t) e.push(`${b.id}: el texto no coincide con ${cat.fuentes[b.fuente]}`);
  }
  validar("V7 textos legales contra las Gacetas", e, `${ok} textos idénticos a la Gaceta; sin fuente oficial a mano: ${sinFuente.join(", ") || "ninguno"}`);
}

const { casos } = JSON.parse(readFileSync("datos/iva/casos_prueba.json", "utf8")) as { casos: Caso[] };
{
  if (resultados.some((r) => !r.ok)) validar("V8 casos de referencia", ["no se ejecutaron: corrija primero las validaciones anteriores"]);
  else {
    const fallos = ejecutarCasos(cat, casos, hoyCaracas());
    validar("V8 casos de referencia", fallos, `${casos.length} casos correctos`);
  }
}

// ---------------------------------------------------------------- carga
async function main() {
  const c = await pool().connect();
  try {
    await c.query("BEGIN");
    await c.query(readFileSync("db/iva/001_esquema.sql", "utf8"));
    await c.query(readFileSync("db/iva/002_historial.sql", "utf8"));
    const { rows: faltan } = await c.query<{ prefijo: string }>(
      `SELECT p.prefijo FROM unnest($1::text[]) p(prefijo)
        WHERE NOT EXISTS (SELECT 1 FROM arancel.capitulo WHERE codigo = p.prefijo)
          AND NOT EXISTS (SELECT 1 FROM arancel.partida WHERE codigo = p.prefijo)
          AND NOT EXISTS (SELECT 1 FROM arancel.subpartida WHERE codigo LIKE p.prefijo || '%')`, [cat.regla_arancel.map((x) => x.prefijo)]);
    validar("V9 prefijos en el arancel vigente", faltan.map((f) => `${f.prefijo} no existe en el arancel`), `${cat.regla_arancel.length} prefijos existen`);

    // V11: reglas cuya última versión viene del panel y que el archivo no recoge (no se exportaron): no se pisan
    const { rows: editadas } = await c.query<{ regla_id: string; despues: ContenidoRegla; actor: string; ocurrido_en: string }>(
      `SELECT DISTINCT ON (regla_id) regla_id, despues, actor, to_char(ocurrido_en AT TIME ZONE 'America/Caracas', 'DD/MM/YYYY HH24:MI') AS ocurrido_en, origen FROM iva.regla_historial
        ORDER BY regla_id, version DESC`);
    const porId = new Map(cat.reglas.map((r) => [r.id, r]));
    const pisadas = editadas.filter((h) => (h as unknown as { origen: string }).origen === "panel")
      .filter((h) => { const r = porId.get(h.regla_id); return !r || !mismoContenido(h.despues, contenidoRegla(r)); });
    validar("V11 ediciones del panel incluidas en el archivo", forzar ? [] : pisadas.map((h) =>
      `${h.regla_id}: editada en el panel por ${h.actor} (${h.ocurrido_en.slice(0, 16)}) y no exportada. Exporte con node scripts/iva-exportar-catalogo.ts o use --forzar para descartarla`),
      forzar && pisadas.length ? `--forzar: se descartan ${pisadas.length} ediciones del panel` : "sin ediciones pendientes de exportar");

    const fallidas = resultados.filter((r) => !r.ok);
    for (const r of resultados) console.log(`${r.ok ? "✔" : "✘"} ${r.nombre}${r.detalle ? `\n      ${r.detalle}` : ""}`);
    if (fallidas.length) throw new Error(`${fallidas.length} validaciones fallidas: no se cargó nada`);

    await c.query("DELETE FROM iva.opcion_regla; DELETE FROM iva.regla_arancel; DELETE FROM iva.regla; DELETE FROM iva.decreto; DELETE FROM iva.base_legal; DELETE FROM iva.categoria; DELETE FROM iva.alicuota");
    const ins = (sql: string, filas: unknown[]) => c.query(sql, [JSON.stringify(filas)]);
    await ins(`INSERT INTO iva.alicuota SELECT * FROM jsonb_to_recordset($1::jsonb)
                 AS x(codigo text, porcentaje numeric, vigente_desde date, vigente_hasta date, instrumento text)`, cat.alicuotas);
    await ins(`INSERT INTO iva.categoria SELECT * FROM jsonb_to_recordset($1::jsonb)
                 AS x(codigo text, denominacion text, componentes text[], marca_exento boolean, concepto_nacional text, concepto_importacion text)`, cat.categorias);
    await ins(`INSERT INTO iva.base_legal (id, norma, gaceta, articulo, numeral, literal, texto, fuente_pdf, verificado)
               SELECT id, norma, gaceta, coalesce(articulo, '—'), numeral, literal, texto, fuente_pdf, verificado FROM jsonb_to_recordset($1::jsonb)
                 AS x(id text, norma text, gaceta text, articulo text, numeral text, literal text, texto text, fuente_pdf text, verificado boolean)`,
      cat.base_legal.map((b) => ({ ...b, fuente_pdf: b.fuente ? cat.fuentes[b.fuente] : null, verificado: verificado.get(b.id) })));
    await ins(`INSERT INTO iva.decreto (codigo, nombre, gaceta, efecto, vigente_desde, vigente_hasta, base_legal, nota)
               SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(codigo text, nombre text, gaceta text, efecto text,
                 vigente_desde date, vigente_hasta date, base_legal text, nota text)`, cat.decretos);
    await ins(`INSERT INTO iva.regla (id, tipo, nombre, prioridad, patrones_incluir, patrones_excluir, patrones_todos, categorias_off, zona_gris, nota)
               SELECT id, tipo, nombre, prioridad, patrones_incluir, patrones_excluir, patrones_todos, categorias_off, zona_gris, nota
                 FROM jsonb_to_recordset($1::jsonb) AS x(id text, tipo text, nombre text, prioridad smallint, patrones_incluir text[],
                   patrones_excluir text[], patrones_todos text[], categorias_off text[], zona_gris boolean, nota text)`, cat.reglas);
    await ins(`INSERT INTO iva.opcion_regla (regla_id, orden, categoria, base_legal, condicion, condicion_eval)
               SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(regla_id text, orden smallint, categoria text, base_legal text[], condicion text, condicion_eval jsonb)`,
      cat.reglas.flatMap((r) => r.opciones.map((o, i) => ({ regla_id: r.id, orden: i + 1, ...o }))));
    await ins(`INSERT INTO iva.regla_arancel (prefijo, regla_id, nota) SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(prefijo text, regla_id text, nota text)`, cat.regla_arancel);
    // Historial: una versión nueva por regla solo si su contenido cambió respecto de la última registrada
    const ultimas = new Map(editadas.map((h) => [h.regla_id, h]));
    const { rows: [maxV] } = await c.query<{ m: Record<string, number> | null }>(
      "SELECT jsonb_object_agg(regla_id, v) AS m FROM (SELECT regla_id, max(version) AS v FROM iva.regla_historial GROUP BY regla_id) x");
    const nuevas = cat.reglas.filter((r) => !mismoContenido(ultimas.get(r.id)?.despues, contenidoRegla(r))).map((r) => ({
      regla_id: r.id, version: (maxV.m?.[r.id] ?? 0) + 1, actor: "cli", origen: "carga", motivo: `Carga del catálogo ${version}`,
      antes: ultimas.get(r.id)?.despues ?? null, despues: contenidoRegla(r), catalogo_version: version }));
    await ins(`INSERT INTO iva.regla_historial (regla_id, version, actor, origen, motivo, antes, despues, catalogo_version)
               SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(regla_id text, version int, actor text, origen text, motivo text, antes jsonb, despues jsonb, catalogo_version text)`, nuevas);
    await c.query("DELETE FROM iva.caso_prueba");
    await ins("INSERT INTO iva.caso_prueba (orden, caso) SELECT (x.o)::int, x.c FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(c, o)", casos);
    console.log(`  historial: ${nuevas.length} reglas con versión nueva · ${casos.length} casos de referencia guardados`);
    await c.query(`INSERT INTO iva.catalogo_version (version, estado, nota, validaciones) VALUES ($1, $2, $3, $4)
                   ON CONFLICT (version) DO UPDATE SET cargado_en = now(), validaciones = EXCLUDED.validaciones`,
      [version, cat.estado, ruta, JSON.stringify(resultados)]);
    await c.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('cli', 'iva.catalogo.cargar', $1)",
      [{ version, reglas: cat.reglas.length, base_legal: cat.base_legal.length, prefijos: cat.regla_arancel.length }]);

    // V10: lo cargado coincide con el archivo
    const { rows: [n] } = await c.query<Record<string, string>>(`SELECT (SELECT count(*) FROM iva.regla) reglas, (SELECT count(*) FROM iva.opcion_regla) opciones,
      (SELECT count(*) FROM iva.base_legal) base_legal, (SELECT count(*) FROM iva.regla_arancel) prefijos`);
    const esperado = { reglas: cat.reglas.length, opciones: cat.reglas.reduce((s, r) => s + r.opciones.length, 0), base_legal: cat.base_legal.length, prefijos: cat.regla_arancel.length };
    const dif = Object.entries(esperado).filter(([k, v]) => Number(n[k]) !== v).map(([k, v]) => `${k}: ${n[k]} cargados, ${v} en el archivo`);
    validar("V10 conteos cargados", dif, Object.entries(esperado).map(([k, v]) => `${k}=${v}`).join(" "));
    const v10 = resultados.at(-1)!;
    console.log(`${v10.ok ? "✔" : "✘"} ${v10.nombre}\n      ${v10.detalle}`);
    if (!v10.ok) throw new Error("Los conteos no coinciden: no se cargó nada");
    await c.query("COMMIT");
    console.log(`Validaciones ${resultados.length}/${resultados.length} superadas. Catálogo IVA ${version} cargado (${cat.estado}).`);
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; }).finally(() => pool().end());
