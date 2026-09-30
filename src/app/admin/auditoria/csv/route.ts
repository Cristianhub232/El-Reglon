// CSV de la auditoría con los mismos filtros de la página (hasta 50.000 eventos). Requiere sesión con acceso a auditoría.
import { usuarioActual } from "../../../../core/auth/dal.ts";
import { puedeVer } from "../../../../core/auth/roles.ts";
import { eventos } from "../../../../modules/admin/auditoria.ts";
import { CATEGORIAS, describir, type Categoria } from "../../../../ui/admin/eventos.ts";

export const dynamic = "force-dynamic";

// Comillas dobles y neutralización de fórmulas (celdas que empiezan con = + - @ en hojas de cálculo)
const celda = (v: string) => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;

export async function GET(req: Request) {
  const u = await usuarioActual();
  if (!u || u.debe_cambiar_clave || !puedeVer(u.rol, "auditoria")) return new Response("No autorizado", { status: 403 });
  const url = new URL(req.url);
  const c = url.searchParams.get("cat");
  const { filas } = await eventos(c && c in CATEGORIAS ? (c as Categoria) : null, (url.searchParams.get("q") ?? "").slice(0, 100), 1, 50_000);
  const lineas = ["fecha,actor,accion,descripcion,detalle_json", ...filas.map((f) =>
    [new Date(f.ocurrido_en).toISOString(), f.actor, f.accion, describir(f.accion, f.detalle), JSON.stringify(f.detalle)].map(celda).join(","))];
  return new Response("﻿" + lineas.join("\r\n") + "\r\n", {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="auditoria-el-renglon-${new Date().toISOString().slice(0, 10)}.csv"`, "cache-control": "no-store" },
  });
}
