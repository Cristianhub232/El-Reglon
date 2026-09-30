// Carga el diccionario de la detección arancelaria (datos/arancel/sinonimos.json) y recrea el índice de búsqueda,
// en una sola transacción y después del arancel. Si una validación falla, no se carga nada.
//   node scripts/arancel-cargar-sinonimos.ts [sinonimos.json]
import "./entorno.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pool } from "../src/core/db.ts";
import { normalizar } from "../src/modules/iva/normalizar.ts";
import { ejecutarDeteccion, type Consultor } from "../src/modules/arancel/deteccion.ts";
import { buscarSinonimos, compilarSinonimos, type GrupoSinonimo, type Vocablo } from "../src/modules/arancel/sinonimos.ts";

interface Caso { descripcion: string; esperado: { grupo?: string; prefijo?: string; estado?: string } }

const ruta = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "datos/arancel/sinonimos.json";
const bruto = readFileSync(ruta);
const { grupos, vocabulario } = JSON.parse(bruto.toString("utf8")) as { grupos: GrupoSinonimo[]; vocabulario: Vocablo[] };
const { casos } = JSON.parse(readFileSync("datos/arancel/casos_deteccion.json", "utf8")) as { casos: Caso[] };
const version = createHash("sha256").update(bruto).digest("hex").slice(0, 12);

const resultados: { nombre: string; ok: boolean; detalle: string }[] = [];
function validar(nombre: string, errores: string[], detalleOk = "") {
  resultados.push({ nombre, ok: errores.length === 0,
    detalle: errores.length ? errores.slice(0, 15).join("\n      ") + (errores.length > 15 ? `\n      … y ${errores.length - 15} más` : "") : detalleOk });
}
const duplicados = (xs: string[]) => [...new Set(xs.filter((x, i) => xs.indexOf(x) !== i))];

validar("V1 grupos y términos únicos", [
  ...duplicados(grupos.map((g) => g.grupo)).map((x) => `grupo repetido: ${x}`),
  ...duplicados(grupos.flatMap((g) => [...new Set(g.terminos)])).map((x) => `término en más de un grupo: "${x}"`),
], `${grupos.length} grupos, ${grupos.reduce((s, g) => s + g.terminos.length, 0)} términos`);

{
  const e: string[] = [];
  for (const g of grupos) {
    if (!g.terminos.length) e.push(`${g.grupo}: sin términos`);
    for (const t of [...g.terminos, ...g.excluir]) {
      const partes = t.split(" ... ");   // " ... " = hasta 3 palabras intermedias
      if (partes.some((x) => !x || normalizar(x) !== x)) e.push(`${g.grupo}: "${t}" no está normalizado (use "${partes.map(normalizar).join(" ... ")}")`);
    }
    if (!g.prefijos.length) e.push(`${g.grupo}: sin prefijos`);
    for (const p of g.prefijos) if (!/^\d{4,10}$/.test(p)) e.push(`${g.grupo}: prefijo ${p} inválido (4 a 10 dígitos)`);
    if (!(g.prioridad >= 1 && g.prioridad <= 100)) e.push(`${g.grupo}: prioridad fuera de 1–100`);
    if (g.excluir.some((x) => g.terminos.some((t) => new RegExp(`(?<![a-z0-9])${x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(t)))) {
      e.push(`${g.grupo}: un término de 'excluir' anula a uno de sus propios términos`);
    }
  }
  for (const v of vocabulario) if (normalizar(v.comercial) !== v.comercial || !v.oficial) e.push(`vocabulario: "${v.comercial}" no está normalizado o no tiene equivalente`);
  e.push(...duplicados(vocabulario.map((v) => v.comercial)).map((x) => `vocabulario repetido: "${x}"`));
  validar("V2 términos normalizados y prefijos bien formados", e, `${vocabulario.length} equivalencias de vocabulario`);
}

{
  // Reconocimiento del diccionario (sin base de datos)
  const sin = compilarSinonimos(grupos, vocabulario);
  const e: string[] = [];
  for (const c of casos) {
    const hallados = buscarSinonimos(sin, c.descripcion).map((h) => h.grupo.grupo);
    const esperado = c.esperado.grupo ?? null;
    if (esperado ? hallados[0] !== esperado || hallados.length !== 1 : hallados.length > 0) {
      e.push(`"${c.descripcion}": esperado ${esperado ?? "ningún grupo"}; obtenido ${hallados.join(", ") || "ninguno"}`);
    }
  }
  validar("V3 casos de referencia: reconocimiento del diccionario", e, `${casos.length} casos correctos`);
}

async function main() {
  const c = await pool().connect();
  const q: Consultor = async (sql, params) => (await c.query(sql, params)).rows;
  try {
    await c.query("BEGIN");
    await c.query(readFileSync("db/arancel/003_deteccion.sql", "utf8"));
    const faltan = await q<{ grupo: string; prefijo: string }>(
      `SELECT g.grupo, p.prefijo FROM jsonb_to_recordset($1::jsonb) AS g(grupo text, prefijos text[]), unnest(g.prefijos) p(prefijo)
        WHERE NOT EXISTS (SELECT 1 FROM arancel.subpartida s WHERE s.es_terminal AND s.codigo LIKE p.prefijo || '%')`, [JSON.stringify(grupos)]);
    validar("V4 prefijos con subpartidas declarables en el arancel vigente", faltan.map((f) => `${f.grupo}: ${f.prefijo} no tiene subpartidas declarables`),
      `${new Set(grupos.flatMap((g) => g.prefijos)).size} prefijos`);

    // Los grupos del panel se conservan (salvo que el archivo traiga uno con el mismo nombre)
    await c.query("DELETE FROM arancel.sinonimo WHERE origen = 'archivo'; DELETE FROM arancel.vocabulario");
    await c.query("INSERT INTO arancel.vocabulario SELECT * FROM jsonb_to_recordset($1::jsonb) AS x(comercial text, oficial text)", [JSON.stringify(vocabulario)]);
    await c.query(`INSERT INTO arancel.sinonimo (grupo, terminos, excluir, prefijos, categorias_off, prioridad, nota, origen)
                   SELECT *, 'archivo' FROM jsonb_to_recordset($1::jsonb) AS x(grupo text, terminos text[], excluir text[], prefijos text[],
                     categorias_off text[], prioridad smallint, nota text)
                   ON CONFLICT (grupo) DO UPDATE SET terminos = EXCLUDED.terminos, excluir = EXCLUDED.excluir, prefijos = EXCLUDED.prefijos,
                     categorias_off = EXCLUDED.categorias_off, prioridad = EXCLUDED.prioridad, nota = EXCLUDED.nota, origen = 'archivo'`, [JSON.stringify(grupos)]);
    await c.query("DELETE FROM arancel.caso_deteccion");
    await c.query("INSERT INTO arancel.caso_deteccion (orden, caso) SELECT (x.o)::int, x.c FROM jsonb_array_elements($1::jsonb) WITH ORDINALITY AS x(c, o)", [JSON.stringify(casos)]);

    // Detección completa (diccionario + búsqueda por texto) con los datos de esta misma transacción
    // Con todos los grupos vigentes: los del archivo y los agregados en el panel
    const todos = await q<GrupoSinonimo & Record<string, unknown>>("SELECT grupo, terminos, excluir, prefijos, categorias_off, prioridad, nota FROM arancel.sinonimo ORDER BY id");
    const sin = compilarSinonimos(todos, vocabulario);
    const e: string[] = [];
    for (const caso of casos) {
      const r = await ejecutarDeteccion(q, sin, { descripcion: caso.descripcion, codigo: null, limite: 5 }, null);
      const primero = r.candidatos[0]?.codigo as string | undefined;
      const x = caso.esperado;
      if ((x.prefijo && !primero?.startsWith(x.prefijo)) || (x.estado && r.estado !== x.estado)) {
        e.push(`"${caso.descripcion}": esperado ${x.prefijo ?? "—"} ${x.estado ?? ""}; obtenido ${primero ?? "ninguno"} ${r.estado} (${r.candidatos.length} candidatos)`);
      }
    }
    validar("V5 casos de referencia: detección completa", e, `${casos.length} casos correctos`);
    const [n] = await q<{ n: string; indice: string }>(
      "SELECT (SELECT count(*) FROM arancel.sinonimo WHERE origen = 'archivo') AS n, (SELECT count(*) FROM arancel.indice_busqueda) AS indice");
    validar("V6 conteos cargados", Number(n.n) === grupos.length ? [] : [`${n.n} grupos cargados, ${grupos.length} en el archivo`],
      `${n.n} grupos; índice de búsqueda con ${n.indice} códigos`);

    for (const r of resultados) console.log(`${r.ok ? "✔" : "✘"} ${r.nombre}${r.detalle ? `\n      ${r.detalle}` : ""}`);
    const fallidas = resultados.filter((r) => !r.ok);
    if (fallidas.length) throw new Error(`${fallidas.length} validaciones fallidas: no se cargó nada`);
    await c.query(`INSERT INTO arancel.sinonimo_version (version, validaciones) VALUES ($1, $2)
                   ON CONFLICT (version) DO UPDATE SET cargado_en = now(), validaciones = EXCLUDED.validaciones`, [version, JSON.stringify(resultados)]);
    await c.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('cli', 'arancel.sinonimos.cargar', $1)", [{ version, grupos: grupos.length }]);
    await c.query("COMMIT");
    console.log(`Validaciones ${resultados.length}/${resultados.length} superadas. Diccionario de detección ${version} cargado.`);
  } catch (err) {
    await c.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    c.release();
  }
}

main().catch((e) => { console.error(`ERROR: ${e.message}`); process.exitCode = 1; }).finally(() => pool().end());
