"use server";
// Sinónimos comerciales de la detección arancelaria agregados desde el panel. Antes de guardar: términos normalizados,
// prefijos con subpartidas declarables y los casos de referencia de la detección con el grupo nuevo incluido.
import { revalidatePath } from "next/cache";
import { consulta, pool } from "../../../core/db.ts";
import { SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import { ejecutarDeteccion, invalidarSinonimos } from "../../../modules/arancel/deteccion.ts";
import { compilarSinonimos, type GrupoSinonimo, type Vocablo } from "../../../modules/arancel/sinonimos.ts";
import { normalizar } from "../../../modules/iva/normalizar.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

const lista = (v: FormDataEntryValue | null) => String(v ?? "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
interface CasoDeteccion { descripcion: string; esperado: { prefijo?: string; estado?: string } }

export async function accionAgregarSinonimo(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  let u;
  try { u = await usuarioConPermiso("arancel.editar"); } catch (e) { return { error: e instanceof SinPermiso ? e.message : "Sin permiso" }; }
  const grupo = String(form.get("grupo") ?? "").trim();
  // Los términos se normalizan (minúsculas, sin acentos); " ... " admite palabras intermedias
  const terminos = lista(form.get("terminos")).map((t) => t.split(" ... ").map(normalizar).join(" ... "));
  const excluir = lista(form.get("excluir")).map(normalizar);
  const prefijos = lista(form.get("prefijos")).map((p) => p.replace(/\D/g, ""));
  const prioridad = Number(form.get("prioridad") ?? 55);
  const nota = String(form.get("nota") ?? "").trim() || null;
  if (grupo.length < 3) return { error: "Escribe el nombre del grupo (p. ej. «máquina de coser»)" };
  if (terminos.length === 0 || terminos.some((t) => t.length < 2)) return { error: "Escribe al menos un término comercial" };
  if (prefijos.length === 0 || prefijos.some((p) => !/^\d{4,10}$/.test(p))) return { error: "Los prefijos arancelarios deben tener de 4 a 10 dígitos" };
  if (!Number.isInteger(prioridad) || prioridad < 1 || prioridad > 100) return { error: "La prioridad debe estar entre 1 y 100" };

  const faltan = await consulta<{ prefijo: string }>(
    `SELECT p AS prefijo FROM unnest($1::text[]) p WHERE NOT EXISTS (SELECT 1 FROM arancel.subpartida s WHERE s.es_terminal AND s.codigo LIKE p || '%')`, [prefijos]);
  if (faltan.length) return { error: `Sin subpartidas declarables en el arancel vigente: ${faltan.map((f) => f.prefijo).join(", ")}` };
  const actuales = await consulta<GrupoSinonimo & Record<string, unknown>>("SELECT grupo, terminos, excluir, prefijos, categorias_off, prioridad, nota FROM arancel.sinonimo ORDER BY id");
  if (actuales.some((g) => g.grupo.toLowerCase() === grupo.toLowerCase())) return { error: "Ya existe un grupo con ese nombre" };
  const repetidos = terminos.filter((t) => actuales.some((g) => g.terminos.includes(t)));
  if (repetidos.length) return { error: `Estos términos ya están en otro grupo: ${repetidos.join(", ")}` };

  const nuevo: GrupoSinonimo = { grupo, terminos, excluir, prefijos, categorias_off: [], prioridad, nota };
  const vocabulario = await consulta<Vocablo & Record<string, unknown>>("SELECT comercial, oficial FROM arancel.vocabulario");
  const sin = compilarSinonimos([...actuales, nuevo], vocabulario);
  const casos = (await consulta<{ caso: CasoDeteccion }>("SELECT caso FROM arancel.caso_deteccion ORDER BY orden")).map((f) => f.caso);
  const fallos: string[] = [];
  for (const c of casos) {
    const r = await ejecutarDeteccion(consulta, sin, { descripcion: c.descripcion, codigo: null, limite: 5 }, null);
    const primero = r.candidatos[0]?.codigo;
    if ((c.esperado.prefijo && !primero?.startsWith(c.esperado.prefijo)) || (c.esperado.estado && r.estado !== c.esperado.estado)) fallos.push(`«${c.descripcion}»`);
  }
  if (fallos.length) return { error: `El grupo nuevo cambia ${fallos.length} casos de referencia de la detección: ${fallos.slice(0, 4).join(", ")}` };

  const cx = await pool().connect();
  try {
    await cx.query("BEGIN");
    const { rows: [g] } = await cx.query<{ id: number }>(
      `INSERT INTO arancel.sinonimo (grupo, terminos, excluir, prefijos, prioridad, nota, origen, creado_por, creado_en)
       VALUES ($1, $2, $3, $4, $5, $6, 'panel', $7, now()) RETURNING id`, [grupo, terminos, excluir, prefijos, prioridad, nota, u.correo]);
    const { rows: [v] } = await cx.query<{ version: string }>("SELECT version FROM arancel.sinonimo_version ORDER BY cargado_en DESC LIMIT 1");
    await cx.query("INSERT INTO arancel.sinonimo_version (version) VALUES ($1)", [`${(v?.version ?? "panel").split("+")[0]}+p${g.id}`]);
    await cx.query("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'arancel.sinonimo.crear', $2)", [u.correo, { grupo, terminos, prefijos, prioridad }]);
    await cx.query("COMMIT");
  } catch (e) {
    await cx.query("ROLLBACK").catch(() => {});
    console.error("[el-renglon] sinónimo:", e);
    return { error: "No se pudo guardar el grupo" };
  } finally { cx.release(); }
  invalidarSinonimos();
  revalidatePath("/admin/arancel");
  return { ok: `Grupo «${grupo}» agregado. Los ${casos.length} casos de referencia de la detección siguen correctos.` };
}

export async function accionEliminarSinonimo(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("arancel.editar");
    const [g] = await consulta<{ grupo: string }>("DELETE FROM arancel.sinonimo WHERE id = $1 AND origen = 'panel' RETURNING grupo", [Number(form.get("id"))]);
    if (!g) return { error: "Solo se pueden quitar los grupos agregados en el panel" };
    await consulta("INSERT INTO arancel.sinonimo_version (version) SELECT split_part(version, '+', 1) || '+d' || extract(epoch FROM now())::bigint FROM arancel.sinonimo_version ORDER BY cargado_en DESC LIMIT 1");
    await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'arancel.sinonimo.eliminar', $2)", [u.correo, { grupo: g.grupo }]);
    invalidarSinonimos();
    revalidatePath("/admin/arancel");
    return { ok: `Grupo «${g.grupo}» quitado` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    return { error: "No se pudo quitar el grupo" };
  }
}
