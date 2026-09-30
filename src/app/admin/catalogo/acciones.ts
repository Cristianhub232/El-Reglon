"use server";
// Edición de una regla del catálogo de IVA desde el panel. Antes de guardar: las expresiones deben compilar y
// estar normalizadas, y los casos de referencia deben seguir dando el resultado esperado con la regla modificada.
import { revalidatePath } from "next/cache";
import { consulta, pool } from "../../../core/db.ts";
import { hoyCaracas } from "../../../core/validacion.ts";
import { SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { catalogo, invalidarCatalogo } from "../../../modules/iva/catalogo.ts";
import { ejecutarCasos, type Caso } from "../../../modules/iva/casos.ts";
import { contenidoRegla, mismoContenido } from "../../../modules/iva/historial.ts";
import { problemasPatron } from "../../../modules/iva/validar.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const lineas = (v: FormDataEntryValue | null) => String(v ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export async function accionEditarRegla(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  let u;
  try { u = await usuarioConPermiso("catalogo.editar"); } catch (e) { return { error: e instanceof SinPermiso ? e.message : "Sin permiso" }; }
  const id = String(form.get("regla") ?? "");
  const gaceta = String(form.get("gaceta") ?? "").trim(), motivo = String(form.get("motivo") ?? "").trim();
  const prioridad = Number(form.get("prioridad"));
  const incluir = lineas(form.get("incluir")), excluir = lineas(form.get("excluir")), todos = lineas(form.get("todos"));
  const nota = String(form.get("nota") ?? "").trim() || null;
  if (gaceta.length < 5) return { error: "Indica el número y la fecha de la Gaceta Oficial que respalda el cambio" };
  if (motivo.length < 10) return { error: "Explica el motivo del cambio (queda en la auditoría)" };
  if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 100) return { error: "La prioridad debe ser un entero entre 1 y 100" };

  invalidarCatalogo();
  const c = await catalogo();
  const actual = c.reglas.find((r) => r.id === id);
  if (!actual) return { error: "La regla no existe" };
  if (incluir.length === 0 && actual.categorias_off.length === 0 && !c.regla_arancel.some((x) => x.regla_id === id)) {
    return { error: "La regla quedaría inalcanzable: agrega al menos una expresión de inclusión" };
  }
  const problemas = [...incluir, ...excluir, ...todos].flatMap((p) => problemasPatron(p).map((m) => `/${p}/ ${m}`));
  if (problemas.length) return { error: `Expresiones inválidas: ${problemas.slice(0, 3).join("; ")}` };
  const nueva = { ...actual, prioridad, patrones_incluir: incluir, patrones_excluir: excluir, patrones_todos: todos, nota };
  if (mismoContenido(contenidoRegla(actual), contenidoRegla(nueva))) return { error: "No hay cambios que guardar" };

  // Casos de referencia con el catálogo modificado
  const casos = (await consulta<{ caso: Caso }>("SELECT caso FROM iva.caso_prueba ORDER BY orden")).map((f) => f.caso);
  const fallos = ejecutarCasos({ reglas: c.reglas.map((r) => (r.id === id ? nueva : r)), regla_arancel: c.regla_arancel,
    decretos: c.decretos.map((d) => ({ ...d })) }, casos, hoyCaracas());
  if (fallos.length) return { error: `El cambio rompe ${fallos.length} de ${casos.length} casos de referencia: ${fallos.slice(0, 3).join(" · ")}` };

  const cx = await pool().connect();
  try {
    await cx.query("BEGIN");
    const { rows: [v] } = await cx.query<{ v: number }>("SELECT coalesce(max(version), 0) AS v FROM iva.regla_historial WHERE regla_id = $1", [id]);
    await cx.query(`UPDATE iva.regla SET prioridad = $2, patrones_incluir = $3, patrones_excluir = $4, patrones_todos = $5, nota = $6 WHERE id = $1`,
      [id, prioridad, incluir, excluir, todos, nota]);
    const { rows: [h] } = await cx.query<{ id: string }>(
      `INSERT INTO iva.regla_historial (regla_id, version, actor, origen, gaceta, motivo, antes, despues, catalogo_version)
       VALUES ($1, $2, $3, 'panel', $4, $5, $6, $7, $8) RETURNING id`,
      [id, v.v + 1, u.correo, gaceta, motivo, contenidoRegla(actual), contenidoRegla(nueva), c.version]);
    // Versión nueva del catálogo (base + edición): la API la informa en version_catalogo y los procesos releen el catálogo
    const base = c.version.split("+")[0];
    await cx.query("INSERT INTO iva.catalogo_version (version, estado, nota) VALUES ($1, $2, $3)",
      [`${base}+e${h.id}`, c.estado, `Edición en el panel: ${id} v${v.v + 1}`]);
    await cx.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'iva.regla.editar', $2)",
      [u.correo, { regla: id, antes: v.v, despues: v.v + 1, motivo, gaceta }]);
    await cx.query("COMMIT");
  } catch (e) {
    await cx.query("ROLLBACK").catch(() => {});
    console.error("[el-renglon] edición de regla:", e);
    return { error: "No se pudo guardar la regla" };
  } finally { cx.release(); }
  invalidarCatalogo();
  revalidatePath("/admin/catalogo");
  return { ok: `Regla ${id} guardada como v${(await consulta<{ v: number }>("SELECT max(version) AS v FROM iva.regla_historial WHERE regla_id = $1", [id]))[0].v}. Los ${casos.length} casos de referencia siguen correctos.` };
}
