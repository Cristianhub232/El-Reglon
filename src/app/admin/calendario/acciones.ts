"use server";
// Días inhábiles agregados desde el panel (días no laborables decretados, feriados bancarios de SUDEBAN).
// Cada cambio recalcula las prórrogas del COT art. 10 en la misma transacción.
import { revalidatePath } from "next/cache";
import { pool } from "../../../core/db.ts";
import { SinPermiso, usuarioConPermiso } from "../../../core/auth/dal.ts";
import type { EstadoAccion } from "../../../ui/admin/FormAccion.tsx";

async function enTransaccion<T>(f: (q: (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) => Promise<T>): Promise<T> {
  const c = await pool().connect();
  try { await c.query("BEGIN"); const r = await f((sql, p) => c.query(sql, p)); await c.query("COMMIT"); return r; }
  catch (e) { await c.query("ROLLBACK").catch(() => {}); throw e; } finally { c.release(); }
}

export async function accionAgregarInhabil(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("calendario.editar");
    const fecha = String(form.get("fecha") ?? ""), descripcion = String(form.get("descripcion") ?? "").trim();
    const tipo = String(form.get("tipo") ?? ""), base = String(form.get("base_legal") ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return { error: "Indica la fecha" };
    if (descripcion.length < 3) return { error: "Describe el día (p. ej. «Día no laborable por decreto»)" };
    if (tipo !== "NACIONAL" && tipo !== "BANCARIO") return { error: "Elige el tipo" };
    if (base.length < 5) return { error: "Indica la base legal (decreto, Gaceta o calendario de SUDEBAN)" };
    const n = await enTransaccion(async (q) => {
      const { rows } = await q("SELECT 1 FROM calendario.dia_inhabil WHERE fecha = $1", [fecha]);
      if (rows.length) throw new Error("existe");
      await q(`INSERT INTO calendario.dia_inhabil (fecha, descripcion, tipo, base_legal, origen, agregado_por, agregado_en)
               VALUES ($1, $2, $3, $4, 'panel', $5, now())`, [fecha, descripcion, tipo, base, u.correo]);
      const { rows: [r] } = await q("SELECT calendario.recalcular_prorrogas() AS n");
      await q("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'calendario.inhabil.crear', $2)",
        [u.correo, { fecha, descripcion, tipo, base_legal: base, vencimientos: r.n }]);
      return Number(r.n);
    });
    revalidatePath("/admin/calendario");
    return { ok: `Día inhábil agregado. ${n ? `Se recalcularon ${n} vencimientos (COT art. 10).` : "Ningún vencimiento cambió."}` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    if ((e as Error).message === "existe") return { error: "Esa fecha ya es un día inhábil" };
    console.error("[el-renglon] calendario:", e);
    return { error: "No se pudo agregar el día" };
  }
}

export async function accionQuitarInhabil(_p: EstadoAccion, form: FormData): Promise<EstadoAccion> {
  try {
    const u = await usuarioConPermiso("calendario.editar");
    const fecha = String(form.get("fecha") ?? "");
    const n = await enTransaccion(async (q) => {
      // Solo los agregados en el panel: los de la semilla se corrigen en datos/calendario y se recargan
      const { rows: [d] } = await q("DELETE FROM calendario.dia_inhabil WHERE fecha = $1 AND origen = 'panel' RETURNING descripcion", [fecha]);
      if (!d) throw new Error("semilla");
      const { rows: [r] } = await q("SELECT calendario.recalcular_prorrogas() AS n");
      await q("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ($1, 'calendario.inhabil.eliminar', $2)",
        [u.correo, { fecha, descripcion: d.descripcion, vencimientos: r.n }]);
      return Number(r.n);
    });
    revalidatePath("/admin/calendario");
    return { ok: `Día quitado. ${n ? `Se recalcularon ${n} vencimientos.` : ""}` };
  } catch (e) {
    if (e instanceof SinPermiso) return { error: e.message };
    if ((e as Error).message === "semilla") return { error: "Solo se pueden quitar los días agregados en el panel" };
    console.error("[el-renglon] calendario:", e);
    return { error: "No se pudo quitar el día" };
  }
}
